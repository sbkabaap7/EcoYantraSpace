import pino from "pino";

import { env } from "../config/env.js";

export const logger = pino({
  base: {
    environment: env.NODE_ENV,
    service: "ecoyantra-api",
    version: env.APP_VERSION,
  },
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "token",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
