import { Queue, Worker } from "bullmq";

import { ForestAnalysisModel } from "../db/models.js";
import { detectSatellite } from "../integrations/forest-ml/client.js";
import { detectUploaded } from "../integrations/forest-ml/client.js";
import { redisConnection } from "../integrations/redis.js";
import { getObjectBuffer } from "../integrations/storage.js";
import { logger } from "../observability/logger.js";

interface ForestJob { analysisId: string; kind?: "manual"; }
export const forestQueue = new Queue<ForestJob>("forest-analysis", redisConnection);
export function startForestWorker(): Worker<ForestJob> { return new Worker<ForestJob>("forest-analysis", async (job) => { const analysis = await ForestAnalysisModel.findByIdAndUpdate(job.data.analysisId, { status: "processing" }, { new: true }); if (!analysis) return; try { const request = analysis.request as Record<string, unknown>; const result = job.data.kind === "manual" ? await detectUploaded(request as Record<string, string | number>, await getObjectBuffer(analysis.artifactKeys[0]!), await getObjectBuffer(analysis.artifactKeys[1]!), job.id!) : await detectSatellite(request, job.id!); await ForestAnalysisModel.findByIdAndUpdate(analysis._id, { status: "completed", result, jobId: job.id }); } catch (error) { await ForestAnalysisModel.findByIdAndUpdate(analysis._id, { status: "failed", error: error instanceof Error ? error.message : "Unknown failure", jobId: job.id }); logger.error({ err: error, analysisId: String(analysis._id) }, "Forest analysis failed"); throw error; } }, { ...redisConnection, concurrency: 2, lockDuration: 185_000 }); }
