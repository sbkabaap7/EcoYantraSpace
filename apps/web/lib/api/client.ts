import type { ZodType } from "zod";

import { apiErrorResponseSchema, authSessionSchema, type AuthSession } from "./schemas";

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");

let accessToken: string | null = null;
let refreshPromise: Promise<AuthSession> | null = null;
let authExpiredHandler: (() => void) | null = null;

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | null;
  json?: unknown;
  retryOnUnauthorized?: boolean;
};

type ValidatedRequestOptions<T> = RequestOptions & { schema: ZodType<T> };

export class ApiError extends Error {
  public readonly code: string;
  public readonly details: unknown;
  public readonly requestId: string | null;
  public readonly status: number;

  public constructor(input: {
    code: string;
    details?: unknown;
    message: string;
    requestId?: string | null;
    status: number;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId ?? null;
    this.status = input.status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAuthExpiredHandler(handler: (() => void) | null): void {
  authExpiredHandler = handler;
}

function resolveApiUrl(path: string): string {
  if (!configuredBaseUrl) {
    throw new ApiError({
      code: "API_NOT_CONFIGURED",
      message: "NEXT_PUBLIC_API_BASE_URL is not configured.",
      status: 500,
    });
  }

  if (/^https?:\/\//i.test(path)) {
    throw new ApiError({
      code: "EXTERNAL_API_URL_REJECTED",
      message: "Frontend API requests must use the configured Node API boundary.",
      status: 500,
    });
  }

  const normalizedPath = path.startsWith("/api/")
    ? path
    : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  return `${configuredBaseUrl}${normalizedPath}`;
}

function requestInit(options: RequestOptions, token: string | null): RequestInit {
  const {
    body: providedBody,
    json,
    retryOnUnauthorized: _retryOnUnauthorized,
    ...nativeOptions
  } = options;
  void _retryOnUnauthorized;
  const headers = new Headers(options.headers);
  let body = providedBody;

  if (json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(json);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  return {
    ...nativeOptions,
    ...(body === undefined ? {} : { body }),
    credentials: "include",
    headers,
  };
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }

  const parsed = apiErrorResponseSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError({
      code: parsed.data.error.code,
      ...(parsed.data.error.details === undefined ? {} : { details: parsed.data.error.details }),
      message: parsed.data.error.message,
      requestId: parsed.data.requestId,
      status: response.status,
    });
  }

  return new ApiError({
    code: response.status === 401 ? "AUTHENTICATION_REQUIRED" : "API_REQUEST_FAILED",
    message: response.status === 401
      ? "Your session has expired. Please sign in again."
      : `The API request failed with status ${response.status}.`,
    status: response.status,
  });
}

async function fetchWithSession(path: string, options: RequestOptions): Promise<Response> {
  const response = await fetch(resolveApiUrl(path), requestInit(options, accessToken));
  const canRefresh = options.retryOnUnauthorized !== false && response.status === 401;

  if (!canRefresh) return response;

  try {
    await refreshAccessToken();
  } catch (error) {
    clearAccessToken();
    authExpiredHandler?.();
    throw error;
  }

  const retryResponse = await fetch(
    resolveApiUrl(path),
    requestInit({ ...options, retryOnUnauthorized: false }, accessToken),
  );
  if (retryResponse.status === 401) {
    clearAccessToken();
    authExpiredHandler?.();
  }
  return retryResponse;
}

async function parseValidated<T>(response: Response, schema: ZodType<T>): Promise<T> {
  if (!response.ok) throw await errorFromResponse(response);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError({
      code: "INVALID_API_RESPONSE",
      message: "The API returned an unreadable response.",
      status: 502,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: "INVALID_API_RESPONSE",
      details: parsed.error.flatten(),
      message: "The API response did not match the expected contract.",
      status: 502,
    });
  }
  return parsed.data;
}

export async function apiRequest<T>(path: string, options: ValidatedRequestOptions<T>): Promise<T> {
  const response = await fetchWithSession(path, options);
  if (response.status === 401 && options.retryOnUnauthorized !== false) {
    clearAccessToken();
    authExpiredHandler?.();
  }
  return parseValidated(response, options.schema);
}

export async function apiVoidRequest(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await fetchWithSession(path, options);
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status !== 204) {
    const text = await response.text();
    if (text.trim() !== "") {
      throw new ApiError({
        code: "INVALID_API_RESPONSE",
        message: "The API returned content for an empty response.",
        status: 502,
      });
    }
  }
}

export async function apiBlobRequest(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await fetchWithSession(path, options);
  if (!response.ok) throw await errorFromResponse(response);
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new ApiError({
      code: "EMPTY_ARTIFACT",
      message: "The requested analysis artifact is empty.",
      status: 502,
    });
  }
  return blob;
}

async function requestRefreshedSession(): Promise<AuthSession> {
  const response = await fetch(
    resolveApiUrl("/auth/refresh"),
    requestInit({ method: "POST", retryOnUnauthorized: false }, null),
  );
  const session = await parseValidated(response, authSessionSchema);
  setAccessToken(session.accessToken);
  return session;
}

export async function refreshAccessToken(): Promise<AuthSession> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("ecoyantra-refresh-session", { mode: "exclusive" }, requestRefreshedSession)
    : requestRefreshedSession();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
