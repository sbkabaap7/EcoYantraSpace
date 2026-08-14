# Monorepo foundation

Status: Phase 2

## Runtime boundary

```text
Browser -> apps/web -> apps/api -> private integrations (future phases)
```

`apps/api` is the only future caller of ML services. No ML service URL may be introduced as a
`NEXT_PUBLIC_*` variable.

## Workspace ownership

| Workspace         | Responsibility                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `apps/web`        | Server-rendered Next.js application and browser experience             |
| `apps/api`        | Public HTTP boundary, orchestration, policy, and operational endpoints |
| `packages/types`  | Runtime-neutral shared TypeScript contracts                            |
| `packages/config` | Runtime-neutral platform constants and configuration primitives        |
| `packages/ui`     | Shared accessible UI components in the frontend phase                  |

## API middleware order

1. Request ID creation or validated propagation
2. Structured HTTP logging
3. Helmet security headers
4. Strict-origin CORS
5. Rate limiting
6. Bounded body parsing
7. Feature routes
8. Not-found normalization
9. Central error handling

## Operational semantics

- `/health` is process liveness and must remain dependency-free.
- `/ready` reports whether the process can receive traffic. MongoDB, Redis, and ML dependency checks
  will be added to readiness only when those dependencies are introduced.
- SIGINT and SIGTERM stop new connections and allow active HTTP work to finish within a bounded
  shutdown period.
- Application logs are JSON, redact common credential locations, and carry the request ID.

## Deferred by design

Authentication, MongoDB, Redis, BullMQ, object storage, ML clients, business routes, product UI, and
full observability instrumentation are not part of this foundation.
