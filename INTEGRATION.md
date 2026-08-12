# EcoSphere Sentinel: integration handoff

This folder is a standalone anomaly-detection service for the combined climate and sustainability website. Keep its ML/API service independent; the main website consumes the versioned REST API below.

## Start the service locally

Use Python 3.12. From this folder:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:CORS_ORIGINS = "http://localhost:3000"
python -m uvicorn app.main:app --reload --port 8000
```

The service then runs at `http://localhost:8000`. Interactive API documentation is at `http://localhost:8000/docs`.

## Environment variables

Copy `.env.example` to `.env` or set these in the deployment environment.

| Variable | Purpose |
| --- | --- |
| `CORS_ORIGINS` | Comma-separated allowed website origins. Example: `https://climate.example.com`. |
| `ECOSPHERE_DB` | SQLite database file path. Use persistent storage in deployment. |
| `SEED_DEMO_DATA` | `true` seeds demo telemetry; set `false` for real-only data. |

## Contract for the main website

Use `VITE_ECOSPHERE_API_URL=http://localhost:8000` (or the deployed service URL) in the frontend environment. Do not call this service's own `/` dashboard from the combined site; render the API data in the shared website UI instead.

| Method | Endpoint | Use in the shared website |
| --- | --- | --- |
| `GET` | `/health` | Service availability check. |
| `GET` | `/api/v1/devices` | Device selector and asset cards. |
| `GET` | `/api/v1/dashboard?device_id=17&hours=168` | Timeline, metrics, and recent alerts. |
| `GET` | `/api/v1/security/alerts?severity=HIGH` | Security/anomaly alert feed. |
| `GET` | `/api/v1/audit-logs?device_id=17` | Investigation/audit view. |
| `POST` | `/api/v1/iot/readings` | Send live device telemetry. |
| `POST` | `/api/v1/demo/attack` | Hackathon demo control only. |
| `POST` | `/api/v1/demo/reset` | Reset demo control only. |

## Frontend example

```ts
const baseUrl = import.meta.env.VITE_ECOSPHERE_API_URL;

const dashboard = await fetch(
  `${baseUrl}/api/v1/dashboard?device_id=17&hours=168`
).then((response) => response.json());

// dashboard.device, dashboard.timeline, dashboard.alerts,
// dashboard.anomaly_rate, and dashboard.emissions_at_risk_kg
// are ready to render in the combined dashboard.
```

To submit a reading:

```ts
await fetch(`${baseUrl}/api/v1/iot/readings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    device_id: "17",
    energy_kwh: 4820,
    timestamp: new Date().toISOString(),
    message_id: crypto.randomUUID(),
    user_id: "main-dashboard",
  }),
});
```

## Deployment

Build and run the service independently:

```bash
docker build -t ecosphere-sentinel .
docker run -p 8000:8000 \
  -e CORS_ORIGINS=https://your-main-site.example \
  -e SEED_DEMO_DATA=false \
  ecosphere-sentinel
```

In production, route a single domain prefix such as `/api/ecosphere/` to this service with a reverse proxy or API gateway. Preserve its `/api/v1/...` paths after the prefix.
