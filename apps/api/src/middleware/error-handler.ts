import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { HttpError } from "../utils/http-error.js";

interface ErrorBody {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  requestId: string;
}

function normalizeError(error: unknown): { body: ErrorBody["error"]; statusCode: number } {
  if (error instanceof ZodError) {
    return {
      body: {
        code: "VALIDATION_ERROR",
        details: error.flatten(),
        message: "The request did not pass validation.",
      },
      statusCode: 400,
    };
  }

  if (error instanceof HttpError) {
    return {
      body: {
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
        message: error.message,
      },
      statusCode: error.statusCode,
    };
  }

  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    return {
      body: {
        code: "INVALID_JSON",
        message: "The request body contains invalid JSON.",
      },
      statusCode: 400,
    };
  }

  return {
    body: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production" || !(error instanceof Error)
          ? "An unexpected error occurred."
          : error.message,
    },
    statusCode: 500,
  };
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500) {
    logger.error({ error, requestId: request.requestId }, "Unhandled request error");
  } else {
    logger.warn({ code: normalized.body.code, requestId: request.requestId }, "Request rejected");
  }

  response.status(normalized.statusCode).json({
    error: normalized.body,
    requestId: request.requestId,
  } satisfies ErrorBody);
};
