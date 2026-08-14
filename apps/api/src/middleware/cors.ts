import cors from "cors";

import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

export const corsMiddleware = cors({
  credentials: true,
  methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new HttpError(403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed."));
  },
});
