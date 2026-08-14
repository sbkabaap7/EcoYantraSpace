import { Router } from "express";

import { env } from "../../config/env.js";
import { databaseReady } from "../../db/mongoose.js";
import { redisReady } from "../../integrations/redis.js";

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

healthRouter.get("/ready", (request, response) => {
  const checks = env.NODE_ENV === "test" ? [{ name: "process", status: "ready" as const }] : [{ name: "mongodb", status: databaseReady() ? "ready" as const : "not_ready" as const }, { name: "redis", status: redisReady() ? "ready" as const : "not_ready" as const }];
  const ready = checks.every((check) => check.status === "ready");
  response.status(ready ? 200 : 503).json({
    checks,
    requestId: request.requestId,
    service: "ecoyantra-api",
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
  });
});
