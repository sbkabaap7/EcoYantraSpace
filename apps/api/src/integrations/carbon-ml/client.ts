import { z } from "zod";

import { env } from "../../config/env.js";
import { createMlClient, parseMlResponse } from "../ml-client.js";

const timestampSchema = z.string().datetime({ offset: true });

export const carbonScenarioSchema = z
  .object({
    region: z.string(),
    efficiency_percent: z.number().min(0).max(40),
    renewable_growth_percent: z.number().min(-50).max(300),
    temperature_delta_c: z.number().min(-10).max(10),
    custom_factor_kg_per_kwh: z.number().positive().max(2).nullable(),
  })
  .strict();

export const carbonScenarioInputSchema = z
  .object({
    region: z.string().default("demo"),
    efficiency_percent: z.number().min(0).max(40).default(0),
    renewable_growth_percent: z.number().min(-50).max(300).default(0),
    temperature_delta_c: z.number().min(-10).max(10).default(0),
    custom_factor_kg_per_kwh: z.number().positive().max(2).nullable().default(null),
  })
  .strict();

export const carbonForecastPointSchema = z
  .object({
    timestamp: timestampSchema,
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
  })
  .strict();

export const carbonForecastSchema = z
  .object({
    model: z.string(),
    generated_at: timestampSchema,
    data_through: timestampSchema,
    hours: z.number().int().min(1).max(168),
    scenario: carbonScenarioSchema,
    emission_factor: z
      .object({
        factor_kg_per_kwh: z.number().positive(),
        unit: z.string(),
        region: z.string(),
        source: z.string(),
        valid_from: z.string(),
        valid_to: z.string(),
        is_verified: z.boolean(),
      })
      .strict(),
    forecast: z.array(carbonForecastPointSchema),
    summary: z
      .object({
        total_energy_kwh: z.number(),
        total_co2_kg: z.number(),
        renewable_energy_kwh: z.number(),
        average_carbon_intensity: z.number(),
        peak_hour: z.object({ timestamp: timestampSchema, energy_kwh: z.number() }).strict(),
        cleanest_window: z
          .object({
            start: timestampSchema,
            end: timestampSchema,
            average_carbon_intensity: z.number(),
          })
          .strict(),
        shift_opportunity: z
          .object({
            from_timestamp: timestampSchema,
            to_timestamp: timestampSchema,
            flexible_load_kwh: z.number(),
            estimated_savings_kg: z.number(),
          })
          .strict(),
        recommendation: z.string(),
        recommendations: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const carbonHistorySchema = z
  .object({
    hours: z.number().int().min(24).max(2160),
    history: z.array(
      z
        .object({
          timestamp: timestampSchema,
          energy_kwh: z.number(),
          co2_kg: z.number(),
          temperature_c: z.number(),
          solar_kwh: z.number(),
          wind_kwh: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

export const carbonDataQualitySchema = z
  .object({
    score: z.number(),
    status: z.enum(["good", "attention", "poor"]),
    rows: z.number().int().nonnegative(),
    coverage_days: z.number().nonnegative(),
    completeness_percent: z.number().min(0).max(100),
    missing_hours: z.number().int().nonnegative(),
    extreme_outliers: z.number().int().nonnegative(),
    data_through: timestampSchema,
    age_hours: z.number().nonnegative(),
    source: z.string(),
  })
  .strict();

export const carbonRegionsSchema = z
  .object({
    regions: z.array(
      z
        .object({
          key: z.string(),
          region: z.string(),
          factor_kg_per_kwh: z.number().positive(),
          is_verified: z.boolean(),
        })
        .strict(),
    ),
    warning: z.string(),
  })
  .strict();

export const carbonMetricsSchema = z
  .object({
    model: z.string(),
    dataset: z
      .object({
        type: z.string(),
        hours: z.number().int().positive(),
        training_rows: z.number().int().nonnegative(),
        validation_rows: z.number().int().nonnegative(),
        test_rows: z.number().int().nonnegative(),
        chronological_split: z.boolean(),
        random_seed: z.number().int(),
      })
      .strict(),
    test_metrics: z.object({ mae: z.number(), rmse: z.number(), mape_percent: z.number() }).strict(),
    previous_day_baseline_metrics: z
      .object({ mae: z.number(), rmse: z.number(), mape_percent: z.number() })
      .strict(),
    model_strategy: z
      .object({
        type: z.string(),
        regression_weight: z.number(),
        seasonal_weight: z.number(),
        interval_method: z.string(),
      })
      .strict(),
    interval_test_coverage_percent: z.number(),
    warning: z.string(),
  })
  .strict();

export const customCarbonForecastInputSchema = z
  .object({
    hours: z.number().int().min(1).max(168).default(24),
    history: z
      .array(
        z
          .object({
            timestamp: timestampSchema,
            energy_kwh: z.number().positive(),
            temperature_c: z.number().min(-60).max(70),
            solar_kwh: z.number().nonnegative(),
            wind_kwh: z.number().nonnegative(),
          })
          .strict(),
      )
      .min(168)
      .max(17_520)
      .superRefine((history, context) => {
        const timestamps = new Set<string>();
        history.forEach((observation, index) => {
          if (timestamps.has(observation.timestamp)) {
            context.addIssue({
              code: "custom",
              message: "History timestamps must be unique.",
              path: [index, "timestamp"],
            });
          }
          timestamps.add(observation.timestamp);
        });
      }),
    future_conditions: z
      .array(
        z
          .object({
            timestamp: timestampSchema,
            temperature_c: z.number().min(-60).max(70),
            solar_kwh: z.number().nonnegative(),
            wind_kwh: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(168)
      .default([]),
    scenario: carbonScenarioInputSchema.default({
      region: "demo",
      efficiency_percent: 0,
      renewable_growth_percent: 0,
      temperature_delta_c: 0,
      custom_factor_kg_per_kwh: null,
    }),
  })
  .strict();

export interface CarbonForecastInput {
  hours: number;
  region: "demo" | "low_carbon_demo" | "high_carbon_demo";
  efficiency_percent: number;
  renewable_growth_percent: number;
  temperature_delta_c: number;
  custom_factor_kg_per_kwh?: number | undefined;
}

export type CarbonForecast = z.infer<typeof carbonForecastSchema>;
export type CarbonHistory = z.infer<typeof carbonHistorySchema>;
export type CarbonDataQuality = z.infer<typeof carbonDataQualitySchema>;
export type CarbonRegions = z.infer<typeof carbonRegionsSchema>;
export type CarbonMetrics = z.infer<typeof carbonMetricsSchema>;

const client = createMlClient("carbon-ml", env.CARBON_ML_URL, 10_000);

export async function requestCarbonForecast(
  input: CarbonForecastInput,
  requestId: string,
): Promise<CarbonForecast> {
  const { data } = await client.get<unknown>("/api/v1/energy/forecast", {
    headers: { "x-request-id": requestId },
    params: input,
  });
  return parseMlResponse("carbon-ml", carbonForecastSchema, data);
}

export async function requestCustomCarbonForecast(
  input: z.infer<typeof customCarbonForecastInputSchema>,
  requestId: string,
): Promise<CarbonForecast> {
  const { data } = await client.post<unknown>("/api/v1/energy/forecast/custom", input, {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("carbon-ml", carbonForecastSchema, data);
}

export async function getCarbonHistory(hours: number, requestId: string): Promise<CarbonHistory> {
  const { data } = await client.get<unknown>("/api/v1/energy/history", {
    headers: { "x-request-id": requestId },
    params: { hours },
  });
  return parseMlResponse("carbon-ml", carbonHistorySchema, data);
}

export async function getCarbonDataQuality(requestId: string): Promise<CarbonDataQuality> {
  const { data } = await client.get<unknown>("/api/v1/data/quality", {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("carbon-ml", carbonDataQualitySchema, data);
}

export async function getCarbonRegions(requestId: string): Promise<CarbonRegions> {
  const { data } = await client.get<unknown>("/api/v1/emissions/regions", {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("carbon-ml", carbonRegionsSchema, data);
}

export async function getCarbonMetrics(requestId: string): Promise<CarbonMetrics> {
  const { data } = await client.get<unknown>("/api/v1/model/metrics", {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("carbon-ml", carbonMetricsSchema, data);
}
