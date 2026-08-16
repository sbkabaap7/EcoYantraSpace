import { Router } from "express";
import { z } from "zod";

import { CarbonForecastModel } from "../../db/models.js";
import {
  carbonForecastSchema,
  getCarbonDataQuality,
  getCarbonHistory,
  getCarbonMetrics,
  getCarbonRegions,
  requestCarbonForecast,
} from "../../integrations/carbon-ml/client.js";
import { HttpError } from "../../utils/http-error.js";
import { authenticate } from "../auth/auth.js";
import { objectIdSchema, requireProjectMember } from "../projects/project-access.js";

export const carbonForecastInputSchema = z
  .object({
    projectId: objectIdSchema,
    hours: z.coerce.number().int().min(1).max(168).default(24),
    region: z.enum(["demo", "low_carbon_demo", "high_carbon_demo"]).default("demo"),
    efficiency_percent: z.coerce.number().min(0).max(40).default(0),
    renewable_growth_percent: z.coerce.number().min(-50).max(300).default(0),
    temperature_delta_c: z.coerce.number().min(-10).max(10).default(0),
    custom_factor_kg_per_kwh: z.coerce.number().positive().max(2).optional(),
  })
  .strict();

const listQuerySchema = z
  .object({
    projectId: objectIdSchema,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    before: objectIdSchema.optional(),
  })
  .strict();

const contextQuerySchema = z
  .object({
    projectId: objectIdSchema,
    historyHours: z.coerce.number().int().min(24).max(2160).default(168),
  })
  .strict();

const storedForecastSchema = z
  .object({
    _id: z.unknown(),
    projectId: z.unknown(),
    requestedBy: z.unknown(),
    request: z.unknown(),
    result: z.unknown(),
    model: z.string().nullish(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .passthrough();

function forecastResponse(value: unknown) {
  const stored = storedForecastSchema.parse(value);
  const result = carbonForecastSchema.safeParse(stored.result);
  if (!result.success) {
    throw new HttpError(500, "PERSISTED_FORECAST_INVALID", "The persisted Carbon forecast is invalid.");
  }
  return {
    id: String(stored._id),
    projectId: String(stored.projectId),
    requestedBy: String(stored.requestedBy),
    request: stored.request,
    result: result.data,
    model: stored.model ?? result.data.model,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

export const carbonRouter = Router();
carbonRouter.use(authenticate);

carbonRouter.get("/carbon/context", async (request, response) => {
  const input = contextQuerySchema.parse(request.query);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const [history, quality, regions, metrics] = await Promise.all([
    getCarbonHistory(input.historyHours, request.requestId),
    getCarbonDataQuality(request.requestId),
    getCarbonRegions(request.requestId),
    getCarbonMetrics(request.requestId),
  ]);
  response.json({ data: { history, quality, regions, metrics } });
});

carbonRouter.post("/carbon/forecasts", async (request, response) => {
  const input = carbonForecastInputSchema.parse(request.body);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const { projectId, ...mlInput } = input;
  const result = await requestCarbonForecast(mlInput, request.requestId);
  const forecast = await CarbonForecastModel.create({
    projectId,
    requestedBy: request.auth!.userId,
    request: mlInput,
    result,
    model: result.model,
  });
  response.status(201).json({ data: forecastResponse(forecast.toObject()) });
});

carbonRouter.get("/carbon/forecasts", async (request, response) => {
  const input = listQuerySchema.parse(request.query);
  await requireProjectMember(input.projectId, request.auth!.userId);
  const records = await CarbonForecastModel.find({
    projectId: input.projectId,
    ...(input.before ? { _id: { $lt: input.before } } : {}),
  })
    .sort({ _id: -1 })
    .limit(input.limit + 1)
    .lean();
  const hasMore = records.length > input.limit;
  const page = hasMore ? records.slice(0, input.limit) : records;
  response.json({
    data: page.map(forecastResponse),
    pagination: { nextCursor: hasMore ? String(page.at(-1)!._id) : null },
  });
});

carbonRouter.get("/carbon/forecasts/:forecastId", async (request, response) => {
  const forecastId = objectIdSchema.parse(request.params.forecastId);
  const forecast = await CarbonForecastModel.findById(forecastId).lean();
  if (!forecast) {
    throw new HttpError(404, "CARBON_FORECAST_NOT_FOUND", "Carbon forecast not found.");
  }
  await requireProjectMember(String(forecast.projectId), request.auth!.userId);
  response.json({ data: forecastResponse(forecast) });
});
