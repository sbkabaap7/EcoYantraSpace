import axios, { type AxiosInstance } from "axios";
import type { ZodType } from "zod";

import { logger } from "../observability/logger.js";
import { HttpError } from "../utils/http-error.js";

export function createMlClient(name: string, baseURL: string, timeout: number): AxiosInstance {
  const client = axios.create({ baseURL, timeout, validateStatus: (status) => status >= 200 && status < 300 });
  client.interceptors.request.use((config) => { config.headers.set("x-request-id", config.headers.get("x-request-id") ?? crypto.randomUUID()); return config; });
  client.interceptors.response.use(undefined, (error: unknown) => {
    const upstream = axios.isAxiosError(error)
      ? {
          code: error.code,
          method: error.config?.method,
          path: error.config?.url,
          status: error.response?.status,
        }
      : { kind: "unknown" };
    logger.warn({ integration: name, upstream }, "ML request failed");
    throw new HttpError(502, "ML_SERVICE_UNAVAILABLE", `${name} is unavailable.`);
  });
  return client;
}

export function parseMlResponse<T>(name: string, schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  logger.error(
    {
      integration: name,
      issues: result.error.issues.map((issue) => ({ code: issue.code, path: issue.path })),
    },
    "ML response did not match its adapter contract",
  );
  throw new HttpError(502, "ML_INVALID_RESPONSE", `${name} returned an invalid response.`);
}
