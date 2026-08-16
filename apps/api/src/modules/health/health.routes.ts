import { Router } from "express";

import { env } from "../../config/env.js";
import { databaseReady } from "../../db/mongoose.js";
import { redisReady } from "../../integrations/redis.js";
import { storageReady } from "../../integrations/storage.js";

export const healthRouter = Router();

healthRouter.get("/health", (request, response) => {
  response.json({
    requestId: request.requestId,
    service: "ecoyantra-api",
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: env.APP_VERSION,
  });
});

async function endpointReady(url: string): Promise<boolean> {
  try {
    const result = await fetch(url, { signal: AbortSignal.timeout(2_500) });
    return result.ok;
  } catch {
    return false;
  }
}

healthRouter.get("/ready", async (request, response) => {
  const checks = env.NODE_ENV === "test"
    ? [{ name: "process", status: "ready" as const }]
    : await Promise.all([
        databaseReady().then((ready) => ({ name: "mongodb", ready })),
        redisReady().then((ready) => ({ name: "redis", ready })),
        storageReady().then((ready) => ({ name: "minio", ready })),
        endpointReady(`${env.CARBON_ML_URL}/health`).then((ready) => ({ name: "carbon-ml", ready })),
        endpointReady(`${env.ANOMALY_ML_URL}/health`).then((ready) => ({ name: "anomaly-ml", ready })),
        endpointReady(`${env.FOREST_ML_URL}/api/v1/health`).then((ready) => ({ name: "forest-ml", ready })),
      ]).then((results) => results.map(({ name, ready }) => ({
        name,
        status: ready ? "ready" as const : "not_ready" as const,
      })));
  const ready = checks.every((check) => check.status === "ready");
  response.status(ready ? 200 : 503).json({
    checks,
    requestId: request.requestId,
    service: "ecoyantra-api",
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
  });
});
