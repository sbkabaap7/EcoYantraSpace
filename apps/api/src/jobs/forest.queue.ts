import { Queue, Worker, type JobsOptions } from "bullmq";

import { ForestAnalysisModel } from "../db/models.js";
import { detectSatellite } from "../integrations/forest-ml/client.js";
import { detectUploaded } from "../integrations/forest-ml/client.js";
import { redisConnection } from "../integrations/redis.js";
import { getObjectData, putObject } from "../integrations/storage.js";
import { logger } from "../observability/logger.js";
import { HttpError } from "../utils/http-error.js";
import {
  artifactExtension,
  artifactNameFromKey,
  extractForestArtifacts,
} from "./forest.artifacts.js";

export interface ForestJob {
  analysisId: string;
  kind?: "manual";
  requestId?: string;
}

export const forestJobOptions = {
  attempts: 3,
  backoff: { delay: 5_000, type: "exponential" },
  removeOnComplete: 100,
  removeOnFail: 500,
} satisfies JobsOptions;

export const forestQueue = new Queue<ForestJob>("forest-analysis", redisConnection);
forestQueue.on("error", (error) => {
  logger.error({ err: error, queue: "forest-analysis" }, "Forest queue error");
});

function requiredInputKey(keys: string[], name: "after-input" | "before-input"): string {
  const key = keys.find((candidate) => artifactNameFromKey(candidate) === name);
  if (!key) throw new Error(`Forest analysis is missing its ${name} artifact.`);
  return key;
}

function isFinalAttempt(attemptsMade: number, configuredAttempts: number | undefined): boolean {
  return attemptsMade + 1 >= (configuredAttempts ?? 1);
}

function publicFailureMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error && error.message.startsWith("Forest analysis")) return error.message;
  if (error instanceof Error && error.message.startsWith("Forest ML")) return error.message;
  return "Forest Intelligence could not complete this analysis. Retry the request.";
}

async function detectManualAnalysis(
  request: Record<string, unknown>,
  artifactKeys: string[],
  requestId: string,
) {
  const [before, after] = await Promise.all([
    getObjectData(requiredInputKey(artifactKeys, "before-input")),
    getObjectData(requiredInputKey(artifactKeys, "after-input")),
  ]);
  return detectUploaded(
    request as Record<string, string | number>,
    before.body,
    after.body,
    before.contentType,
    after.contentType,
    requestId,
  );
}

export function startForestWorker(): Worker<ForestJob> {
  const worker = new Worker<ForestJob>(
    "forest-analysis",
    async (job) => {
      const analysis = await ForestAnalysisModel.findByIdAndUpdate(
        job.data.analysisId,
        { $set: { status: "processing" }, $unset: { error: 1 } },
        { new: true },
      );

      if (!analysis) {
        throw new Error(`Forest analysis ${job.data.analysisId} no longer exists.`);
      }

      try {
        const requestId = job.data.requestId ?? job.id ?? crypto.randomUUID();
        const request = analysis.request as Record<string, unknown>;
        const mlResult =
          job.data.kind === "manual"
            ? await detectManualAnalysis(request, [...analysis.artifactKeys], requestId)
            : await detectSatellite(request, requestId);

        const extracted = extractForestArtifacts(mlResult);
        const outputPrefix = `forest/${String(analysis.projectId)}/${String(analysis._id)}/outputs`;
        const generatedKeys = await Promise.all(
          extracted.artifacts.map((artifact) =>
            putObject(
              `${outputPrefix}/${artifact.name}.${artifactExtension(artifact.contentType)}`,
              artifact.body,
              artifact.contentType,
            ),
          ),
        );

        await ForestAnalysisModel.findByIdAndUpdate(analysis._id, {
          $set: {
            artifactKeys: [...analysis.artifactKeys, ...generatedKeys],
            jobId: job.id,
            result: extracted.result,
            status: "completed",
          },
          $unset: { error: 1 },
        });
      } catch (error) {
        const finalAttempt = isFinalAttempt(job.attemptsMade, job.opts.attempts);
        const message = publicFailureMessage(error);
        await ForestAnalysisModel.findByIdAndUpdate(
          analysis._id,
          finalAttempt
            ? { $set: { error: message, jobId: job.id, status: "failed" } }
            : { $set: { jobId: job.id, status: "queued" }, $unset: { error: 1 } },
        );

        const context = {
          analysisId: String(analysis._id),
          attempt: job.attemptsMade + 1,
          err: error,
          requestId: job.data.requestId ?? job.id,
        };
        if (finalAttempt) logger.error(context, "Forest analysis failed");
        else logger.warn(context, "Forest analysis will be retried");
        throw error;
      }
    },
    { ...redisConnection, concurrency: 2, lockDuration: 185_000 },
  );

  worker.on("error", (error) => {
    logger.error({ err: error, queue: "forest-analysis" }, "Forest worker error");
  });

  return worker;
}
