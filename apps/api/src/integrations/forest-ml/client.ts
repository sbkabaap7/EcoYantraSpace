import axios from "axios";
import { ZodError } from "zod";

import { env } from "../../config/env.js";
import { logger } from "../../observability/logger.js";
import { HttpError } from "../../utils/http-error.js";
import { forestResultSchema, type ForestMlResult } from "./contract.js";

const client = axios.create({
  baseURL: env.FOREST_ML_URL,
  timeout: 180_000,
});

function normalizeForestError(error: unknown, requestId: string, path: string): never {
  if (error instanceof ZodError) {
    logger.error(
      { issues: error.issues, method: "POST", path, requestId },
      "Forest ML returned an invalid response",
    );
    throw new HttpError(
      502,
      "FOREST_ML_INVALID_RESPONSE",
      "Forest Intelligence returned an invalid response.",
    );
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    logger.warn(
      { code: error.code, method: "POST", path, requestId, status },
      "Forest ML request failed",
    );

    if (status !== undefined && status >= 400 && status < 500) {
      throw new HttpError(
        422,
        "FOREST_ML_REJECTED",
        "Forest Intelligence rejected the analysis parameters.",
      );
    }

    throw new HttpError(
      502,
      "FOREST_ML_UNAVAILABLE",
      "Forest Intelligence is unavailable.",
    );
  }

  throw error;
}

export async function detectSatellite(
  input: Record<string, unknown>,
  requestId: string,
): Promise<ForestMlResult> {
  try {
    const { data } = await client.post<unknown>("/api/v1/detect/satellite", input, {
      headers: { "x-request-id": requestId },
    });
    return forestResultSchema.parse(data);
  } catch (error) {
    return normalizeForestError(error, requestId, "/api/v1/detect/satellite");
  }
}

export async function detectUploaded(
  input: Record<string, string | number>,
  before: Buffer,
  after: Buffer,
  beforeContentType: string,
  afterContentType: string,
  requestId: string,
): Promise<ForestMlResult> {
  const form = new FormData();
  form.set(
    "before",
    new Blob([before], { type: beforeContentType }),
    `before.${extension(beforeContentType)}`,
  );
  form.set(
    "after",
    new Blob([after], { type: afterContentType }),
    `after.${extension(afterContentType)}`,
  );

  for (const [key, value] of Object.entries(input)) {
    form.set(key, String(value));
  }

  try {
    const { data } = await client.post<unknown>("/api/v1/detect", form, {
      headers: { "x-request-id": requestId },
    });
    return forestResultSchema.parse(data);
  } catch (error) {
    return normalizeForestError(error, requestId, "/api/v1/detect");
  }
}

function extension(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/tiff":
      return "tiff";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}
