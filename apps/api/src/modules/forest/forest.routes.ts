import { Router, type RequestHandler } from "express";
import { Types } from "mongoose";
import multer from "multer";
import { z } from "zod";

import { ForestAnalysisModel, ProjectModel } from "../../db/models.js";
import { getObjectData, putObject } from "../../integrations/storage.js";
import {
  artifactContentTypeFromKey,
  artifactExtension,
  artifactNameFromKey,
  forestArtifactNames,
  type ForestArtifactName,
} from "../../jobs/forest.artifacts.js";
import { forestJobOptions, forestQueue, type ForestJob } from "../../jobs/forest.queue.js";
import { HttpError } from "../../utils/http-error.js";
import { authenticate } from "../auth/auth.js";
import {
  forestListQuerySchema,
  forestManualInputSchema,
  forestResourceIdSchema,
  forestSatelliteInputSchema,
} from "./forest.schemas.js";

const artifactNameSchema = z.enum(forestArtifactNames);

const upload = multer({
  limits: { fileSize: 15_000_000, files: 2 },
  storage: multer.memoryStorage(),
});

function detectedImageContentType(buffer: Buffer): "image/jpeg" | "image/png" | "image/tiff" | "image/webp" {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  const littleEndianTiff = buffer.length >= 4 && buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
  const bigEndianTiff = buffer.length >= 4 && buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
  if (littleEndianTiff || bigEndianTiff) return "image/tiff";
  throw new HttpError(
    415,
    "FOREST_IMAGE_TYPE_UNSUPPORTED",
    "Forest images must contain valid PNG, JPEG, WEBP, or TIFF data.",
  );
}

const receiveForestImages = upload.fields([
  { maxCount: 1, name: "before" },
  { maxCount: 1, name: "after" },
]);

const forestUploadMiddleware: RequestHandler = (request, response, next) => {
  receiveForestImages(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      next(
        new HttpError(
          tooLarge ? 413 : 400,
          tooLarge ? "FOREST_IMAGE_TOO_LARGE" : "FOREST_UPLOAD_INVALID",
          tooLarge
            ? "Each Forest image must be 15 MB or smaller."
            : "The Forest image upload is invalid.",
        ),
      );
      return;
    }
    next(error);
  });
};

async function requireProjectAccess(projectId: string, userId: string): Promise<void> {
  const project = await ProjectModel.exists({
    _id: projectId,
    $or: [{ memberIds: userId }, { ownerId: userId }],
  });
  if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND", "Project not found.");
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return value as Record<string, unknown>;
}

function hasToObject(value: unknown): value is { toObject: () => unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toObject" in value &&
    typeof value.toObject === "function"
  );
}

function rawAnalysis(value: unknown): Record<string, unknown> {
  if (hasToObject(value)) {
    return objectRecord(value.toObject());
  }
  return objectRecord(value);
}

function identifier(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  return "";
}

function artifactLinks(
  analysisId: string,
  artifactKeys: string[],
): Partial<Record<ForestArtifactName, { contentType: string; url: string }>> {
  const links: Partial<Record<ForestArtifactName, { contentType: string; url: string }>> = {};
  for (const key of artifactKeys) {
    const name = artifactNameFromKey(key);
    if (!name) continue;
    links[name] = {
      contentType: artifactContentTypeFromKey(key),
      url: `/api/v1/forest/analyses/${analysisId}/artifacts/${name}`,
    };
  }
  return links;
}

function serializeAnalysis(value: unknown): Record<string, unknown> {
  const raw = rawAnalysis(value);
  const id = identifier(raw._id);
  const keys = Array.isArray(raw.artifactKeys)
    ? raw.artifactKeys.filter((key): key is string => typeof key === "string")
    : [];

  return {
    artifacts: artifactLinks(id, keys),
    createdAt: raw.createdAt,
    id,
    jobId: raw.jobId,
    projectId: identifier(raw.projectId),
    request: raw.request,
    requestedBy: identifier(raw.requestedBy),
    result: raw.result,
    status: raw.status,
    updatedAt: raw.updatedAt,
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
  };
}

async function markEnqueueFailure(analysisId: string): Promise<void> {
  await ForestAnalysisModel.findByIdAndUpdate(analysisId, {
    $set: {
      error: "The Forest analysis could not be queued. Retry the request.",
      status: "failed",
    },
  });
}

export const forestRouter = Router();
forestRouter.use(authenticate);

forestRouter.post("/forest/analyses", async (request, response) => {
  const input = forestSatelliteInputSchema.parse(request.body);
  await requireProjectAccess(input.projectId, request.auth!.userId);
  const { projectId, ...analysisRequest } = input;
  const analysis = await ForestAnalysisModel.create({
    projectId,
    request: analysisRequest,
    requestedBy: request.auth!.userId,
  });

  try {
    const jobData: ForestJob = {
      analysisId: String(analysis._id),
      requestId: request.requestId,
    };
    const job = await forestQueue.add("satellite-detection", jobData, forestJobOptions);
    const queued = await ForestAnalysisModel.findByIdAndUpdate(
      analysis._id,
      { $set: { jobId: job.id } },
      { new: true },
    );
    response.status(202).json({ data: serializeAnalysis(queued ?? analysis) });
  } catch (error) {
    await markEnqueueFailure(String(analysis._id));
    throw error;
  }
});

forestRouter.post("/forest/analyses/upload", forestUploadMiddleware, async (request, response) => {
  const files = request.files as Record<string, Express.Multer.File[] | undefined>;
  const before = files.before?.[0];
  const after = files.after?.[0];
  if (!before || !after) {
    throw new HttpError(
      400,
      "FOREST_IMAGES_REQUIRED",
      "Both before and after images are required.",
    );
  }
  const beforeContentType = detectedImageContentType(before.buffer);
  const afterContentType = detectedImageContentType(after.buffer);

  const input = forestManualInputSchema.parse(request.body);
  await requireProjectAccess(input.projectId, request.auth!.userId);
  const { projectId, ...analysisRequest } = input;
  const analysis = await ForestAnalysisModel.create({
    projectId,
    request: analysisRequest,
    requestedBy: request.auth!.userId,
  });
  const prefix = `forest/${projectId}/${String(analysis._id)}/inputs`;

  try {
    const artifactKeys = await Promise.all([
      putObject(
        `${prefix}/before-input.${artifactExtension(beforeContentType)}`,
        before.buffer,
        beforeContentType,
      ),
      putObject(
        `${prefix}/after-input.${artifactExtension(afterContentType)}`,
        after.buffer,
        afterContentType,
      ),
    ]);
    await ForestAnalysisModel.findByIdAndUpdate(analysis._id, {
      $set: { artifactKeys },
    });

    const jobData: ForestJob = {
      analysisId: String(analysis._id),
      kind: "manual",
      requestId: request.requestId,
    };
    const job = await forestQueue.add("manual-detection", jobData, forestJobOptions);
    const queued = await ForestAnalysisModel.findByIdAndUpdate(
      analysis._id,
      { $set: { jobId: job.id } },
      { new: true },
    );
    response.status(202).json({ data: serializeAnalysis(queued ?? analysis) });
  } catch (error) {
    await markEnqueueFailure(String(analysis._id));
    throw error;
  }
});

forestRouter.get("/forest/analyses", async (request, response) => {
  const input = forestListQuerySchema.parse(request.query);
  await requireProjectAccess(input.projectId, request.auth!.userId);
  const filter = {
    projectId: input.projectId,
    ...(input.status ? { status: input.status } : {}),
  };
  const analyses = await ForestAnalysisModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(input.limit)
    .lean();
  response.json({ data: analyses.map(serializeAnalysis) });
});

forestRouter.get("/forest/analyses/:id", async (request, response) => {
  const analysisId = forestResourceIdSchema.parse(request.params.id);
  const analysis = await ForestAnalysisModel.findById(analysisId);
  if (!analysis) throw new HttpError(404, "ANALYSIS_NOT_FOUND", "Analysis not found.");
  await requireProjectAccess(String(analysis.projectId), request.auth!.userId);
  response.json({ data: serializeAnalysis(analysis) });
});

forestRouter.get("/forest/analyses/:id/artifacts/:artifact", async (request, response) => {
  const analysisId = forestResourceIdSchema.parse(request.params.id);
  const artifactName = artifactNameSchema.parse(request.params.artifact);
  const analysis = await ForestAnalysisModel.findById(analysisId);
  if (!analysis) throw new HttpError(404, "ANALYSIS_NOT_FOUND", "Analysis not found.");
  await requireProjectAccess(String(analysis.projectId), request.auth!.userId);

  const key = [...analysis.artifactKeys].find(
    (candidate) => artifactNameFromKey(candidate) === artifactName,
  );
  if (!key) throw new HttpError(404, "ARTIFACT_NOT_FOUND", "Artifact not found.");

  const artifact = await getObjectData(key);
  response.set({
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${artifactName}.${artifactExtension(artifact.contentType)}"`,
    "Content-Length": String(artifact.body.length),
    "Content-Type": artifact.contentType,
  });
  response.send(artifact.body);
});
