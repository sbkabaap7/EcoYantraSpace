import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";

import { env } from "../../config/env.js";
import { UserModel } from "../../db/models.js";
import { HttpError } from "../../utils/http-error.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
export async function issueToken(user: { _id: unknown; role: string; email: string }): Promise<string> { return new SignJWT({ role: user.role, email: user.email }).setProtectedHeader({ alg: "HS256" }).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setSubject(String(user._id)).setIssuedAt().setExpirationTime("15m").sign(secret); }
export async function hashPassword(password: string): Promise<string> { return argon2.hash(password, { type: argon2.argon2id }); }
export async function verifyPassword(hash: string, password: string): Promise<boolean> { return argon2.verify(hash, password); }
export async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> { try { const token = request.header("authorization")?.replace(/^Bearer\s+/i, ""); if (!token) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "A bearer token is required."); const result = await jwtVerify(token, secret, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }); const user = await UserModel.findById(result.payload.sub); if (!user) throw new HttpError(401, "INVALID_TOKEN", "The token subject no longer exists."); request.auth = { userId: String(user._id), role: user.role }; next(); } catch (error) { next(error instanceof HttpError ? error : new HttpError(401, "INVALID_TOKEN", "The access token is invalid or expired.")); } }
export function requireRole(...roles: string[]) { return (request: Request, _response: Response, next: NextFunction): void => { if (!request.auth || !roles.includes(request.auth.role)) { next(new HttpError(403, "FORBIDDEN", "You are not allowed to perform this action.")); return; } next(); }; }
