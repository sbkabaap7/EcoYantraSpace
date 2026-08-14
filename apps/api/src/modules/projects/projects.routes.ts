import { Router } from "express";
import { z } from "zod";

import { ProjectModel } from "../../db/models.js";
import { authenticate } from "../auth/auth.js";

export const projectsRouter = Router();
projectsRouter.use(authenticate);
projectsRouter.get("/projects", async (request, response) => { const projects = await ProjectModel.find({ $or: [{ ownerId: request.auth!.userId }, { memberIds: request.auth!.userId }] }).lean(); response.json({ data: projects }); });
projectsRouter.post("/projects", async (request, response) => { const input = z.object({ name: z.string().trim().min(2).max(120) }).parse(request.body); const project = await ProjectModel.create({ name: input.name, ownerId: request.auth!.userId, memberIds: [request.auth!.userId] }); response.status(201).json({ data: project }); });
