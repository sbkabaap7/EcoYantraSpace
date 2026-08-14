# EcoSphere Sentinel - anomaly-detection API

EcoSphere Sentinel is a hackathon-ready IoT security and sustainability service. It persists telemetry and audit records in SQLite, detects anomalies through a hybrid approach, and shows an investigation dashboard at the root URL.

## What makes it production-minded

- **Device-specific robust baselines:** median/MAD envelopes resist occasional spikes and adapt for devices without a predefined range.
- **Hybrid detection:** validation and explainable rules catch known failures while Isolation Forest catches unusual combinations of energy, residual, change rate, and time-of-day.
- **Replay protection:** duplicate message IDs and repeated payloads are security signals, not silently accepted data.
- **Persistent auditability:** readings, alerts, and audit logs survive restarts in `data/ecospherai.db`.
- **Actionable evidence:** every alert includes signal contributions, reasons, and a recommended next action rather than an opaque score.
- **Climate-ready demo data:** the first run seeds 30 days of transparent synthetic telemetry for 12 assets - renewable generation, water, buildings, cold chain, mobility, agriculture, storage, and circularity. Each timeline contains sparse anomalies rather than artificial 0% or 100% rates.

## Run

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000` for the live visual dashboard, or `http://localhost:8000/docs` for interactive API documentation.

Use the dashboard's **Timeline** selector to compare 24 hours, 7 days, and 30 days. Set `SEED_DEMO_DATA=false` when connecting only real devices.

## Frontend integration

POST `http://localhost:8000/api/v1/iot/readings`

```json
{
  "device_id": "17",
  "energy_kwh": 4820,
  "timestamp": "2026-08-08T10:00:00Z",
  "user_id": "iot-simulator"
}
```

The response includes `status`, `severity`, `score`, `expected_range`, `observed`, `reasons`, explainable `signals`, and a `recommended_action`.

Useful reads:

- `GET /api/v1/security/alerts` - all anomaly alerts (optional `device_id` and `severity` filters)
- `GET /api/v1/security/alerts/{alert_id}` - an investigation record
- `GET /api/v1/audit-logs?device_id=17` - audit trail
- `GET /api/v1/devices` - known devices and their live baselines
- `GET /api/v1/dashboard?device_id=17&hours=168` - chart-ready telemetry and investigations
- `POST /api/v1/demo/attack` - injects the 4,820 kWh hackathon attack case

For the provided cyberattack demo, Device #17 with `4820` kWh returns `ANOMALY` / `HIGH`, using an expected range of `480-530` kWh.

## Integrating into the combined website

This is a standalone backend service. The main website should consume its REST API rather than embed this folder's built-in dashboard. See [INTEGRATION.md](INTEGRATION.md) for the API contract, frontend examples, CORS setup, and Docker deployment instructions.
