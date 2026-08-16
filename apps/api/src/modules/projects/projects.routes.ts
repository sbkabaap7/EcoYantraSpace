import { Router } from "express";
import { z } from "zod";

import { ProjectModel } from "../../db/models.js";
import { authenticate } from "../auth/auth.js";
import {
  objectIdSchema,
  requireProjectMember,
  requireProjectOwner,
} from "./project-access.js";

const projectInputSchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();
const storedProjectSchema = z
  .object({
    _id: z.unknown(),
    name: z.string(),
    ownerId: z.unknown(),
    memberIds: z.array(z.unknown()),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();

function projectResponse(value: unknown) {
  const project = storedProjectSchema.parse(value);
  return {
    id: String(project._id),
    name: project.name,
    ownerId: String(project.ownerId),
    memberIds: project.memberIds.map(String),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export const projectsRouter = Router();
projectsRouter.use(authenticate);

projectsRouter.get("/projects", async (request, response) => {
  const projects = await ProjectModel.find({
    $or: [{ ownerId: request.auth!.userId }, { memberIds: request.auth!.userId }],
  })
    .sort({ updatedAt: -1 })
    .lean();
  response.json({ data: projects.map(projectResponse) });
});

projectsRouter.post("/projects", async (request, response) => {
  const input = projectInputSchema.parse(request.body);
  const project = await ProjectModel.create({
    name: input.name,
    ownerId: request.auth!.userId,
    memberIds: [request.auth!.userId],
  });
  response.status(201).json({ data: projectResponse(project.toObject()) });
});

projectsRouter.get("/projects/:projectId", async (request, response) => {
  const projectId = objectIdSchema.parse(request.params.projectId);
  const project = await requireProjectMember(projectId, request.auth!.userId);
  response.json({ data: projectResponse(project.toObject()) });
});

projectsRouter.patch("/projects/:projectId", async (request, response) => {
  const projectId = objectIdSchema.parse(request.params.projectId);
  const input = projectInputSchema.parse(request.body);
  const project = await requireProjectOwner(projectId, request.auth!.userId);
  project.name = input.name;
  await project.save();
  response.json({ data: projectResponse(project.toObject()) });
});
