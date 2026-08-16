import { Router } from "express";
import { z } from "zod";

import { UserModel } from "../../db/models.js";
import { authRateLimiter } from "../../middleware/rate-limit.js";
import { HttpError } from "../../utils/http-error.js";
import { authenticate, hashPassword, issueToken, verifyPassword } from "./auth.js";
import {
  clearRefreshCookie,
  createRefreshSession,
  revokeRefreshFamily,
  revokeRefreshSession,
  rotateRefreshSession,
  setRefreshCookie,
} from "./refresh-session.js";

const credentialsSchema = z
  .object({
    email: z.email().transform((email) => email.trim().toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();

function userResponse(user: { _id: unknown; email: string; role: string }) {
  return { id: String(user._id), email: user.email, role: user.role };
}

function duplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}

export const authRouter = Router();

authRouter.use((_request, response, next) => {
  response.setHeader("cache-control", "no-store");
  next();
});

authRouter.post("/auth/register", authRateLimiter, async (request, response) => {
  const input = credentialsSchema.parse(request.body);
  let user;
  try {
    user = await UserModel.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "An account already exists for this email.");
    }
    throw error;
  }

  const refreshToken = await createRefreshSession(String(user._id), request);
  setRefreshCookie(response, refreshToken);
  response.status(201).json({ accessToken: await issueToken(user), user: userResponse(user) });
});

authRouter.post("/auth/login", authRateLimiter, async (request, response) => {
  const input = credentialsSchema.parse(request.body);
  const user = await UserModel.findOne({ email: input.email });
  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const refreshToken = await createRefreshSession(String(user._id), request);
  setRefreshCookie(response, refreshToken);
  response.json({ accessToken: await issueToken(user), user: userResponse(user) });
});

authRouter.post("/auth/refresh", async (request, response) => {
  const { familyId, userId } = await rotateRefreshSession(request, response);
  const user = await UserModel.findById(userId);
  if (!user) {
    await revokeRefreshFamily(familyId);
    clearRefreshCookie(response);
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "The refresh session is invalid or expired.");
  }

  response.json({ accessToken: await issueToken(user), user: userResponse(user) });
});

authRouter.post("/auth/logout", async (request, response) => {
  await revokeRefreshSession(request, response);
  response.status(204).end();
});

authRouter.get("/auth/me", authenticate, async (request, response) => {
  const user = await UserModel.findById(request.auth!.userId);
  if (!user) {
    throw new HttpError(401, "INVALID_TOKEN", "The token subject no longer exists.");
  }
  response.json({ user: userResponse(user) });
});
