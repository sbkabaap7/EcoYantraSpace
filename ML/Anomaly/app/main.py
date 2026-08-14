"""EcoSphere: explainable, persistent IoT anomaly detection for energy telemetry."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from math import cos, pi, sin
from pathlib import Path
from statistics import median
from typing import Literal
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sklearn.ensemble import IsolationForest


ROOT = Path(__file__).resolve().parent
DATABASE = Path(os.getenv("ECOSPHERE_DB", ROOT.parent / "data" / "ecospherai.db"))
MAX_PAYLOAD_BYTES = 16_384
MAX_HISTORY = 96
DEFAULT_RANGES = {"17": (480.0, 530.0), "08": (580.0, 640.0), "31": (70.0, 95.0)}
DEVICE_PROFILES = {
    "17": ("Campus HVAC Hub", "Building energy", "North Campus", 480.0, 530.0, 0.72),
    "08": ("Solar Array East", "Renewable generation", "East Field", 580.0, 640.0, 0.00),
    "31": ("Water Treatment Plant", "Water infrastructure", "River District", 70.0, 95.0, 0.65),
    "04": ("Wind Farm Gateway", "Renewable generation", "Coastal Ridge", 160.0, 240.0, 0.00),
    "05": ("Green Office Tower", "Building energy", "Central Business District", 250.0, 360.0, 0.72),
    "07": ("Cold Storage Facility", "Cold chain", "Food Logistics Park", 400.0, 470.0, 0.72),
    "09": ("Community Battery", "Energy storage", "West Grid", 350.0, 410.0, 0.42),
    "12": ("Smart Streetlights", "Public infrastructure", "City Centre", 35.0, 70.0, 0.72),
    "14": ("EV Charging Plaza", "Electric mobility", "Transit Hub", 120.0, 250.0, 0.72),
    "21": ("Irrigation Pump Station", "Agriculture", "Greenbelt Farm", 90.0, 145.0, 0.65),
    "26": ("Vertical Farm Zone", "Urban agriculture", "Innovation Quarter", 50.0, 95.0, 0.72),
    "33": ("Biogas Recovery Unit", "Waste-to-energy", "Circularity Centre", 130.0, 190.0, 0.18),
}
DEFAULT_RANGES = {device_id: (profile[3], profile[4]) for device_id, profile in DEVICE_PROFILES.items()}


class ReadingIn(BaseModel):
    """A single cumulative or interval energy value from an IoT device."""
    model_config = ConfigDict(extra="forbid")
    device_id: str = Field(min_length=1, max_length=64, examples=["17"])
    energy_kwh: float = Field(ge=0, le=100_000, examples=[4820])
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    message_id: str | None = Field(default=None, max_length=128, description="Unique ID from the device gateway")
    temperature: float | None = Field(default=None, ge=-80, le=150)
    voltage: float | None = Field(default=None, ge=0, le=1_000)
    current: float | None = Field(default=None, ge=0, le=10_000)
    user_id: str | None = Field(default=None, max_length=128)

    @field_validator("timestamp")
    @classmethod
    def timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone, for example 2026-08-08T10:00:00Z")
        return value.astimezone(timezone.utc)


class ExpectedRange(BaseModel):
    min: float
    max: float


class Signal(BaseModel):
    name: str
    value: float
    contribution: float
    interpretation: str


class AlertOut(BaseModel):
    alert_id: str
    device_id: str
    status: Literal["NORMAL", "ANOMALY"]
    severity: Literal["LOW", "MEDIUM", "HIGH"]
    score: float
    expected_range: ExpectedRange
    observed: float
    reasons: list[str]
    signals: list[Signal]
    recommended_action: str
    timestamp: datetime


class AuditLog(BaseModel):
    audit_id: str
    device_id: str
    user_id: str | None
    event_type: str
    severity: str
    score: float
    timestamp: datetime
    action: str
    result: str


class DeviceOut(BaseModel):
    device_id: str
    name: str
    asset_type: str
    location: str
    expected_range: ExpectedRange
    readings_seen: int
    latest_energy_kwh: float | None


class TimelinePoint(BaseModel):
    timestamp: datetime
    energy_kwh: float
    lower_bound: float
    upper_bound: float
    status: Literal["NORMAL", "ANOMALY"]
    score: float


class DashboardOut(BaseModel):
    device: DeviceOut
    timeline: list[TimelinePoint]
    alerts: list[AlertOut]
    anomaly_rate: float
    emissions_at_risk_kg: float
    period_hours: int


@contextmanager
def db_connection():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def initialise_database() -> None:
    with db_connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS readings (
          id TEXT PRIMARY KEY, device_id TEXT NOT NULL, message_id TEXT, timestamp TEXT NOT NULL,
          energy_kwh REAL NOT NULL, temperature REAL, voltage REAL, current REAL,
          score REAL NOT NULL, status TEXT NOT NULL, expected_min REAL NOT NULL, expected_max REAL NOT NULL,
          reasons TEXT NOT NULL, signals TEXT NOT NULL, payload_hash TEXT NOT NULL UNIQUE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_message ON readings(device_id, message_id) WHERE message_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_readings_device_time ON readings(device_id, timestamp DESC);
        CREATE TABLE IF NOT EXISTS alerts (
          alert_id TEXT PRIMARY KEY, reading_id TEXT NOT NULL, device_id TEXT NOT NULL, timestamp TEXT NOT NULL,
          severity TEXT NOT NULL, score REAL NOT NULL, payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_device_time ON alerts(device_id, timestamp DESC);
        CREATE TABLE IF NOT EXISTS audit_logs (
          audit_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, user_id TEXT, event_type TEXT NOT NULL,
          severity TEXT NOT NULL, score REAL NOT NULL, timestamp TEXT NOT NULL, action TEXT NOT NULL, result TEXT NOT NULL
        );
        """)


def seed_sustainability_demo() -> None:
    """Create a credible 30-day demo history once, without touching real telemetry."""
    rng = np.random.default_rng(20260808)
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(days=30)
    with db_connection() as db:
        for device_id, profile in DEVICE_PROFILES.items():
            existing = db.execute("SELECT COUNT(*) AS count FROM readings WHERE device_id=?", (device_id,)).fetchone()["count"]
            if existing >= 120:
                continue
            low, high, factor = profile[3], profile[4], profile[5]
            centre, amplitude = (low + high) / 2, (high - low) * 0.28
            for point in range(180):  # 30 days at four-hour intervals
                timestamp = start + timedelta(hours=point * 4)
                daily_cycle = sin(2 * pi * (timestamp.hour - 6) / 24)
                weekly_cycle = sin(2 * pi * point / 42)
                energy = centre + amplitude * daily_cycle + amplitude * 0.25 * weekly_cycle + rng.normal(0, amplitude * 0.12)
                is_anomaly = point in (47, 113, 169)
                if is_anomaly:
                    energy = high * (1.35 if device_id in {"07", "17"} else 1.18)
                energy = round(max(0, energy), 2)
                status, score = ("ANOMALY", 0.89) if is_anomaly else ("NORMAL", round(float(rng.uniform(0.04, 0.31)), 2))
                timestamp_text, reading_id = timestamp.isoformat(), f"seed-v1-{device_id}-{point}"
                reasons = ["scheduled demo anomaly: unexpected energy deviation"] if is_anomaly else ["within learned operating behaviour"]
                signals = ([{"name": "forecast residual", "value": 4.2, "contribution": 0.89,
                             "interpretation": "Generated anomaly for sustainability dashboard demonstration."}] if is_anomaly else [])
                payload_hash = hashlib.sha256(reading_id.encode()).hexdigest()
                db.execute("INSERT OR IGNORE INTO readings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (reading_id, device_id, reading_id, timestamp_text, energy, None, None, None, score, status, low, high,
                            json.dumps(reasons), json.dumps(signals), payload_hash))
                if is_anomaly:
                    alert_id = f"seed-alert-v1-{device_id}-{point}"
                    alert_payload = {"alert_id": alert_id, "device_id": device_id, "status": "ANOMALY", "severity": "HIGH",
                                     "score": score, "expected_range": {"min": low, "max": high}, "observed": energy,
                                     "reasons": reasons, "signals": signals,
                                     "recommended_action": "Review the asset operating state and compare with local weather or load conditions.",
                                     "timestamp": timestamp_text}
                    db.execute("INSERT OR IGNORE INTO alerts VALUES (?, ?, ?, ?, ?, ?, ?)",
                               (alert_id, reading_id, device_id, timestamp_text, "HIGH", score, json.dumps(alert_payload)))


class HybridDetector:
    """Rules + robust device baseline + Isolation Forest, with human-readable evidence."""
    def __init__(self) -> None:
        rng = np.random.default_rng(42)
        # Model sees normalized behaviour, so its learned notion of normal works across devices.
        normal = np.column_stack((rng.normal(0, 0.75, 3000), rng.normal(0, 0.65, 3000),
                                  rng.normal(0, 0.8, 3000), rng.normal(0, 0.45, 3000),
                                  rng.uniform(-1, 1, 3000), rng.uniform(-1, 1, 3000)))
        self.model = IsolationForest(n_estimators=200, contamination=0.02, random_state=42)
        self.model.fit(normal)

    def history(self, device_id: str) -> list[float]:
        with db_connection() as db:
            rows = db.execute("SELECT energy_kwh FROM readings WHERE device_id=? ORDER BY timestamp DESC LIMIT ?",
                              (device_id, MAX_HISTORY)).fetchall()
        return [float(row["energy_kwh"]) for row in reversed(rows)]

    def baseline(self, device_id: str, values: list[float]) -> tuple[float, float, float, float]:
        if device_id in DEFAULT_RANGES:
            low, high = DEFAULT_RANGES[device_id]
            return (low, high, (low + high) / 2, max((high - low) / 6, 1.0))
        if len(values) >= 12:
            centre = median(values)
            mad = median([abs(v - centre) for v in values]) or max(centre * 0.02, 1.0)
            robust_std = 1.4826 * mad
            return (max(0, centre - 3 * robust_std), centre + 3 * robust_std, centre, robust_std)
        return (0.0, 1_000.0, 500.0, 166.67)

    def evaluate(self, reading: ReadingIn, replayed: bool) -> tuple[float, list[str], list[Signal], ExpectedRange]:
        values = self.history(reading.device_id)
        low, high, centre, spread = self.baseline(reading.device_id, values)
        previous = values[-1] if values else centre
        residual_z = abs(reading.energy_kwh - centre) / spread
        delta_z = abs(reading.energy_kwh - previous) / spread
        hour = reading.timestamp.hour
        features = np.array([[(reading.energy_kwh - centre) / spread, (reading.energy_kwh - previous) / spread,
                              residual_z, 0.0 if len(values) < 2 else (previous - values[-2]) / spread,
                              sin(2 * pi * hour / 24), cos(2 * pi * hour / 24)]])
        forest_raw = -float(self.model.decision_function(features)[0])
        ml_score = float(np.clip((forest_raw + 0.15) / 0.50, 0, 1))
        reasons: list[str] = []
        signals: list[Signal] = []
        score = 0.0
        if reading.energy_kwh < low or reading.energy_kwh > high:
            distance = max(reading.energy_kwh - high, low - reading.energy_kwh, 0) / max(high - low, 1)
            contribution = min(0.97, 0.62 + 0.18 * distance)
            score = max(score, contribution)
            reasons.append("outside the device-specific expected range")
            signals.append(Signal(name="range breach", value=round(distance, 2), contribution=round(contribution, 2),
                                  interpretation="Observed energy is beyond the learned operating envelope."))
        if residual_z >= 3:
            contribution = min(0.92, 0.58 + residual_z / 20)
            score = max(score, contribution)
            reasons.append("forecast residual is unusually large")
            signals.append(Signal(name="forecast residual", value=round(residual_z, 2), contribution=round(contribution, 2),
                                  interpretation="The reading differs sharply from the device baseline."))
        if values and delta_z >= 4:
            contribution = min(0.88, 0.56 + delta_z / 25)
            score = max(score, contribution)
            reasons.append("sudden rate-of-change spike")
            signals.append(Signal(name="rate of change", value=round(delta_z, 2), contribution=round(contribution, 2),
                                  interpretation="The change from the previous reading is implausibly fast."))
        if replayed:
            score = max(score, 0.91)
            reasons.append("replayed or duplicate gateway message")
            signals.append(Signal(name="replay risk", value=1, contribution=0.91,
                                  interpretation="The message identifier or payload was previously received."))
        if ml_score >= 0.60:
            score = max(score, ml_score)
            reasons.append("unusual multivariate telemetry pattern")
            signals.append(Signal(name="ML isolation score", value=round(ml_score, 2), contribution=round(ml_score, 2),
                                  interpretation="Isolation Forest found this combination unlike normal behaviour."))
        if not reasons:
            reasons.append("within learned operating behaviour")
        return round(min(score, 0.99), 2), reasons, signals, ExpectedRange(min=round(low, 2), max=round(high, 2))


detector = HybridDetector()
app = FastAPI(title="EcoSphere Sentinel API", version="2.0.0", description="Explainable anomaly intelligence for IoT telemetry.")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
                   allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup() -> None:
    initialise_database()
    if os.getenv("SEED_DEMO_DATA", "true").lower() == "true":
        seed_sustainability_demo()


@app.middleware("http")
async def limit_payload_size(request: Request, call_next):
    if int(request.headers.get("content-length", "0")) > MAX_PAYLOAD_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Payload too large"})
    return await call_next(request)


def severity_for(score: float) -> Literal["LOW", "MEDIUM", "HIGH"]:
    return "HIGH" if score >= 0.85 else "MEDIUM" if score >= 0.60 else "LOW"


def action_for(severity: str) -> str:
    return {"HIGH": "Isolate the device if safety permits; verify sensor integrity and inspect gateway logs.",
            "MEDIUM": "Review recent telemetry and confirm the device operating state.",
            "LOW": "Continue monitoring; no action required."}[severity]


def save_audit(device_id: str, user_id: str | None, event_type: str, severity: str, score: float, action: str, result: str, timestamp: datetime) -> None:
    with db_connection() as db:
        db.execute("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   (str(uuid4()), device_id, user_id, event_type, severity, score, timestamp.isoformat(), action, result))


@app.get("/", include_in_schema=False)
def dashboard_page() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "EcoSphere Sentinel", "storage": "sqlite"}


@app.post("/api/v1/iot/readings", response_model=AlertOut, status_code=201)
def ingest_reading(reading: ReadingIn) -> AlertOut:
    initialise_database()
    payload = reading.model_dump(mode="json")
    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    with db_connection() as db:
        replayed = bool(reading.message_id and db.execute("SELECT 1 FROM readings WHERE device_id=? AND message_id=?",
                                                          (reading.device_id, reading.message_id)).fetchone())
        replayed = replayed or bool(db.execute("SELECT 1 FROM readings WHERE payload_hash=?", (payload_hash,)).fetchone())
    score, reasons, signals, expected = detector.evaluate(reading, replayed)
    severity = severity_for(score)
    anomaly = score >= 0.60
    alert = AlertOut(alert_id=str(uuid4()), device_id=reading.device_id, status="ANOMALY" if anomaly else "NORMAL",
                     severity=severity, score=score, expected_range=expected, observed=reading.energy_kwh,
                     reasons=reasons, signals=signals, recommended_action=action_for(severity), timestamp=reading.timestamp)
    reading_id = str(uuid4())
    with db_connection() as db:
        # A replay is retained as an alert/audit event but not reinserted into the telemetry series.
        # This keeps the chart and adaptive baseline resistant to duplicate gateway traffic.
        if not replayed:
            db.execute("INSERT INTO readings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                       (reading_id, reading.device_id, reading.message_id, reading.timestamp.isoformat(), reading.energy_kwh,
                        reading.temperature, reading.voltage, reading.current, score, alert.status, expected.min, expected.max,
                        json.dumps(reasons), json.dumps([s.model_dump() for s in signals]), payload_hash))
        if anomaly:
            db.execute("INSERT INTO alerts VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (alert.alert_id, reading_id, reading.device_id, reading.timestamp.isoformat(), severity, score,
                        json.dumps(alert.model_dump(mode="json"))))
    save_audit(reading.device_id, reading.user_id, "TELEMETRY_ANOMALY" if anomaly else "TELEMETRY_INGESTED",
               severity, score, "INVESTIGATE_DEVICE" if anomaly else "NONE", alert.status, reading.timestamp)
    return alert


@app.get("/api/v1/security/alerts", response_model=list[AlertOut])
def list_alerts(device_id: str | None = None, severity: Literal["LOW", "MEDIUM", "HIGH"] | None = None) -> list[AlertOut]:
    initialise_database()
    query, params = "SELECT payload FROM alerts WHERE 1=1", []
    if device_id: query, params = query + " AND device_id=?", params + [device_id]
    if severity: query, params = query + " AND severity=?", params + [severity]
    query += " ORDER BY timestamp DESC LIMIT 200"
    with db_connection() as db: rows = db.execute(query, params).fetchall()
    return [AlertOut.model_validate_json(row["payload"]) for row in rows]


@app.get("/api/v1/security/alerts/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: str) -> AlertOut:
    with db_connection() as db: row = db.execute("SELECT payload FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
    if not row: raise HTTPException(404, "Alert not found")
    return AlertOut.model_validate_json(row["payload"])


@app.get("/api/v1/audit-logs", response_model=list[AuditLog])
def list_audit_logs(device_id: str | None = None) -> list[AuditLog]:
    with db_connection() as db:
        rows = db.execute("SELECT * FROM audit_logs WHERE (? IS NULL OR device_id=?) ORDER BY timestamp DESC LIMIT 500",
                          (device_id, device_id)).fetchall()
    return [AuditLog(**dict(row)) for row in rows]


@app.get("/api/v1/devices", response_model=list[DeviceOut])
def list_devices() -> list[DeviceOut]:
    seed_sustainability_demo()
    with db_connection() as db:
        rows = db.execute("SELECT device_id, COUNT(*) count, MAX(timestamp) latest FROM readings GROUP BY device_id").fetchall()
    devices = {row["device_id"]: row for row in rows}
    for device_id in DEVICE_PROFILES:
        devices.setdefault(device_id, None)
    result = []
    for device_id, row in devices.items():
        values = detector.history(device_id); low, high, _, _ = detector.baseline(device_id, values)
        profile = DEVICE_PROFILES.get(device_id, (f"Device {device_id}", "Telemetry", "Unassigned", low, high, 0.72))
        result.append(DeviceOut(device_id=device_id, name=profile[0], asset_type=profile[1], location=profile[2],
                                expected_range=ExpectedRange(min=round(low, 2), max=round(high, 2)),
                                readings_seen=0 if row is None else row["count"], latest_energy_kwh=values[-1] if values else None))
    return sorted(result, key=lambda d: d.device_id)


@app.get("/api/v1/dashboard", response_model=DashboardOut)
def dashboard(device_id: str = "17", hours: int = Query(168, ge=1, le=720)) -> DashboardOut:
    initialise_database(); seed_sustainability_demo(); since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    with db_connection() as db:
        rows = db.execute("SELECT * FROM readings WHERE device_id=? AND timestamp>=? ORDER BY timestamp", (device_id, since)).fetchall()
    values = detector.history(device_id); low, high, _, _ = detector.baseline(device_id, values)
    timeline = [TimelinePoint(timestamp=datetime.fromisoformat(r["timestamp"]), energy_kwh=r["energy_kwh"], lower_bound=r["expected_min"],
                              upper_bound=r["expected_max"], status=r["status"], score=r["score"]) for r in rows]
    alert_list = list_alerts(device_id=device_id)
    profile = DEVICE_PROFILES.get(device_id, (f"Device {device_id}", "Telemetry", "Unassigned", low, high, 0.72))
    emissions_at_risk = sum(max(point.energy_kwh - point.upper_bound, 0) * profile[5] for point in timeline if point.status == "ANOMALY")
    return DashboardOut(device=DeviceOut(device_id=device_id, name=profile[0], asset_type=profile[1], location=profile[2],
                                           expected_range=ExpectedRange(min=round(low, 2), max=round(high, 2)),
                                           readings_seen=len(values), latest_energy_kwh=values[-1] if values else None),
                        timeline=timeline, alerts=alert_list[:10], anomaly_rate=round(sum(p.status == "ANOMALY" for p in timeline) / max(len(timeline), 1), 3),
                        emissions_at_risk_kg=round(emissions_at_risk, 1), period_hours=hours)


@app.post("/api/v1/demo/attack", response_model=AlertOut, status_code=201, summary="Inject an asset-specific anomaly scenario")
def run_attack_demo(device_id: str = "17") -> AlertOut:
    """Inject a safe anomaly for the requested demo asset; Device #17 keeps the brief's 4,820 kWh scenario."""
    if device_id not in DEVICE_PROFILES:
        raise HTTPException(404, "Unknown demo asset")
    profile = DEVICE_PROFILES[device_id]
    observed = 4820 if device_id == "17" else round(profile[4] * 1.85, 2)
    return ingest_reading(ReadingIn(device_id=device_id, energy_kwh=observed, timestamp=datetime.now(timezone.utc),
                                    message_id=f"demo-attack-{device_id}-{uuid4()}", user_id="demo-simulator"))


@app.post("/api/v1/demo/reset", summary="Remove simulated events and restore the seeded demonstration state")
def reset_demo_events() -> dict[str, int]:
    """Deletes only events created by the dashboard simulator; seeded history and real readings stay intact."""
    with db_connection() as db:
        rows = db.execute("SELECT id FROM readings WHERE message_id LIKE 'demo-attack-%'").fetchall()
        reading_ids = [row["id"] for row in rows]
        if reading_ids:
            placeholders = ",".join("?" for _ in reading_ids)
            db.execute(f"DELETE FROM alerts WHERE reading_id IN ({placeholders})", reading_ids)
        db.execute("DELETE FROM readings WHERE message_id LIKE 'demo-attack-%'")
        db.execute("DELETE FROM audit_logs WHERE user_id='demo-simulator'")
    return {"removed_simulated_events": len(reading_ids)}
