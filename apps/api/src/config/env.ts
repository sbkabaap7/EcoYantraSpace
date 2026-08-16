import { z } from "zod";

const environmentBoolean = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return value;
}, z.boolean());

const optionalEnvironmentString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalEnvironmentUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.url().optional(),
);

const environmentSchema = z.object({
  ACCESS_TOKEN_TTL: z.string().trim().min(2).default("15m"),
  APP_VERSION: z.string().trim().min(1).default("0.1.0"),
  ANOMALY_ML_URL: z.url().default("http://localhost:8002"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AWS_ACCESS_KEY_ID: z.string().trim().min(1).default("minioadmin"),
  AWS_SECRET_ACCESS_KEY: z.string().trim().min(1).default("minioadmin"),
  CARBON_ML_URL: z.url().default("http://localhost:8001"),
  CORS_ORIGINS: z.string().trim().min(1).default("http://localhost:3000"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JWT_AUDIENCE: z.string().trim().min(1).default("ecoyantra-api"),
  JWT_ISSUER: z.string().trim().min(1).default("ecoyantra-space"),
  JWT_SECRET: z.string().min(32).default("development-only-secret-change-before-production-2026"),
  MONGODB_URI: z.string().trim().min(1).default("mongodb://localhost:27017/ecoyantra"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  REFRESH_COOKIE_DOMAIN: optionalEnvironmentString,
  REFRESH_COOKIE_NAME: z.string().trim().regex(/^[A-Za-z0-9_-]+$/).default("ecoyantra_refresh"),
  REFRESH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  REFRESH_COOKIE_SECURE: environmentBoolean.default(false),
  REFRESH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REQUEST_BODY_LIMIT: z.string().trim().min(1).default("1mb"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  S3_BUCKET: z.string().trim().min(3).default("ecoyantra-artifacts"),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  SENTRY_DSN: optionalEnvironmentUrl,
  SENTRY_ENABLED: environmentBoolean.default(false),
  FOREST_ML_URL: z.url().default("http://localhost:8003"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
}).superRefine((value, context) => {
  const knownUnsafeJwtSecrets = new Set([
    "development-only-secret-change-before-production-2026",
    "local-development-secret-change-me-2026",
    "replace-with-a-random-secret-at-least-32-characters",
  ]);
  if (value.NODE_ENV === "production" && knownUnsafeJwtSecrets.has(value.JWT_SECRET)) {
    context.addIssue({ code: "custom", message: "JWT_SECRET must be set in production.", path: ["JWT_SECRET"] });
  }
  if (value.SENTRY_ENABLED && !value.SENTRY_DSN) {
    context.addIssue({ code: "custom", message: "SENTRY_DSN is required when SENTRY_ENABLED=true.", path: ["SENTRY_DSN"] });
  }
  if (value.REFRESH_COOKIE_SAME_SITE === "none" && !value.REFRESH_COOKIE_SECURE) {
    context.addIssue({ code: "custom", message: "REFRESH_COOKIE_SECURE must be true when SameSite=None.", path: ["REFRESH_COOKIE_SECURE"] });
  }
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  ...result.data,
  corsOrigins: result.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
