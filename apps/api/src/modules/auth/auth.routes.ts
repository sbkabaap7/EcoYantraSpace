import { Router } from "express";
import { z } from "zod";

import { UserModel } from "../../db/models.js";
import { HttpError } from "../../utils/http-error.js";
import { hashPassword, issueToken, verifyPassword } from "./auth.js";

const credentials = z.object({ email: z.email().transform((email) => email.toLowerCase()), password: z.string().min(12).max(128) });
export const authRouter = Router();
authRouter.post("/auth/register", async (request, response) => { const input = credentials.parse(request.body); if (await UserModel.exists({ email: input.email })) throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "An account already exists for this email."); const user = await UserModel.create({ email: input.email, passwordHash: await hashPassword(input.password) }); response.status(201).json({ accessToken: await issueToken(user), user: { id: String(user._id), email: user.email, role: user.role } }); });
authRouter.post("/auth/login", async (request, response) => { const input = credentials.parse(request.body); const user = await UserModel.findOne({ email: input.email }); if (!user || !(await verifyPassword(user.passwordHash, input.password))) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password."); response.json({ accessToken: await issueToken(user), user: { id: String(user._id), email: user.email, role: user.role } }); });
