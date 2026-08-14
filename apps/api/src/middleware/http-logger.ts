import { pinoHttp } from "pino-http";

import { logger } from "../observability/logger.js";

export const httpLogger = pinoHttp({
  customProps(request) {
    return {
      requestId: (request as typeof request & { requestId?: string }).requestId,
    };
  },
  logger,
});
