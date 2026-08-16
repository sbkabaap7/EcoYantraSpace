import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { CookieOptions, Request, Response } from "express";

import { env } from "../../config/env.js";
import { RefreshSessionModel } from "../../db/models.js";
import { HttpError } from "../../utils/http-error.js";

const REFRESH_TOKEN_BYTES = 48;
const MILLISECONDS_PER_DAY = 86_400_000;
const ROTATION_GRACE_MS = 10_000;

interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface RefreshCredential {
  familyId: string;
  rawToken: string;
  tokenHash: string;
}

function sessionMetadata(request: Request): SessionMetadata {
  const userAgent = request.get("user-agent")?.slice(0, 512);
  const ipAddress = request.ip?.slice(0, 128);
  return {
    ...(userAgent ? { userAgent } : {}),
    ...(ipAddress ? { ipAddress } : {}),
  };
}

function expiresAt(): Date {
  return new Date(Date.now() + env.REFRESH_SESSION_TTL_DAYS * MILLISECONDS_PER_DAY);
}

function makeCredential(familyId: string = randomUUID()): RefreshCredential {
  const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  return { familyId, rawToken, tokenHash: hashRefreshToken(rawToken) };
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    maxAge: env.REFRESH_SESSION_TTL_DAYS * MILLISECONDS_PER_DAY,
    path: "/api/v1/auth",
    sameSite: env.REFRESH_COOKIE_SAME_SITE,
    secure: env.REFRESH_COOKIE_SECURE,
    ...(env.REFRESH_COOKIE_DOMAIN ? { domain: env.REFRESH_COOKIE_DOMAIN } : {}),
  };
}

function clearCookieOptions(): CookieOptions {
  const options = cookieOptions();
  delete options.maxAge;
  return options;
}

export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function readRefreshToken(request: Request): string | undefined {
  const header = request.get("cookie");
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== env.REFRESH_COOKIE_NAME) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setRefreshCookie(response: Response, rawToken: string): void {
  response.cookie(env.REFRESH_COOKIE_NAME, rawToken, cookieOptions());
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(env.REFRESH_COOKIE_NAME, clearCookieOptions());
}

export async function createRefreshSession(userId: string, request: Request): Promise<string> {
  const credential = makeCredential();
  const now = new Date();
  await RefreshSessionModel.create({
    userId,
    tokenHash: credential.tokenHash,
    familyId: credential.familyId,
    expiresAt: expiresAt(),
    lastUsedAt: now,
    ...sessionMetadata(request),
  });
  return credential.rawToken;
}

async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await RefreshSessionModel.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revocationReason: reason } },
  );
}

export async function rotateRefreshSession(
  request: Request,
  response: Response,
): Promise<{ familyId: string; userId: string }> {
  const rawToken = readRefreshToken(request);
  if (!rawToken) {
    clearRefreshCookie(response);
    throw new HttpError(401, "REFRESH_TOKEN_REQUIRED", "A refresh session is required.");
  }

  const tokenHash = hashRefreshToken(rawToken);
  const session = await RefreshSessionModel.findOne({ tokenHash });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    clearRefreshCookie(response);
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "The refresh session is invalid or expired.");
  }

  if (session.revokedAt) {
    if (
      session.revocationReason === "rotated" &&
      Date.now() - session.revokedAt.getTime() <= ROTATION_GRACE_MS
    ) {
      throw new HttpError(
        401,
        "STALE_REFRESH_TOKEN",
        "The refresh session was already rotated. Retry with the current session cookie.",
      );
    }
    await revokeFamily(session.familyId, "reuse-detected");
    clearRefreshCookie(response);
    throw new HttpError(401, "REFRESH_TOKEN_REUSED", "Refresh token reuse was detected. Please sign in again.");
  }

  const next = makeCredential(session.familyId);
  const now = new Date();
  const rotated = await RefreshSessionModel.findOneAndUpdate(
    { _id: session._id, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
    {
      $set: {
        lastUsedAt: now,
        replacementTokenHash: next.tokenHash,
        revokedAt: now,
        revocationReason: "rotated",
      },
    },
    { new: true },
  );

  if (!rotated) {
    await revokeFamily(session.familyId, "rotation-race");
    clearRefreshCookie(response);
    throw new HttpError(401, "REFRESH_TOKEN_REUSED", "Refresh token reuse was detected. Please sign in again.");
  }

  await RefreshSessionModel.create({
    userId: session.userId,
    tokenHash: next.tokenHash,
    familyId: next.familyId,
    expiresAt: expiresAt(),
    lastUsedAt: now,
    ...sessionMetadata(request),
  });
  setRefreshCookie(response, next.rawToken);
  return { familyId: next.familyId, userId: String(session.userId) };
}

export async function revokeRefreshSession(request: Request, response: Response): Promise<void> {
  const rawToken = readRefreshToken(request);
  clearRefreshCookie(response);
  if (!rawToken) {
    return;
  }

  await RefreshSessionModel.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revocationReason: "logout" } },
  );
}

export async function revokeRefreshFamily(familyId: string): Promise<void> {
  await revokeFamily(familyId, "user-not-found");
}
