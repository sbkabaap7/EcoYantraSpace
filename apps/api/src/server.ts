import { startTelemetry, stopTelemetry } from "./observability/telemetry.js";

// Instrumentation must start before loading HTTP, Express, database, queue, and Axios modules.
startTelemetry();
const [
  { createServer },
  { createApp },
  { env },
  { connectDatabase, disconnectDatabase },
  { connectRedis, disconnectRedis },
  { ensureBucket },
  { startForestWorker },
  { logger },
] = await Promise.all([
  import("node:http"),
  import("./app.js"),
  import("./config/env.js"),
  import("./db/mongoose.js"),
  import("./integrations/redis.js"),
  import("./integrations/storage.js"),
  import("./jobs/forest.queue.js"),
  import("./observability/logger.js"),
]);

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

  server.close((httpError) => {
    void (async () => {
      try {
        if (httpError) {
          throw httpError;
        }

        await forestWorker?.close();
        await disconnectRedis();
        await disconnectDatabase();
        await stopTelemetry();
        clearTimeout(forceExitTimer);
        logger.info({ signal }, "Graceful shutdown completed");
        process.exit(exitCode);
      } catch (error) {
        clearTimeout(forceExitTimer);
        logger.error({ err: error, signal }, "Graceful shutdown failed");
        process.exit(1);
      }
    })();
  });
}

server.on("error", (error) => {
  logger.fatal({ err: error }, "HTTP server failed");
  process.exit(1);
});

async function start(): Promise<void> { await connectDatabase(); await connectRedis(); await ensureBucket(); forestWorker = startForestWorker(); await forestWorker.waitUntilReady(); server.listen(env.PORT, env.HOST, () => { logger.info({ host: env.HOST, port: env.PORT }, "EcoYantraSpace API listening"); }); }
void start().catch((error: unknown) => { logger.fatal({ err: error }, "API startup failed"); process.exit(1); });

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});
