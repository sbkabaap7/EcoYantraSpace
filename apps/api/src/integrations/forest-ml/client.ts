import { z } from "zod";

import { env } from "../../config/env.js";
import { createMlClient } from "../ml-client.js";

const forestResultSchema = z.object({}).passthrough();
const client = createMlClient("forest-ml", env.FOREST_ML_URL, 180_000);
export async function detectSatellite(input: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>> { const { data } = await client.post<unknown>("/api/v1/detect/satellite", input, { headers: { "x-request-id": requestId } }); return forestResultSchema.parse(data); }
export async function detectUploaded(input: Record<string, string | number>, before: Buffer, after: Buffer, requestId: string): Promise<Record<string, unknown>> { const form = new FormData(); form.set("before", new Blob([before]), "before.bin"); form.set("after", new Blob([after]), "after.bin"); for (const [key, value] of Object.entries(input)) form.set(key, String(value)); const { data } = await client.post<unknown>("/api/v1/detect", form, { headers: { "x-request-id": requestId } }); return forestResultSchema.parse(data); }
