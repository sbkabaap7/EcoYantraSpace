import { rateLimit } from "express-rate-limit";

import { env } from "../config/env.js";

export const apiRateLimiter = rateLimit({
  handler(request, response) {
    response.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      },
      requestId: request.requestId,
    });
  },
  legacyHeaders: false,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
});
