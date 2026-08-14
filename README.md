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
- Docker Desktop, optionally, for container verification

## Install

```powershell
corepack enable
pnpm install
```

Copy the example environment files before local development:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

The defaults run the web application on port `3000` and the API on port `4000`. Only the Node API
address is exposed to browser code. Internal ML service addresses will be added when the integration
phase begins.

## Development

Run both applications:

```powershell
pnpm dev
```

Or run one application at a time:

```powershell
pnpm dev:web
pnpm dev:api
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

The Compose foundation starts only the web and API applications. MongoDB, Redis, BullMQ, and
ML-service wiring are intentionally deferred to later phases.

```powershell
docker compose up --build
```

## Environment and secrets

Tracked `.env.example` files document configuration. Real `.env` files are ignored and must never be
committed. See [`docs/architecture/ml-service-audit.md`](docs/architecture/ml-service-audit.md) for
the integration boundaries and current ML risks.
