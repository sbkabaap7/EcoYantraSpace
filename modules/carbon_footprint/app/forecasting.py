from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from app.config import DATA_PATH, MODEL_PATH
from app.emissions import get_emission_factor
from app.schemas import Scenario


FEATURES = [
    "hour_sin",
    "hour_cos",
    "dow",
    "is_weekend",
    "lag_1h",
    "lag_24h",
    "lag_168h",
    "roll_24h_mean",
    "roll_24h_std",
    "temperature_c",
    "solar_kwh",
    "wind_kwh",
]
REQUIRED_COLUMNS = {"timestamp", "energy_kwh", "temperature_c", "solar_kwh", "wind_kwh"}


@dataclass(frozen=True)
class ModelArtifact:
    model_name: str
    features: list[str]
    coefficients: np.ndarray
    intercept: float
    feature_mean: np.ndarray
    feature_scale: np.ndarray
    residual_lower: float
    residual_upper: float
    blend_model_weight: float


def _normalise_history(data: pd.DataFrame) -> pd.DataFrame:
    missing = REQUIRED_COLUMNS - set(data.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")
    frame = data[list(REQUIRED_COLUMNS)].copy()
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True, errors="raise")
    for column in REQUIRED_COLUMNS - {"timestamp"}:
        frame[column] = pd.to_numeric(frame[column], errors="raise")
    frame = frame.sort_values("timestamp").drop_duplicates("timestamp", keep="last").reset_index(drop=True)
    if len(frame) < 168:
        raise ValueError("At least 168 hourly observations are required")
    if (frame[["energy_kwh", "solar_kwh", "wind_kwh"]] < 0).any().any():
        raise ValueError("Energy, solar and wind values cannot be negative")
    return frame


class ForecastService:
    def __init__(self, model_path: str | Path = MODEL_PATH, data_path: str | Path = DATA_PATH) -> None:
        artifact_raw = json.loads(Path(model_path).read_text(encoding="utf-8"))
        self.artifact = ModelArtifact(
            model_name=artifact_raw["model_name"],
            features=artifact_raw["features"],
            coefficients=np.asarray(artifact_raw["coefficients"], dtype=float),
            intercept=float(artifact_raw["intercept"]),
            feature_mean=np.asarray(artifact_raw["feature_mean"], dtype=float),
            feature_scale=np.asarray(artifact_raw["feature_scale"], dtype=float),
            residual_lower=float(artifact_raw["residual_quantiles"]["lower"]),
            residual_upper=float(artifact_raw["residual_quantiles"]["upper"]),
            blend_model_weight=float(artifact_raw.get("blend_model_weight", 1.0)),
        )
        self.history = _normalise_history(pd.read_csv(data_path))
        if self.artifact.features != FEATURES:
            raise ValueError("Model feature order does not match API feature pipeline")

    def _predict_energy(self, row: dict[str, float]) -> float:
        x = np.asarray([row[name] for name in self.artifact.features], dtype=float)
        scaled = (x - self.artifact.feature_mean) / self.artifact.feature_scale
        regression = float(self.artifact.intercept + scaled @ self.artifact.coefficients)
        seasonal = 0.65 * row["lag_24h"] + 0.35 * row["lag_168h"]
        weight = self.artifact.blend_model_weight
        return max(0.0, weight * regression + (1 - weight) * seasonal)

    @staticmethod
    def _future_conditions_lookup(conditions: Iterable[dict] | None) -> dict[pd.Timestamp, tuple[float, float, float]]:
        lookup: dict[pd.Timestamp, tuple[float, float, float]] = {}
        for item in conditions or []:
            ts = pd.Timestamp(item["timestamp"])
            ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
            lookup[ts.floor("h")] = (
                float(item["temperature_c"]),
                float(item["solar_kwh"]),
                float(item["wind_kwh"]),
            )
        return lookup

    @staticmethod
    def _climatology(history: pd.DataFrame, ts: pd.Timestamp) -> tuple[float, float, float]:
        matching = history[
            (history["timestamp"].dt.hour == ts.hour)
            & (history["timestamp"].dt.dayofweek == ts.dayofweek)
        ]
        if matching.empty:
            matching = history[history["timestamp"].dt.hour == ts.hour]
        return tuple(
            float(matching[column].tail(12).median())
            for column in ("temperature_c", "solar_kwh", "wind_kwh")
        )

    def forecast(
        self,
        hours: int,
        scenario: Scenario | None = None,
        history: pd.DataFrame | None = None,
        future_conditions: Iterable[dict] | None = None,
    ) -> dict:
        scenario = scenario or Scenario()
        history_frame = self.history if history is None else _normalise_history(history)
        energy = history_frame["energy_kwh"].astype(float).tolist()
        last_ts = pd.Timestamp(history_frame["timestamp"].iloc[-1]).tz_convert("UTC")
        supplied_conditions = self._future_conditions_lookup(future_conditions)
        factor_info = get_emission_factor(scenario.region, scenario.custom_factor_kg_per_kwh)
        base_factor = float(factor_info["factor_kg_per_kwh"])
        efficiency_multiplier = 1 - scenario.efficiency_percent / 100
        renewable_multiplier = 1 + scenario.renewable_growth_percent / 100
        results: list[dict] = []

        for step in range(1, hours + 1):
            ts = last_ts + pd.Timedelta(hours=step)
            temperature, solar, wind = supplied_conditions.get(ts, self._climatology(history_frame, ts))
            temperature += scenario.temperature_delta_c
            solar = max(0.0, solar * renewable_multiplier)
            wind = max(0.0, wind * renewable_multiplier)
            recent_24 = np.asarray(energy[-24:], dtype=float)
            features = {
                "hour_sin": float(np.sin(2 * np.pi * ts.hour / 24)),
                "hour_cos": float(np.cos(2 * np.pi * ts.hour / 24)),
                "dow": float(ts.dayofweek),
                "is_weekend": float(ts.dayofweek >= 5),
                "lag_1h": energy[-1],
                "lag_24h": energy[-24],
                "lag_168h": energy[-168],
                "roll_24h_mean": float(recent_24.mean()),
                "roll_24h_std": float(recent_24.std(ddof=0)),
                "temperature_c": temperature,
                "solar_kwh": solar,
                "wind_kwh": wind,
            }
            predicted = self._predict_energy(features) * efficiency_multiplier
            horizon_scale = min(1.8, 1 + 0.35 * np.sqrt((step - 1) / 24))
            lower = max(0.0, predicted + self.artifact.residual_lower * horizon_scale)
            upper = max(lower, predicted + self.artifact.residual_upper * horizon_scale)
            renewable_share = min(1.0, (solar + wind) / max(predicted, 1e-6))
            # A transparent demo proxy for time-varying carbon intensity. Production should
            # replace this with a live marginal-emissions provider.
            carbon_intensity = base_factor * (1 - 0.45 * renewable_share)
            energy.append(predicted)
            results.append(
                {
                    "timestamp": ts.to_pydatetime(),
                    "energy_kwh": round(predicted, 3),
                    "co2_kg": round(predicted * carbon_intensity, 3),
                    "lower": round(lower, 3),
                    "upper": round(upper, 3),
                    "co2_lower_kg": round(lower * carbon_intensity, 3),
                    "co2_upper_kg": round(upper * carbon_intensity, 3),
                    "temperature_c": round(temperature, 2),
                    "solar_kwh": round(solar, 3),
                    "wind_kwh": round(wind, 3),
                    "renewable_share_percent": round(renewable_share * 100, 2),
                    "carbon_intensity_kg_per_kwh": round(carbon_intensity, 4),
                }
            )

        peak = max(results, key=lambda point: point["energy_kwh"])
        window_size = min(3, len(results))
        windows = [
            (
                np.mean([p["carbon_intensity_kg_per_kwh"] for p in results[i : i + window_size]]),
                i,
            )
            for i in range(len(results) - window_size + 1)
        ]
        clean_intensity, clean_index = min(windows)
        clean_window = results[clean_index : clean_index + window_size]
        cleanest_point = min(clean_window, key=lambda point: point["carbon_intensity_kg_per_kwh"])
        peak_intensity = peak["carbon_intensity_kg_per_kwh"]
        flexible_load = round(peak["energy_kwh"] * 0.10, 3)
        shift_savings = max(0.0, flexible_load * (peak_intensity - cleanest_point["carbon_intensity_kg_per_kwh"]))
        total_energy = sum(point["energy_kwh"] for point in results)
        total_co2 = sum(point["co2_kg"] for point in results)
        renewable_energy = sum(point["solar_kwh"] + point["wind_kwh"] for point in results)
        recommendations = [
            f"Move up to {flexible_load:.1f} kWh from the peak hour to {cleanest_point['timestamp'].isoformat()}.",
            f"The cleanest {window_size}-hour operating window begins at {clean_window[0]['timestamp'].isoformat()}.",
        ]
        if scenario.efficiency_percent == 0:
            recommendations.append("Test an efficiency scenario to quantify avoidable demand and emissions.")

        return {
            "model": self.artifact.model_name,
            "generated_at": datetime.now(timezone.utc),
            "data_through": last_ts.to_pydatetime(),
            "hours": hours,
            "scenario": scenario.model_dump(),
            "emission_factor": factor_info,
            "forecast": results,
            "summary": {
                "total_energy_kwh": round(total_energy, 3),
                "total_co2_kg": round(total_co2, 3),
                "renewable_energy_kwh": round(renewable_energy, 3),
                "average_carbon_intensity": round(total_co2 / max(total_energy, 1e-6), 4),
                "peak_hour": {"timestamp": peak["timestamp"], "energy_kwh": peak["energy_kwh"]},
                "cleanest_window": {
                    "start": clean_window[0]["timestamp"],
                    "end": clean_window[-1]["timestamp"],
                    "average_carbon_intensity": round(float(clean_intensity), 4),
                },
                "shift_opportunity": {
                    "from_timestamp": peak["timestamp"],
                    "to_timestamp": cleanest_point["timestamp"],
                    "flexible_load_kwh": flexible_load,
                    "estimated_savings_kg": round(shift_savings, 3),
                },
                "recommendation": recommendations[0],
                "recommendations": recommendations,
            },
        }

    def history_points(self, hours: int = 168) -> list[dict]:
        factor = get_emission_factor()["factor_kg_per_kwh"]
        records = self.history.tail(hours).to_dict(orient="records")
        return [
            {
                "timestamp": row["timestamp"].to_pydatetime(),
                "energy_kwh": round(float(row["energy_kwh"]), 3),
                "co2_kg": round(float(row["energy_kwh"]) * float(factor), 3),
                "temperature_c": round(float(row["temperature_c"]), 2),
                "solar_kwh": round(float(row["solar_kwh"]), 3),
                "wind_kwh": round(float(row["wind_kwh"]), 3),
            }
            for row in records
        ]

    def data_quality(self) -> dict:
        timestamps = self.history["timestamp"]
        expected = pd.date_range(timestamps.iloc[0], timestamps.iloc[-1], freq="h")
        missing_hours = len(expected.difference(pd.DatetimeIndex(timestamps)))
        energy = self.history["energy_kwh"]
        z_score = (energy - energy.mean()) / max(energy.std(ddof=0), 1e-6)
        age_hours = max(0.0, (pd.Timestamp.now(tz="UTC") - timestamps.iloc[-1]).total_seconds() / 3600)
        completeness = 100 * (1 - missing_hours / max(len(expected), 1))
        score = max(0, 100 - missing_hours * 2 - int((np.abs(z_score) > 4).sum()) - min(30, int(age_hours / 24)))
        return {
            "score": round(score),
            "status": "good" if score >= 90 else "attention" if score >= 70 else "poor",
            "rows": len(self.history),
            "coverage_days": round((timestamps.iloc[-1] - timestamps.iloc[0]).total_seconds() / 86400, 1),
            "completeness_percent": round(completeness, 2),
            "missing_hours": missing_hours,
            "extreme_outliers": int((np.abs(z_score) > 4).sum()),
            "data_through": timestamps.iloc[-1].to_pydatetime(),
            "age_hours": round(age_hours, 1),
            "source": "synthetic_demo",
        }
