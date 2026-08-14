# Docker infrastructure

Application Dockerfiles live beside `apps/web` and `apps/api` so their build ownership remains
clear. The root `docker-compose.yml` is the local orchestration foundation.

MongoDB, Redis, BullMQ workers, object storage, and the existing ML services are intentionally
excluded until their implementation phases.
