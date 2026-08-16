# EcoYantraSpace

EcoYantraSpace is a climate-intelligence platform organized as a pnpm monorepo. The public web
application talks only to the Node.js API; the API is the security and orchestration boundary for
the existing Python ML services.

## Repository structure

```text
apps/
  api/                  Express 5 API boundary
  web/                  Next.js App Router application
packages/
  config/               Shared platform configuration primitives
  types/                Shared TypeScript contracts
  ui/                   Reserved shared UI package
infrastructure/
  docker/               Container documentation and future support files
docs/
  architecture/         Architecture decisions and ML integration audit
ML/
  Carbon/               Existing CarbonSense FastAPI service
  Anomaly/              Existing EcoSphere Sentinel FastAPI service
  Forest/               Existing VanDrishti FastAPI service
```

The `ML/` projects remain independently runnable Python services. Do not move their inference logic
into the web or API applications.

## Prerequisites

- Node.js 24 or newer
- pnpm 11.19.0 (Corepack is recommended)
- Docker Desktop for the complete local application

## Install

```powershell
corepack enable
pnpm install
```

For the complete Docker environment, create the required root environment file:

```powershell
Copy-Item .env.example .env
$jwtBytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
$jwtSecret = [Convert]::ToBase64String($jwtBytes)
(Get-Content .env) -replace '^JWT_SECRET=.*$', "JWT_SECRET=$jwtSecret" | Set-Content .env
```

The example JWT value is intentionally rejected; the commands above generate a unique local secret.
The defaults publish only the web application on port `3000` and Node API on port `4000`; Python ML
services, MongoDB, Redis, and MinIO remain private on the Compose network.

## Development

The production-like local workflow is Docker Compose:

```powershell
docker compose up --build -d
```

For frontend-only iteration against an already running API:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev:web
```

- Web: `http://localhost:3000`
- API liveness: `http://localhost:4000/health`
- API readiness: `http://localhost:4000/ready`

## Quality checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Containers

Compose starts the complete application: Next.js, Express, MongoDB, durable Redis/BullMQ, MinIO,
Carbon ML, Anomaly ML, and Forest ML. Forest jobs are queued and their generated image artifacts are
served through authenticated Node routes; the browser never receives MinIO credentials or ML URLs.

```powershell
docker compose up --build -d
docker compose ps
```

Open `http://localhost:3000`, create an account and project, then use the Carbon, Anomaly, and Forest
workspaces. Stop the stack with `docker compose down`; named volumes retain MongoDB, Redis, MinIO,
and Anomaly detector state.

## Environment and secrets

Tracked `.env.example` files document configuration. Real `.env` files are ignored and must never be
committed. Use `REFRESH_COOKIE_SECURE=true` with HTTPS and set `TRUST_PROXY` only when the API is
actually behind a trusted reverse proxy. Sentry is opt-in through `SENTRY_ENABLED`/`SENTRY_DSN`, and
OpenTelemetry uses standard `OTEL_*` environment variables. See
[`docs/architecture/ml-service-audit.md`](docs/architecture/ml-service-audit.md) for the integration
boundary and ML contracts.
