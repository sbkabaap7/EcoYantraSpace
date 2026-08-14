import { z } from "zod";

import { env } from "../../config/env.js";
import { createMlClient } from "../ml-client.js";

const forecastSchema = z.object({ model: z.string(), generated_at: z.string(), forecast: z.array(z.object({ timestamp: z.string(), energy_kwh: z.number(), co2_kg: z.number() }).passthrough()), summary: z.object({ total_energy_kwh: z.number(), total_co2_kg: z.number() }).passthrough() }).passthrough();
const client = createMlClient("carbon-ml", env.CARBON_ML_URL, 10_000);
export type CarbonForecast = z.infer<typeof forecastSchema>;
export async function requestCarbonForecast(input: Record<string, unknown>, requestId: string): Promise<CarbonForecast> { const { data } = await client.get<unknown>("/api/v1/energy/forecast", { headers: { "x-request-id": requestId }, params: input }); return forecastSchema.parse(data); }
