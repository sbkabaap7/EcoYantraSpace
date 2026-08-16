import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD).");
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Expected a MongoDB object ID.");

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: z.string(),
});

export const userSchema = z.object({
  id: objectId,
  email: z.email(),
  role: z.enum(["admin", "member"]),
});

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  user: userSchema,
});

export const meResponseSchema = z.object({ user: userSchema });

const projectWireSchema = z.object({
  _id: objectId.optional(),
  id: objectId.optional(),
  name: z.string().min(2).max(120),
  ownerId: objectId,
  memberIds: z.array(objectId),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).refine((project) => Boolean(project.id ?? project._id), {
  message: "Project response is missing an ID.",
});

export const projectSchema = projectWireSchema.transform((project) => ({
  ...project,
  id: project.id ?? project._id!,
}));

export const projectsResponseSchema = z.object({ data: z.array(projectSchema) });
export const projectResponseSchema = z.object({ data: projectSchema });

export type User = z.infer<typeof userSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type Project = z.infer<typeof projectSchema>;

// Carbon Intelligence contracts ------------------------------------------------

export const carbonScenarioSchema = z.object({
  region: z.string(),
  efficiency_percent: z.number().min(0).max(40),
  renewable_growth_percent: z.number().min(-50).max(300),
  temperature_delta_c: z.number().min(-10).max(10),
  custom_factor_kg_per_kwh: z.number().positive().max(2).nullable(),
});

export const carbonForecastInputSchema = z.object({
  hours: z.number().int().min(1).max(168),
  region: z.enum(["demo", "low_carbon_demo", "high_carbon_demo"]),
  efficiency_percent: z.number().min(0).max(40),
  renewable_growth_percent: z.number().min(-50).max(300),
  temperature_delta_c: z.number().min(-10).max(10),
  custom_factor_kg_per_kwh: z.number().positive().max(2).optional(),
});

export const carbonEmissionFactorSchema = z.object({
  factor_kg_per_kwh: z.number().positive(),
  unit: z.string(),
  region: z.string(),
  source: z.string(),
  valid_from: z.string(),
  valid_to: z.string(),
  is_verified: z.boolean(),
});

export const carbonForecastPointSchema = z.object({
  timestamp: isoDateTime,
  energy_kwh: z.number().nonnegative(),
  co2_kg: z.number().nonnegative(),
  lower: z.number().nonnegative(),
  upper: z.number().nonnegative(),
  co2_lower_kg: z.number().nonnegative(),
  co2_upper_kg: z.number().nonnegative(),
  temperature_c: z.number(),
  solar_kwh: z.number().nonnegative(),
  wind_kwh: z.number().nonnegative(),
  renewable_share_percent: z.number().min(0).max(100),
  carbon_intensity_kg_per_kwh: z.number().nonnegative(),
});

export const carbonForecastSummarySchema = z.object({
  total_energy_kwh: z.number().nonnegative(),
  total_co2_kg: z.number().nonnegative(),
  renewable_energy_kwh: z.number().nonnegative(),
  average_carbon_intensity: z.number().nonnegative(),
  peak_hour: z.object({ timestamp: isoDateTime, energy_kwh: z.number().nonnegative() }),
  cleanest_window: z.object({
    start: isoDateTime,
    end: isoDateTime,
    average_carbon_intensity: z.number().nonnegative(),
  }),
  shift_opportunity: z.object({
    from_timestamp: isoDateTime,
    to_timestamp: isoDateTime,
    flexible_load_kwh: z.number().nonnegative(),
    estimated_savings_kg: z.number().nonnegative(),
  }),
  recommendation: z.string(),
  recommendations: z.array(z.string()),
});

export const carbonForecastResultSchema = z.object({
  model: z.string(),
  generated_at: isoDateTime,
  data_through: isoDateTime,
  hours: z.number().int().min(1).max(168),
  scenario: carbonScenarioSchema,
  emission_factor: carbonEmissionFactorSchema,
  forecast: z.array(carbonForecastPointSchema),
  summary: carbonForecastSummarySchema,
});

const carbonForecastDocumentWireSchema = z.object({
  _id: objectId.optional(),
  id: objectId.optional(),
  projectId: objectId,
  requestedBy: objectId,
  request: carbonForecastInputSchema,
  result: carbonForecastResultSchema,
  model: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).refine((forecast) => Boolean(forecast.id ?? forecast._id), {
  message: "Carbon forecast response is missing an ID.",
});

export const carbonForecastDocumentSchema = carbonForecastDocumentWireSchema.transform((forecast) => ({
  ...forecast,
  id: forecast.id ?? forecast._id!,
}));

export const carbonHourlyObservationSchema = z.object({
  timestamp: isoDateTime,
  energy_kwh: z.number().nonnegative(),
  co2_kg: z.number().nonnegative(),
  temperature_c: z.number(),
  solar_kwh: z.number().nonnegative(),
  wind_kwh: z.number().nonnegative(),
});

export const carbonDataQualitySchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["good", "attention", "poor"]),
  rows: z.number().int().nonnegative(),
  coverage_days: z.number().nonnegative(),
  completeness_percent: z.number().min(0).max(100),
  missing_hours: z.number().int().nonnegative(),
  extreme_outliers: z.number().int().nonnegative(),
  data_through: isoDateTime,
  age_hours: z.number().nonnegative(),
  source: z.string(),
});

const carbonContextWireSchema = z.object({
  history: z.object({
    hours: z.number().int().min(1),
    history: z.array(carbonHourlyObservationSchema),
  }),
  quality: carbonDataQualitySchema,
  regions: z.object({
    regions: z.array(z.object({
      key: z.string(),
      region: z.string(),
      factor_kg_per_kwh: z.number().positive(),
      is_verified: z.boolean(),
    })),
    warning: z.string(),
  }),
  metrics: z.unknown(),
});

export const carbonContextSchema = carbonContextWireSchema.transform((context) => ({
  data_quality: context.quality,
  emissions: context.regions,
  history: context.history,
  metrics: context.metrics,
}));

export const carbonContextResponseSchema = z.object({ data: carbonContextSchema });
export const carbonForecastsResponseSchema = z.object({
  data: z.array(carbonForecastDocumentSchema),
  pagination: z.object({ nextCursor: objectId.nullable() }),
});
export const carbonForecastResponseSchema = z.object({ data: carbonForecastDocumentSchema });

export type CarbonForecastInput = z.infer<typeof carbonForecastInputSchema>;
export type CarbonForecastPoint = z.infer<typeof carbonForecastPointSchema>;
export type CarbonForecastResult = z.infer<typeof carbonForecastResultSchema>;
export type CarbonForecastDocument = z.infer<typeof carbonForecastDocumentSchema>;
export type CarbonContext = z.infer<typeof carbonContextSchema>;

// Anomaly Intelligence contracts ----------------------------------------------

export const anomalyStatusSchema = z.enum(["NORMAL", "ANOMALY"]);
export const anomalySeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const anomalyExpectedRangeSchema = z.object({ min: z.number(), max: z.number() });

export const anomalySignalSchema = z.object({
  name: z.string(),
  value: z.number(),
  contribution: z.number(),
  interpretation: z.string(),
});

export const anomalyAlertPayloadSchema = z.object({
  alert_id: z.string(),
  device_id: z.string().min(1).max(64),
  status: anomalyStatusSchema,
  severity: anomalySeveritySchema,
  score: z.number(),
  expected_range: anomalyExpectedRangeSchema,
  observed: z.number(),
  reasons: z.array(z.string()),
  signals: z.array(anomalySignalSchema),
  recommended_action: z.string(),
  timestamp: isoDateTime,
});

export const anomalyDeviceSchema = z.object({
  id: objectId,
  device_id: z.string().min(1).max(64),
  name: z.string(),
  readings_seen: z.number().int().nonnegative(),
  latest_energy_kwh: z.number().nullable(),
  latest_status: anomalyStatusSchema.nullable(),
  latest_score: z.number().nullable(),
  expected_range: anomalyExpectedRangeSchema.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const anomalyTimelinePointSchema = z.object({
  timestamp: isoDateTime,
  energy_kwh: z.number(),
  lower_bound: z.number(),
  upper_bound: z.number(),
  status: anomalyStatusSchema,
  score: z.number(),
});

export const anomalyDashboardSchema = z.object({
  device: anomalyDeviceSchema,
  timeline: z.array(anomalyTimelinePointSchema),
  alerts: z.array(anomalyAlertPayloadSchema),
  anomaly_rate: z.number().min(0).max(1),
  period_hours: z.number().int().min(1).max(720),
});

export const anomalyReadingInputSchema = z.object({
  device_id: z.string().min(1).max(64),
  energy_kwh: z.number().min(0).max(100_000),
  timestamp: isoDateTime.optional(),
  message_id: z.string().max(128).optional(),
  temperature: z.number().min(-80).max(150).optional(),
  voltage: z.number().min(0).max(1_000).optional(),
  current: z.number().min(0).max(10_000).optional(),
});

const anomalyRecordWireSchema = z.object({
  _id: objectId.optional(),
  id: objectId.optional(),
  projectId: objectId,
  device: z.object({
    id: objectId,
    device_id: z.string().min(1).max(64),
    name: z.string(),
  }),
  reading: anomalyReadingInputSchema.nullable(),
  result: anomalyAlertPayloadSchema,
  status: anomalyStatusSchema,
  severity: anomalySeveritySchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).refine((record) => Boolean(record.id ?? record._id), {
  message: "Anomaly record response is missing an ID.",
});

export const anomalyRecordSchema = anomalyRecordWireSchema.transform((record) => ({
  ...record,
  id: record.id ?? record._id!,
}));

export const anomalyDevicesResponseSchema = z.object({ data: z.array(anomalyDeviceSchema) });
export const anomalyDashboardResponseSchema = z.object({ data: anomalyDashboardSchema });
export const anomalyHistoryResponseSchema = z.object({
  data: z.array(anomalyRecordSchema),
  pagination: z.object({ nextCursor: objectId.nullable() }),
});
export const anomalyRecordResponseSchema = z.object({ data: anomalyRecordSchema });

export type AnomalySignal = z.infer<typeof anomalySignalSchema>;
export type AnomalyAlertPayload = z.infer<typeof anomalyAlertPayloadSchema>;
export type AnomalyDevice = z.infer<typeof anomalyDeviceSchema>;
export type AnomalyTimelinePoint = z.infer<typeof anomalyTimelinePointSchema>;
export type AnomalyDashboard = z.infer<typeof anomalyDashboardSchema>;
export type AnomalyReadingInput = z.infer<typeof anomalyReadingInputSchema>;
export type AnomalyRecord = z.infer<typeof anomalyRecordSchema>;

// Forest Intelligence contracts ------------------------------------------------

export const forestArtifactNameSchema = z.enum([
  "overlay",
  "ndvi-delta",
  "before-preview",
  "after-preview",
  "before-input",
  "after-input",
]);

export const forestArtifactSchema = z.object({
  url: z.string().startsWith("/"),
  contentType: z.string().min(1),
});

export const forestArtifactsSchema = z.object({
  overlay: forestArtifactSchema.optional(),
  "ndvi-delta": forestArtifactSchema.optional(),
  "before-preview": forestArtifactSchema.optional(),
  "after-preview": forestArtifactSchema.optional(),
  "before-input": forestArtifactSchema.optional(),
  "after-input": forestArtifactSchema.optional(),
});

export const forestAnalysisInputSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  before_start: isoDate,
  before_end: isoDate,
  after_start: isoDate,
  after_end: isoDate,
  max_cloud: z.number().min(0).max(90),
  sensitivity: z.number().min(0).max(1),
  minimum_patch_hectares: z.number().min(0.05).max(50),
}).strict();

export const forestManualRequestSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  sensitivity: z.number().min(0).max(1),
  minimum_patch_hectares: z.number().min(0.05).max(50),
}).strict();

export const forestStoredRequestSchema = z.union([
  forestAnalysisInputSchema,
  forestManualRequestSchema,
]);

export const forestChangeFeatureSchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({
    change: z.enum(["loss", "gain"]),
    area_sq_km: z.number().nonnegative(),
  }).passthrough(),
  geometry: z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.unknown(),
  }),
});

export const forestResultSchema = z.object({
  engine: z.string(),
  summary: z.object({
    aoi_area_sq_km: z.number().nonnegative(),
    forest_loss_sq_km: z.number().nonnegative(),
    forest_gain_sq_km: z.number().nonnegative(),
    net_change_sq_km: z.number(),
    changed_percent: z.number().min(0).max(100),
    forest_loss_hectares: z.number().nonnegative(),
    forest_cover_before_percent: z.number().min(0).max(100).nullable(),
    forest_cover_after_percent: z.number().min(0).max(100).nullable(),
    annualized_loss_sq_km: z.number().nonnegative().nullable(),
  }),
  bounds: z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() }),
  image: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  change_geojson: z.object({
    type: z.literal("FeatureCollection"),
    features: z.array(forestChangeFeatureSchema),
  }),
  legend: z.object({ loss: z.string(), gain: z.string() }),
  insights: z.object({
    field_priority: z.enum(["low", "medium", "high"]),
    trend: z.enum(["net forest loss", "net forest gain", "stable"]),
    analysis_confidence_percent: z.number().min(0).max(100),
    valid_pixel_percent: z.number().min(0).max(100),
    comparison_quality: z.enum(["strong", "moderate", "limited", "standard"]),
    observation_gap_days: z.number().int().nonnegative().nullable(),
    seasonal_gap_days: z.number().int().nonnegative().nullable(),
    mean_ndvi_before: z.number().nullable(),
    mean_ndvi_after: z.number().nullable(),
    minimum_patch_hectares: z.number().positive(),
    loss_hotspots: z.array(z.object({
      rank: z.number().int().positive(),
      area_sq_km: z.number().nonnegative(),
      longitude: z.number(),
      latitude: z.number(),
    })),
    carbon_exposure_tonnes_co2e: z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() }),
    recommendation: z.string(),
  }),
  source: z.object({ type: z.string() }).passthrough(),
  warnings: z.array(z.string()),
  artifacts: forestArtifactsSchema.optional(),
}).passthrough();

export const forestAnalysisStatusSchema = z.enum(["queued", "processing", "completed", "failed"]);

const forestAnalysisWireSchema = z.object({
  _id: objectId.optional(),
  id: objectId.optional(),
  projectId: objectId,
  requestedBy: objectId,
  status: forestAnalysisStatusSchema,
  request: forestStoredRequestSchema,
  result: forestResultSchema.nullish(),
  artifacts: forestArtifactsSchema,
  error: z.string().nullish(),
  jobId: z.string().nullish(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).refine((analysis) => Boolean(analysis.id ?? analysis._id), {
  message: "Forest analysis response is missing an ID.",
});

export const forestAnalysisSchema = forestAnalysisWireSchema.transform((analysis) => ({
  ...analysis,
  id: analysis.id ?? analysis._id!,
}));

export const forestAnalysesResponseSchema = z.object({ data: z.array(forestAnalysisSchema) });
export const forestAnalysisResponseSchema = z.object({ data: forestAnalysisSchema });

export type ForestArtifactName = z.infer<typeof forestArtifactNameSchema>;
export type ForestArtifact = z.infer<typeof forestArtifactSchema>;
export type ForestArtifacts = z.infer<typeof forestArtifactsSchema>;
export type ForestAnalysisInput = z.infer<typeof forestAnalysisInputSchema>;
export type ForestChangeFeature = z.infer<typeof forestChangeFeatureSchema>;
export type ForestResult = z.infer<typeof forestResultSchema>;
export type ForestAnalysis = z.infer<typeof forestAnalysisSchema>;
