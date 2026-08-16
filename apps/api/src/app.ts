import express, { type Express } from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { httpLogger } from "./middleware/http-logger.js";
import { notFound } from "./middleware/not-found.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { anomalyRouter } from "./modules/anomaly/anomaly.routes.js";
import { carbonRouter } from "./modules/carbon/carbon.routes.js";
import { forestRouter } from "./modules/forest/forest.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(apiRateLimiter);
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: env.REQUEST_BODY_LIMIT }));

  app.use(healthRouter);
  app.use("/api/v1", authRouter);
  app.use("/api/v1", projectsRouter);
  app.use("/api/v1", carbonRouter);
  app.use("/api/v1", anomalyRouter);
  app.use("/api/v1", forestRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
