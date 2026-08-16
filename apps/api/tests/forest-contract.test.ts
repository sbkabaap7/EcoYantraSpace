import { describe, expect, it } from "vitest";

import { forestResultSchema } from "../src/integrations/forest-ml/contract.js";
import {
  artifactContentTypeFromKey,
  artifactNameFromKey,
  extractForestArtifacts,
} from "../src/jobs/forest.artifacts.js";
import {
  forestManualInputSchema,
  forestSatelliteInputSchema,
} from "../src/modules/forest/forest.schemas.js";

const projectId = "64b7f1d2a5c4e3f210987654";

function validSatelliteInput(): Record<string, unknown> {
  return {
    after_end: "2025-02-28",
    after_start: "2025-01-01",
    before_end: "2023-02-28",
    before_start: "2023-01-01",
    east: 77.1,
    north: 10.1,
    projectId,
    south: 10,
    west: 77,
  };
}

function validManualResult(): Record<string, unknown> {
  return {
    bounds: { east: 77.1, north: 10.1, south: 10, west: 77 },
    change_geojson: { features: [], type: "FeatureCollection" },
    engine: "rgb-vegetation-baseline-v1",
    image: { height: 128, width: 128 },
    insights: {
      analysis_confidence_percent: 96,
      carbon_exposure_tonnes_co2e: { high: 0, low: 0 },
      comparison_quality: "standard",
      field_priority: "low",
      loss_hotspots: [],
      mean_ndvi_after: null,
      mean_ndvi_before: null,
      minimum_patch_hectares: 0.5,
      observation_gap_days: null,
      recommendation: "No major signal; continue periodic monitoring.",
      seasonal_gap_days: null,
      trend: "stable",
      valid_pixel_percent: 100,
    },
    legend: { gain: "#22c55e", loss: "#ef4444" },
    ndvi_delta_overlay_data_url: null,
    overlay_data_url: `data:image/png;base64,${Buffer.from("overlay").toString("base64")}`,
    source: { type: "manual_upload" },
    summary: {
      annualized_loss_sq_km: null,
      aoi_area_sq_km: 121.2,
      changed_percent: 0,
      forest_cover_after_percent: null,
      forest_cover_before_percent: null,
      forest_gain_sq_km: 0,
      forest_loss_hectares: 0,
      forest_loss_sq_km: 0,
      net_change_sq_km: 0,
    },
    warnings: ["Validate detections against field observations."],
  };
}

function validSatelliteResult(): Record<string, unknown> {
  const result = validManualResult();
  const preview = (value: string) =>
    `data:image/jpeg;base64,${Buffer.from(value).toString("base64")}`;
  const scene = (sceneId: string, date: string, previewDataUrl: string) => ({
    catalog_provider: "Microsoft Planetary Computer",
    cloud_cover_percent: 2,
    coverage_percent: 100,
    date,
    platform: "Sentinel-2B",
    preview_data_url: previewDataUrl,
    processed_height: 64,
    processed_width: 64,
    resolution_m: 10,
    scene_id: sceneId,
    valid_pixel_percent: 98,
  });

  return {
    ...result,
    engine: "sentinel-2-ndvi-change-v1",
    insights: {
      ...(result.insights as Record<string, unknown>),
      comparison_quality: "strong",
      mean_ndvi_after: 0.62,
      mean_ndvi_before: 0.71,
      observation_gap_days: 731,
      seasonal_gap_days: 0,
      valid_pixel_percent: 98,
    },
    ndvi_delta_overlay_data_url: `data:image/png;base64,${Buffer.from("ndvi").toString("base64")}`,
    source: {
      after: scene("after-scene", "2025-01-15", preview("after")),
      before: scene("before-scene", "2023-01-15", preview("before")),
      cache: { capacity: 32, entries: 2, hits: 0, misses: 2 },
      collection: "Sentinel-2 Level-2A",
      provider: "Microsoft Planetary Computer",
      providers: ["Microsoft Planetary Computer"],
      retrieval_seconds: 2.4,
      type: "automatic_satellite",
    },
    summary: {
      ...(result.summary as Record<string, unknown>),
      annualized_loss_sq_km: 0,
      forest_cover_after_percent: 71,
      forest_cover_before_percent: 78,
    },
  };
}

describe("Forest request contract", () => {
  it("applies the FastAPI satellite defaults", () => {
    const result = forestSatelliteInputSchema.parse(validSatelliteInput());
    expect(result).toMatchObject({
      max_cloud: 20,
      minimum_patch_hectares: 0.5,
      sensitivity: 0.55,
    });
  });

  it("rejects an AOI larger than the model's 2,500 km² limit", () => {
    const result = forestSatelliteInputSchema.safeParse({
      ...validSatelliteInput(),
      east: 79,
      north: 12,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("2,500"))).toBe(true);
    }
  });

  it("rejects overlapping periods and future satellite dates", () => {
    const result = forestSatelliteInputSchema.safeParse({
      ...validSatelliteInput(),
      after_end: "2999-02-28",
      after_start: "2023-02-28",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["after_start", "after_end"]),
      );
    }
  });

  it("coerces multipart values and validates manual bounds", () => {
    expect(
      forestManualInputSchema.parse({
        east: "77.1",
        north: "10.1",
        projectId,
        south: "10",
        west: "77",
      }),
    ).toMatchObject({ east: 77.1, north: 10.1, south: 10, west: 77 });

    expect(
      forestManualInputSchema.safeParse({
        east: "76",
        north: "10.1",
        projectId,
        south: "10",
        west: "77",
      }).success,
    ).toBe(false);
  });
});

describe("Forest ML result and artifact contract", () => {
  it("validates and extracts the real manual result shape", () => {
    const parsed = forestResultSchema.parse(validManualResult());
    const extracted = extractForestArtifacts(parsed);
    expect(extracted.artifacts).toHaveLength(1);
    expect(extracted.artifacts[0]).toMatchObject({
      contentType: "image/png",
      name: "overlay",
    });
    expect(extracted.artifacts[0]?.body.toString()).toBe("overlay");
    expect(extracted.result).not.toHaveProperty("overlay_data_url");
    expect(extracted.result).not.toHaveProperty("ndvi_delta_overlay_data_url");
    expect(extracted.result).toMatchObject({ source: { type: "manual_upload" } });
  });

  it("maps only recognized private artifact keys", () => {
    expect(artifactNameFromKey("forest/project/id/outputs/overlay.png")).toBe("overlay");
    expect(artifactNameFromKey("forest/project/id/inputs/before-input.webp")).toBe("before-input");
    expect(artifactNameFromKey("forest/project/id/untrusted.png")).toBeUndefined();
    expect(artifactContentTypeFromKey("forest/project/id/after-input.tiff")).toBe("image/tiff");
  });

  it("extracts satellite previews and NDVI output without retaining base64 in Mongo", () => {
    const parsed = forestResultSchema.parse(validSatelliteResult());
    const extracted = extractForestArtifacts(parsed);
    expect(extracted.artifacts.map((artifact) => artifact.name).sort()).toEqual([
      "after-preview",
      "before-preview",
      "ndvi-delta",
      "overlay",
    ]);
    expect(extracted.result).not.toHaveProperty("source.before.preview_data_url");
    expect(extracted.result).not.toHaveProperty("source.after.preview_data_url");
  });
});
