import { z } from "zod";

const imageDataUrlSchema = z.string().regex(/^data:image\/(?:png|jpeg);base64,/);

const boundsSchema = z.object({
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
});

const changeFeatureSchema = z.object({
  geometry: z.object({
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    type: z.literal("Polygon"),
  }),
  properties: z.object({
    area_sq_km: z.number().nonnegative(),
    change: z.enum(["loss", "gain"]),
  }),
  type: z.literal("Feature"),
});

const sceneMetadataSchema = z
  .object({
    catalog_provider: z.string().min(1),
    cloud_cover_percent: z.number().nonnegative(),
    coverage_percent: z.number().nonnegative(),
    date: z.string().date(),
    platform: z.string().min(1),
    preview_data_url: imageDataUrlSchema,
    processed_height: z.number().int().positive(),
    processed_width: z.number().int().positive(),
    resolution_m: z.number().positive(),
    scene_id: z.string().min(1),
    valid_pixel_percent: z.number().min(0).max(100),
  })
  .passthrough();

const automaticSatelliteSourceSchema = z
  .object({
    after: sceneMetadataSchema,
    before: sceneMetadataSchema,
    cache: z.object({
      capacity: z.number().int().nonnegative(),
      entries: z.number().int().nonnegative(),
      hits: z.number().int().nonnegative(),
      misses: z.number().int().nonnegative(),
    }),
    collection: z.string().min(1),
    provider: z.string().min(1),
    providers: z.array(z.string().min(1)).min(1),
    retrieval_seconds: z.number().nonnegative(),
    type: z.literal("automatic_satellite"),
  })
  .passthrough();

const manualSourceSchema = z.object({ type: z.literal("manual_upload") }).passthrough();

export const forestResultSchema = z
  .object({
    bounds: boundsSchema,
    change_geojson: z.object({
      features: z.array(changeFeatureSchema),
      type: z.literal("FeatureCollection"),
    }),
    engine: z.string().min(1),
    image: z.object({
      height: z.number().int().positive(),
      width: z.number().int().positive(),
    }),
    insights: z.object({
      analysis_confidence_percent: z.number().min(0).max(100),
      carbon_exposure_tonnes_co2e: z.object({
        high: z.number().nonnegative(),
        low: z.number().nonnegative(),
      }),
      comparison_quality: z.enum(["standard", "strong", "moderate", "limited"]),
      field_priority: z.enum(["low", "medium", "high"]),
      loss_hotspots: z.array(
        z.object({
          area_sq_km: z.number().nonnegative(),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          rank: z.number().int().positive(),
        }),
      ),
      mean_ndvi_after: z.number().min(-1).max(1).nullable(),
      mean_ndvi_before: z.number().min(-1).max(1).nullable(),
      minimum_patch_hectares: z.number().min(0.05).max(50),
      observation_gap_days: z.number().int().nonnegative().nullable(),
      recommendation: z.string().min(1),
      seasonal_gap_days: z.number().int().nonnegative().nullable(),
      trend: z.enum(["net forest loss", "net forest gain", "stable"]),
      valid_pixel_percent: z.number().min(0).max(100),
    }),
    legend: z.object({
      gain: z.string().min(1),
      loss: z.string().min(1),
    }),
    ndvi_delta_overlay_data_url: imageDataUrlSchema.nullable(),
    overlay_data_url: imageDataUrlSchema,
    source: z.union([automaticSatelliteSourceSchema, manualSourceSchema]),
    summary: z.object({
      annualized_loss_sq_km: z.number().nonnegative().nullable(),
      aoi_area_sq_km: z.number().nonnegative(),
      changed_percent: z.number().min(0).max(100),
      forest_cover_after_percent: z.number().min(0).max(100).nullable(),
      forest_cover_before_percent: z.number().min(0).max(100).nullable(),
      forest_gain_sq_km: z.number().nonnegative(),
      forest_loss_hectares: z.number().nonnegative(),
      forest_loss_sq_km: z.number().nonnegative(),
      net_change_sq_km: z.number(),
    }),
    warnings: z.array(z.string().min(1)),
  })
  .passthrough();

export type ForestMlResult = z.infer<typeof forestResultSchema>;
