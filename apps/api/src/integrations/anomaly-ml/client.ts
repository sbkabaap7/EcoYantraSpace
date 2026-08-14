import { z } from "zod";

import { env } from "../../config/env.js";
import { createMlClient } from "../ml-client.js";

const alertSchema = z.object({ alert_id: z.string(), device_id: z.string(), status: z.enum(["NORMAL", "ANOMALY"]), severity: z.enum(["LOW", "MEDIUM", "HIGH"]), score: z.number(), timestamp: z.string() }).passthrough();
const client = createMlClient("anomaly-ml", env.ANOMALY_ML_URL, 5_000);
export type AnomalyAlert = z.infer<typeof alertSchema>;
export async function ingestReading(input: Record<string, unknown>, requestId: string): Promise<AnomalyAlert> { const { data } = await client.post<unknown>("/api/v1/iot/readings", input, { headers: { "x-request-id": requestId } }); return alertSchema.parse(data); }
