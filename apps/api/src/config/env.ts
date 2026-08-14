import { z } from "zod";

const environmentSchema = z.object({
  APP_VERSION: z.string().trim().min(1).default("0.1.0"),
  ANOMALY_ML_URL: z.url().default("http://localhost:8002"),
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
  REQUEST_BODY_LIMIT: z.string().trim().min(1).default("1mb"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  S3_BUCKET: z.string().trim().min(3).default("ecoyantra-artifacts"),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  SENTRY_DSN: z.string().trim().url().optional(),
  SENTRY_ENABLED: z.coerce.boolean().default(false),
  FOREST_ML_URL: z.url().default("http://localhost:8003"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.JWT_SECRET === "development-only-secret-change-before-production-2026") {
    context.addIssue({ code: "custom", message: "JWT_SECRET must be set in production.", path: ["JWT_SECRET"] });
  }
  if (value.SENTRY_ENABLED && !value.SENTRY_DSN) {
    context.addIssue({ code: "custom", message: "SENTRY_DSN is required when SENTRY_ENABLED=true.", path: ["SENTRY_DSN"] });
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
