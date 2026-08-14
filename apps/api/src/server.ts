import { createServer } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/mongoose.js";
import { disconnectRedis, connectRedis } from "./integrations/redis.js";
import { ensureBucket } from "./integrations/storage.js";
import { startForestWorker } from "./jobs/forest.queue.js";
import { logger } from "./observability/logger.js";
import { startTelemetry, stopTelemetry } from "./observability/telemetry.js";

startTelemetry();
const app = createApp();
const server = createServer(app);
let forestWorker: ReturnType<typeof startForestWorker> | undefined;
let shuttingDown = false;

function shutdown(signal: string, exitCode = 0): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExitTimer = setTimeout(() => {
    logger.fatal({ signal }, "Graceful shutdown timed out");
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceExitTimer);

    if (error) {
      logger.error({ error, signal }, "HTTP server failed to close cleanly");
      process.exit(1);
    }

    await forestWorker?.close();
    await disconnectRedis();
    await disconnectDatabase();
    await stopTelemetry();
    logger.info({ signal }, "Graceful shutdown completed");
    process.exit(exitCode);
  });
}

server.on("error", (error) => {
  logger.fatal({ error }, "HTTP server failed");
  process.exit(1);
});

async function start(): Promise<void> { await connectDatabase(); await connectRedis(); await ensureBucket(); forestWorker = startForestWorker(); server.listen(env.PORT, env.HOST, () => { logger.info({ host: env.HOST, port: env.PORT }, "EcoYantraSpace API listening"); }); }
void start().catch((error: unknown) => { logger.fatal({ error }, "API startup failed"); process.exit(1); });

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});
