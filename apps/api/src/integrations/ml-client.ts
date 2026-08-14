import axios, { type AxiosInstance } from "axios";

import { logger } from "../observability/logger.js";
import { HttpError } from "../utils/http-error.js";

export function createMlClient(name: string, baseURL: string, timeout: number): AxiosInstance {
  const client = axios.create({ baseURL, timeout, validateStatus: (status) => status >= 200 && status < 300 });
  client.interceptors.request.use((config) => { config.headers.set("x-request-id", config.headers.get("x-request-id") ?? crypto.randomUUID()); return config; });
  client.interceptors.response.use(undefined, (error: unknown) => { logger.warn({ err: error, integration: name }, "ML request failed"); throw new HttpError(502, "ML_SERVICE_UNAVAILABLE", `${name} is unavailable.`); });
  return client;
}
