# ML service integration audit

Status: Phase 1 complete  
Reviewed: 2026-08-14  
Scope: `ML/Carbon`, `ML/Anomaly`, and `ML/Forest`

## Executive decision

The three Python services remain independent inference services. The browser must never call them
directly. `apps/api` will own authentication, authorization, request validation, persistence, rate
limits, audit events, error normalization, and all public contracts.

The integration modes are intentionally different:

| Service | Node integration                    | Persistence owner                                                                    | Execution mode                                        |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Carbon  | Typed internal HTTP client          | MongoDB stores requested forecasts and summaries                                     | Synchronous, with bounded timeout and selective retry |
| Anomaly | Typed internal HTTP client          | MongoDB stores application-facing device, alert, and audit projections               | Synchronous ingest/read; polling initially            |
| Forest  | BullMQ worker calling internal HTTP | MongoDB stores metadata; S3-compatible storage stores images and generated artifacts | Asynchronous job                                      |

No ML algorithm, model artifact, feature pipeline, or detection threshold should be copied into
Node.js.

## Service inventory

### CarbonSense

- Location: `ML/Carbon`
- FastAPI version: application `2.0.0`
- Model: `hybrid_ridge_energy_v2`
- Artifact: `models/energy_forecast_v1.json`
- Input data: 2,160 hourly synthetic demo observations
- Current explicit ridge/seasonal blend: `1.0 / 0.0`
- Runtime persistence: none
- CORS: configurable, currently intended for browser-facing demo use

Verified endpoints:

| Method | Path                             | Important constraints                                                        |
| ------ | -------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/health`                        | Loads the model and reports model/data-quality status                        |
| GET    | `/api/v1/model/metrics`          | Returns the bundled JSON evaluation report                                   |
| GET    | `/api/v1/data/quality`           | Reports quality of bundled history, not tenant data                          |
| GET    | `/api/v1/energy/history`         | `hours` is 24–2,160                                                          |
| GET    | `/api/v1/emissions/regions`      | Factors are explicitly illustrative and unverified                           |
| GET    | `/api/v1/energy/forecast`        | `hours` is 1–168; scenario values are bounded                                |
| POST   | `/api/v1/energy/forecast/custom` | Requires 168–17,520 unique observations; accepts up to 168 future conditions |

Contract notes:

- Forecast responses are protected by a Pydantic response model and contain forecast points, energy
  uncertainty, CO2 uncertainty, renewable share, peak hour, cleanest window, and load-shifting
  opportunity.
- Unknown region names silently fall back to `demo`. The Node boundary must reject unknown values
  instead of allowing silent substitution.
- Custom history requires unique timestamps but does not enforce contiguous one-hour intervals. The
  Node boundary should validate cadence and report gaps before invoking ML.
- Multi-step forecasts are recursive. Product copy must not imply that long-horizon intervals have
  been independently calibrated by horizon.
- Carbon factors and current model evidence are demonstration assumptions. They must be labeled as
  such in the API and UI.

### EcoSphere Sentinel

- Location: `ML/Anomaly`
- FastAPI version: application `2.0.0`
- Model: device rules and median/MAD baselines plus an Isolation Forest fitted to synthetic
  normalized vectors
- Runtime persistence: local SQLite
- CORS: defaults to `*`
- Request body limit: 16 KiB, based on the `Content-Length` header

Verified endpoints:

| Method | Path                                 | Important constraints                                               |
| ------ | ------------------------------------ | ------------------------------------------------------------------- |
| GET    | `/health`                            | Process health only; does not verify database operations            |
| POST   | `/api/v1/iot/readings`               | Strict body schema; value 0–100,000 kWh; timezone required          |
| GET    | `/api/v1/security/alerts`            | Optional device/severity filters; fixed maximum 200; no cursor      |
| GET    | `/api/v1/security/alerts/{alert_id}` | Returns one alert or 404                                            |
| GET    | `/api/v1/audit-logs`                 | Optional device filter; fixed maximum 500; no cursor                |
| GET    | `/api/v1/devices`                    | Returns profile plus baseline/latest reading                        |
| GET    | `/api/v1/dashboard`                  | `hours` is 1–720; returns timeline, alerts, rate, emissions-at-risk |
| POST   | `/api/v1/demo/attack`                | Mutating demo endpoint; must not be exposed in production           |
| POST   | `/api/v1/demo/reset`                 | Destructive demo endpoint; must not be exposed in production        |

Contract notes:

- Duplicate `message_id` or repeated payloads become replay anomalies and are not added to the
  telemetry series.
- A normal reading still receives severity `LOW`; consumers must use `status` as the anomaly
  discriminator.
- `emissions_at_risk_kg` is a heuristic based on energy above the stored upper bound and a
  hard-coded profile factor.
- Timestamps are stored as ISO text. Node must normalize to UTC before persistence and comparison.
- Application MongoDB is the source of truth for user/project ownership. The service's SQLite
  database remains internal implementation state.

Critical integration defect:

- `/api/v1/devices` and `/api/v1/dashboard` call `seed_sustainability_demo()` unconditionally.
  Consequently, setting `SEED_DEMO_DATA=false` only disables startup seeding; those reads can still
  insert demo data. Production use requires a minimal ML-service fix before these endpoints can be
  trusted with real-only telemetry.

### VanDrishti

- Location: `ML/Forest`
- FastAPI version: application `1.0.0`
- Default automatic engine: Sentinel-2 NDVI change rules
- Manual fallback engine: RGB Excess-Green rules
- Optional model: six-channel, three-class ChangeUNet
- Current checkpoint: absent
- Current labeled training data: absent
- Runtime persistence: process-local LRU cache only
- CORS: `*`

Verified endpoints:

| Method | Path                       | Important constraints                                                     |
| ------ | -------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/v1/health`           | Reports engine and process-local cache statistics                         |
| GET    | `/api/v1/model`            | Reports active engine metadata                                            |
| POST   | `/api/v1/detect/satellite` | AOI ≤2,500 km²; ordered past date windows; cloud/sensitivity/patch bounds |
| POST   | `/api/v1/detect`           | Two multipart images; declared PNG/JPEG/WebP/TIFF; ≤15 MB each            |

Contract notes:

- Satellite analysis calls fixed Microsoft Planetary Computer and Element 84 STAC providers; request
  values do not supply arbitrary remote URLs.
- Catalogue selection retries, and raster reads use a 25-second GDAL HTTP timeout. There is no
  deadline covering the complete analysis operation.
- A satellite response includes GeoJSON, hotspots, source metadata, confidence, warnings, priority,
  carbon exposure, RGB previews, change overlay, and NDVI-delta overlay.
- Preview and overlay artifacts are returned as base64 data URLs. The worker must decode, validate,
  upload to object storage, replace them with object references, and never store the blobs in
  MongoDB.
- The manual endpoint checks declared MIME type and then decodes with Pillow, but reads each upload
  fully into memory. Node must enforce body/file limits before proxying.
- The service has no Pydantic response model. Every Forest response must be validated with a strict
  Zod schema at the Node boundary.
- LRU cache state is per process and is lost on restart; it is not a platform cache.
- The optional U-Net training script creates a validation split but does not evaluate it or publish
  IoU/F1 metrics. Until a checkpoint and model card exist, UI language must describe the active
  engine as NDVI change detection, not a trained segmentation model.

## Cross-service security findings

All three services currently assume a trusted network and lack the controls required at a public
boundary:

- no authentication or authorization;
- no machine-to-machine authentication;
- no request ID propagation contract;
- no structured application logging contract;
- no OpenTelemetry instrumentation;
- no standardized readiness/liveness split;
- inconsistent CORS behavior;
- inconsistent error response shapes;
- no shared timeout or retry policy;
- no tenant isolation.

Deployment rule: expose only `apps/web` and `apps/api`. Bind ML containers to the private
Compose/network namespace without host-published ports in production. Add a shared internal service
token or signed service credential in a later hardening phase; network isolation alone is not the
final control.

## Node boundary contract

Every ML client in `apps/api` must provide:

1. A dedicated Axios instance with a service-specific base URL and timeout.
2. Request and response Zod schemas maintained as adapter contracts.
3. Request ID propagation through `x-request-id`.
4. An internal authentication header once ML service authentication is implemented.
5. Structured duration, status, retry, and failure logging without payload secrets.
6. Retry only for safe/idempotent operations and selected transient failures.
7. Stable application error mapping that never returns raw upstream exceptions.
8. Circuit-breaking or load-shedding behavior for repeated upstream failures.

Initial timeout policy to validate during implementation:

| Operation                 |                       Deadline | Retry                                                                   |
| ------------------------- | -----------------------------: | ----------------------------------------------------------------------- |
| Carbon reads and forecast |                     10 seconds | Up to 1 retry for connection/reset/502/503/504                          |
| Anomaly reads             |                      5 seconds | Up to 1 retry for connection/reset/502/503/504                          |
| Anomaly ingest            |                      5 seconds | Retry only when a stable `message_id` makes the call idempotent         |
| Forest job                | Worker deadline of 180 seconds | BullMQ backoff; no blind in-request retry after an ambiguous completion |

These are orchestration defaults, not claims about measured service-level objectives.

## Public data ownership

MongoDB stores application records and references, not raw ML blobs:

- `User`: identity, authorization, session/security metadata
- `Project`: ownership, membership, feature scope
- `Analysis`: common analysis lifecycle and links to a specialized result
- `CarbonForecast`: validated request, scenario, model metadata, forecast summary/series strategy
- `AnomalyAlert`: normalized alert evidence and source identifiers
- `Device`: project-owned device profile and ingestion configuration
- `ForestAnalysis`: AOI, dates, metrics, GeoJSON/object keys, warnings, provenance
- `AuditLog`: immutable application actions with actor and request ID
- `Job`: queue state, attempts, progress, timestamps, normalized failure

Large previews, overlays, uploaded imagery, CSV exports, and printable reports belong in
S3-compatible object storage. MongoDB stores object keys, checksums, content types, sizes, and
provenance.

## Risk register

| Priority | Risk                                                                     | Required disposition                                                           |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Blocker  | Anomaly read endpoints seed demo records when real-only mode is expected | Minimal fix and regression test before production telemetry integration        |
| Blocker  | ML services have no machine authentication                               | Private network in early phases; authenticated service calls before production |
| High     | Forest returns large base64 artifacts and has no response schema         | Worker normalization to S3 plus strict Zod validation                          |
| High     | Long Forest calls have no whole-operation deadline                       | Queue deadline, cancellation strategy, and stale-job reconciliation            |
| High     | Forest active engine is not a trained U-Net                              | Accurate product labeling; checkpoint/model-card gate for learned-model claims |
| High     | Carbon data/model/factors are synthetic or illustrative                  | Persistent disclosure and replacement plan for real deployments                |
| Medium   | Carbon silently substitutes unknown regions                              | Node enum validation                                                           |
| Medium   | Carbon custom history does not guarantee hourly continuity               | Node cadence validation                                                        |
| Medium   | Anomaly lists use fixed limits without pagination                        | Node projection/pagination backed by MongoDB                                   |
| Medium   | ML health checks are not readiness checks                                | Node readiness aggregates dependency checks with short deadlines               |
| Medium   | Process-local Forest cache cannot coordinate replicas                    | Redis/application cache for durable orchestration state where useful           |

## Phase 2 prerequisites and decisions

Phase 2 may create the workspace without changing ML projects. The workspace should reserve:

```text
apps/
  api/
  web/
packages/
  config/
  contracts/
docs/
  architecture/
ML/
  Carbon/
  Anomaly/
  Forest/
```

Decisions carried into Phase 2:

- pnpm workspace with strict TypeScript and shared lint/format configuration;
- shared contracts contain application DTOs, not copied Python inference logic;
- environment variables distinguish internal Carbon, Anomaly, and Forest URLs;
- no `NEXT_PUBLIC_*` ML URL exists;
- heavy browser libraries remain feature-local and dynamically imported later;
- Forest processing is designed as a queue workflow from the start, even if the initial scaffold
  contains only interfaces;
- ML directories remain independently runnable and retain their existing pytest suites.

## Acceptance evidence

- All declared routes were verified against FastAPI source.
- Input constraints, persistence behavior, CORS, Docker entry points, dependencies, current model
  artifacts, checkpoint availability, and tests were inspected.
- No ML source, model, data, or test file was changed during this phase.
- No claim is made that the ML models are production validated; current limitations are carried into
  platform UX and architecture.
