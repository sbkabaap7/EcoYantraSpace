import { z } from "zod";

import { ProjectModel } from "../../db/models.js";
import { HttpError } from "../../utils/http-error.js";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource ID.");

export async function requireProjectMember(projectId: string, userId: string) {
  const project = await ProjectModel.findOne({
    _id: projectId,
    $or: [{ ownerId: userId }, { memberIds: userId }],
  });
  if (!project) {
    throw new HttpError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  return project;
}

export async function requireProjectOwner(projectId: string, userId: string) {
  const project = await requireProjectMember(projectId, userId);
  if (String(project.ownerId) !== userId) {
    throw new HttpError(403, "PROJECT_OWNER_REQUIRED", "Only the project owner may update this project.");
  }
  return project;
}
