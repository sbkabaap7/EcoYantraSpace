import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../utils/http-error.js";

export function notFound(request: Request, _response: Response, next: NextFunction): void {
  next(
    new HttpError(404, "ROUTE_NOT_FOUND", `Route ${request.method} ${request.path} was not found.`),
  );
}
