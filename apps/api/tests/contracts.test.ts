import type { Request } from "express";
import { describe, expect, it } from "vitest";

import {
  anomalyAlertSchema,
  anomalyReadingSchema,
} from "../src/integrations/anomaly-ml/client.js";
import { carbonForecastSchema } from "../src/integrations/carbon-ml/client.js";
import { parseMlResponse } from "../src/integrations/ml-client.js";
import { carbonForecastInputSchema } from "../src/modules/carbon/carbon.routes.js";
import {
  hashRefreshToken,
  readRefreshToken,
} from "../src/modules/auth/refresh-session.js";
import { HttpError } from "../src/utils/http-error.js";

const anomalyAlert = {
  alert_id: "alert-1",
  device_id: "17",
  status: "ANOMALY",
  severity: "HIGH",
  score: 0.91,
  expected_range: { min: 480, max: 530 },
  observed: 712,
  reasons: ["outside the device-specific expected range"],
  signals: [
    {
      name: "range breach",
      value: 1.2,
      contribution: 0.91,
      interpretation: "Observed energy is beyond the learned operating envelope.",
    },
  ],
  recommended_action: "Inspect the device.",
  timestamp: "2026-08-15T12:00:00Z",
} as const;

const carbonForecast = {
  model: "hybrid_ridge_energy_v2",
  generated_at: "2026-08-15T12:00:00Z",
  data_through: "2026-08-15T11:00:00Z",
  hours: 1,
  scenario: {
    region: "demo",
    efficiency_percent: 0,
    renewable_growth_percent: 0,
    temperature_delta_c: 0,
    custom_factor_kg_per_kwh: null,
  },
  emission_factor: {
    factor_kg_per_kwh: 0.47,
    unit: "kgCO2e/kWh",
    region: "DEMO_GENERIC_GRID",
    source: "Illustrative factor",
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    is_verified: false,
  },
  forecast: [
    {
      timestamp: "2026-08-15T13:00:00Z",
      energy_kwh: 100,
      co2_kg: 40,
      lower: 90,
      upper: 110,
      co2_lower_kg: 36,
      co2_upper_kg: 44,
      temperature_c: 28,
      solar_kwh: 10,
      wind_kwh: 2,
      renewable_share_percent: 12,
      carbon_intensity_kg_per_kwh: 0.4,
    },
  ],
  summary: {
    total_energy_kwh: 100,
    total_co2_kg: 40,
    renewable_energy_kwh: 12,
    average_carbon_intensity: 0.4,
    peak_hour: { timestamp: "2026-08-15T13:00:00Z", energy_kwh: 100 },
    cleanest_window: {
      start: "2026-08-15T13:00:00Z",
      end: "2026-08-15T13:00:00Z",
      average_carbon_intensity: 0.4,
    },
    shift_opportunity: {
      from_timestamp: "2026-08-15T13:00:00Z",
      to_timestamp: "2026-08-15T13:00:00Z",
      flexible_load_kwh: 10,
      estimated_savings_kg: 0,
    },
    recommendation: "Move flexible load.",
    recommendations: ["Move flexible load."],
  },
} as const;

describe("ML adapter contracts", () => {
  it("accepts the complete Carbon response and rejects incomplete upstream data", () => {
    expect(carbonForecastSchema.parse(carbonForecast).model).toBe("hybrid_ridge_energy_v2");
    let thrown: unknown;
    try {
      parseMlResponse("carbon-ml", carbonForecastSchema, { model: "partial" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({ code: "ML_INVALID_RESPONSE", statusCode: 502 });
  });

  it("uses only actual Anomaly fields and rejects invented confidence", () => {
    expect(anomalyAlertSchema.parse(anomalyAlert).score).toBe(0.91);
    expect(anomalyAlertSchema.safeParse({ ...anomalyAlert, confidence: 0.99 }).success).toBe(false);
  });

  it("defaults an omitted Anomaly timestamp and rejects unknown input fields", () => {
    expect(anomalyReadingSchema.parse({ device_id: "17", energy_kwh: 512 }).timestamp).toMatch(/Z$/);
    expect(
      anomalyReadingSchema.safeParse({ device_id: "17", energy_kwh: 512, unsupported_sensor: 1 }).success,
    ).toBe(false);
  });

  it("rejects unsupported Carbon regions at the public boundary", () => {
    const base = { projectId: "64b64b64b64b64b64b64b64b" };
    expect(carbonForecastInputSchema.parse(base)).toMatchObject({ hours: 24, region: "demo" });
    expect(carbonForecastInputSchema.safeParse({ ...base, region: "unknown" }).success).toBe(false);
  });
});

describe("refresh credentials", () => {
  it("hashes opaque refresh tokens before persistence", () => {
    const raw = "opaque-refresh-token";
    expect(hashRefreshToken(raw)).not.toBe(raw);
    expect(hashRefreshToken(raw)).toHaveLength(64);
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
  });

  it("reads only the configured refresh cookie", () => {
    const request = {
      get: (header: string) =>
        header.toLowerCase() === "cookie" ? "other=value; ecoyantra_refresh=expected-token" : undefined,
    } as unknown as Request;
    expect(readRefreshToken(request)).toBe("expected-token");
  });
});
