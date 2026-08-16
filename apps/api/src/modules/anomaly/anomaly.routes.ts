import { createHash } from "node:crypto";

import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import { AnomalyAlertModel, DeviceModel } from "../../db/models.js";
import {
  anomalyAlertSchema,
  anomalyReadingSchema,
  ingestReading,
} from "../../integrations/anomaly-ml/client.js";
import { HttpError } from "../../utils/http-error.js";
import { authenticate } from "../auth/auth.js";
import { objectIdSchema, requireProjectMember } from "../projects/project-access.js";

const submissionSchema = z
  .object({
    projectId: objectIdSchema,
    device_id: z.string().min(1).max(64),
    energy_kwh: z.number().min(0).max(100_000),
    timestamp: z.string().datetime({ offset: true }).optional(),
    message_id: z.string().max(128).optional(),
    temperature: z.number().min(-80).max(150).optional(),
    voltage: z.number().min(0).max(1_000).optional(),
    current: z.number().min(0).max(10_000).optional(),
  })
  .strict();

const projectQuerySchema = z.object({ projectId: objectIdSchema }).strict();
const dashboardQuerySchema = z
  .object({
    projectId: objectIdSchema,
    device_id: z.string().min(1).max(64),
    hours: z.coerce.number().int().min(1).max(720).default(168),
  })
  .strict();
const historyQuerySchema = z
  .object({
    projectId: objectIdSchema,
    device_id: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    before: objectIdSchema.optional(),
  })
  .strict();

const storedDeviceSchema = z
  .object({
    _id: z.unknown(),
    projectId: z.unknown(),
    externalId: z.string(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();
const storedAlertSchema = z
  .object({
    _id: z.unknown(),
    projectId: z.unknown(),
    deviceId: z.unknown(),
    upstreamAlertId: z.string(),
    reading: z.unknown().optional(),
    payload: z.unknown(),
    status: z.string().nullish(),
    severity: z.string().nullish(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();

type StoredDevice = z.infer<typeof storedDeviceSchema>;
type DeviceSummary = { latest: unknown; readings_seen: number };

function upstreamDeviceId(projectId: string, deviceId: string): string {
  return createHash("sha256").update(projectId).update("\0").update(deviceId).digest("hex");
}

function minimalDeviceResponse(value: unknown) {
  const device = storedDeviceSchema.parse(value);
  return { id: String(device._id), device_id: device.externalId, name: device.name };
}

function anomalyRecordResponse(alertValue: unknown, deviceValue: unknown) {
  const alert = storedAlertSchema.parse(alertValue);
  const result = anomalyAlertSchema.safeParse(alert.payload);
  if (!result.success) {
    throw new HttpError(500, "PERSISTED_ANOMALY_INVALID", "The persisted anomaly result is invalid.");
  }
  const reading = anomalyReadingSchema.omit({ user_id: true }).safeParse(alert.reading);
  return {
    id: String(alert._id),
    projectId: String(alert.projectId),
    device: minimalDeviceResponse(deviceValue),
    reading: reading.success ? reading.data : null,
    result: result.data,
    status: result.data.status,
    severity: result.data.severity,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

function isReplay(payload: z.infer<typeof anomalyAlertSchema>): boolean {
  return payload.signals.some((signal) => signal.name === "replay risk");
}

async function findDevice(projectId: string, externalId: string) {
  const device = await DeviceModel.findOne({ projectId, externalId }).lean();
  if (!device) {
    throw new HttpError(404, "ANOMALY_DEVICE_NOT_FOUND", "Anomaly device not found.");
  }
  return storedDeviceSchema.parse(device);
}

function deviceProjection(deviceValue: unknown, summary?: DeviceSummary) {
  const device = storedDeviceSchema.parse(deviceValue);
  const latestResult = anomalyAlertSchema.safeParse(summary?.latest);
  const latest = latestResult.success ? latestResult.data : undefined;
  return {
    ...minimalDeviceResponse(device),
    readings_seen: summary?.readings_seen ?? 0,
    latest_energy_kwh: latest?.observed ?? null,
    latest_status: latest?.status ?? null,
    latest_score: latest?.score ?? null,
    expected_range: latest?.expected_range ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

async function deviceSummaries(projectId: string, deviceIds: unknown[]): Promise<Map<string, DeviceSummary>> {
  if (deviceIds.length === 0) return new Map();
  const rows = await AnomalyAlertModel.aggregate<{ _id: unknown; latest: unknown; readings_seen: number }>([
    {
      $match: {
        projectId: new Types.ObjectId(projectId),
        deviceId: { $in: deviceIds },
        "payload.signals.name": { $ne: "replay risk" },
      },
    },
    { $sort: { observedAt: -1, _id: -1 } },
    { $group: { _id: "$deviceId", latest: { $first: "$payload" }, readings_seen: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), { latest: row.latest, readings_seen: row.readings_seen }]));
}

async function devicesById(ids: string[]): Promise<Map<string, StoredDevice>> {
  const devices = await DeviceModel.find({ _id: { $in: ids } }).lean();
  return new Map(
    devices.map((value) => {
      const device = storedDeviceSchema.parse(value);
      return [String(device._id), device];
    }),
  );
}

export const anomalyRouter = Router();
anomalyRouter.use(authenticate);

anomalyRouter.post("/anomaly/readings", async (request, response) => {
  const input = submissionSchema.parse(request.body);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const { projectId, ...submitted } = input;
  const reading = anomalyReadingSchema.parse({
    ...submitted,
    timestamp: submitted.timestamp ?? new Date().toISOString(),
    user_id: request.auth!.userId,
  });
  const upstreamResult = await ingestReading(
    { ...reading, device_id: upstreamDeviceId(projectId, reading.device_id) },
    request.requestId,
  );
  const result = anomalyAlertSchema.parse({ ...upstreamResult, device_id: reading.device_id });
  const device = await DeviceModel.findOneAndUpdate(
    { projectId, externalId: input.device_id },
    {
      $setOnInsert: {
        projectId,
        externalId: input.device_id,
        name: input.device_id,
      },
    },
    { new: true, upsert: true },
  );
  const persistedReading = anomalyReadingSchema.omit({ user_id: true }).strip().parse(reading);
  const alert = await AnomalyAlertModel.findOneAndUpdate(
    { projectId, upstreamAlertId: result.alert_id },
    {
      $set: {
        deviceId: device._id,
        observedAt: new Date(result.timestamp),
        payload: result,
        reading: persistedReading,
        severity: result.severity,
        status: result.status,
      },
      $setOnInsert: { projectId, upstreamAlertId: result.alert_id },
    },
    { new: true, upsert: true },
  );
  response.status(201).json({ data: anomalyRecordResponse(alert.toObject(), device.toObject()) });
});

anomalyRouter.get("/anomaly/devices", async (request, response) => {
  const input = projectQuerySchema.parse(request.query);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const devices = await DeviceModel.find({ projectId: input.projectId }).sort({ externalId: 1 }).lean();
  const summaries = await deviceSummaries(input.projectId, devices.map((device) => device._id));
  response.json({ data: devices.map((device) => deviceProjection(device, summaries.get(String(device._id)))) });
});

anomalyRouter.get("/anomaly/dashboard", async (request, response) => {
  const input = dashboardQuerySchema.parse(request.query);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const device = await findDevice(input.projectId, input.device_id);
  const since = new Date(Date.now() - input.hours * 3_600_000);
  const records = await AnomalyAlertModel.find({
    projectId: input.projectId,
    deviceId: String(device._id),
    observedAt: { $gte: since },
  })
    .sort({ observedAt: 1, _id: 1 })
    .lean();
  const results = records
    .map((record) => anomalyAlertSchema.safeParse(record.payload))
    .filter((result) => result.success)
    .map((result) => result.data);
  const timelineResults = results.filter((result) => !isReplay(result));
  const timeline = timelineResults.map((result) => ({
    timestamp: result.timestamp,
    energy_kwh: result.observed,
    lower_bound: result.expected_range.min,
    upper_bound: result.expected_range.max,
    status: result.status,
    score: result.score,
  }));
  const alerts = results.filter((result) => result.status === "ANOMALY").slice(-10).reverse();
  const anomalyCount = timelineResults.filter((result) => result.status === "ANOMALY").length;
  const summaries = await deviceSummaries(input.projectId, [device._id]);
  response.json({
    data: {
      device: deviceProjection(device, summaries.get(String(device._id))),
      timeline,
      alerts,
      anomaly_rate: Number((anomalyCount / Math.max(timeline.length, 1)).toFixed(3)),
      period_hours: input.hours,
    },
  });
});

anomalyRouter.get("/anomaly/history", async (request, response) => {
  const input = historyQuerySchema.parse(request.query);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const selectedDevice = input.device_id
    ? await findDevice(input.projectId, input.device_id)
    : undefined;
  const records = await AnomalyAlertModel.find({
    projectId: input.projectId,
    ...(selectedDevice ? { deviceId: String(selectedDevice._id) } : {}),
    ...(input.before ? { _id: { $lt: input.before } } : {}),
  })
    .sort({ _id: -1 })
    .limit(input.limit + 1)
    .lean();
  const hasMore = records.length > input.limit;
  const page = hasMore ? records.slice(0, input.limit) : records;
  const deviceMap = await devicesById(page.map((record) => String(record.deviceId)));
  const data = page.map((record) => {
    const device = deviceMap.get(String(record.deviceId));
    if (!device) {
      throw new HttpError(500, "PERSISTED_ANOMALY_DEVICE_MISSING", "The persisted anomaly device is missing.");
    }
    return anomalyRecordResponse(record, device);
  });
  response.json({
    data,
    pagination: { nextCursor: hasMore ? String(page.at(-1)!._id) : null },
  });
});
