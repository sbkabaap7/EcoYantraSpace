import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

import { env } from "../config/env.js";

let telemetry: NodeSDK | undefined;

export function startTelemetry(): void {
  if (env.SENTRY_ENABLED && env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      release: env.APP_VERSION,
    });
  }

  telemetry = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] });
  telemetry.start();
}

export function captureException(error: unknown, requestId: string): void {
  if (!env.SENTRY_ENABLED || !env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    scope.setTag("request_id", requestId);
    Sentry.captureException(error);
  });
}

export async function stopTelemetry(): Promise<void> {
  await telemetry?.shutdown();
  if (env.SENTRY_ENABLED) await Sentry.close(2_000);
}
