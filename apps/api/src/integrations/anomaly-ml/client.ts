import { z } from "zod";

import { env } from "../../config/env.js";
import { createMlClient, parseMlResponse } from "../ml-client.js";

const timestampSchema = z.string().datetime({ offset: true });
const anomalyStatusSchema = z.enum(["NORMAL", "ANOMALY"]);
const anomalySeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const anomalyReadingSchema = z
  .object({
    device_id: z.string().min(1).max(64),
    energy_kwh: z.number().min(0).max(100_000),
    timestamp: timestampSchema.default(() => new Date().toISOString()),
    message_id: z.string().max(128).optional(),
    temperature: z.number().min(-80).max(150).optional(),
    voltage: z.number().min(0).max(1_000).optional(),
    current: z.number().min(0).max(10_000).optional(),
    user_id: z.string().max(128).optional(),
  })
  .strict();

export const anomalyAlertSchema = z
  .object({
    alert_id: z.string(),
    device_id: z.string(),
    status: anomalyStatusSchema,
    severity: anomalySeveritySchema,
    score: z.number(),
    expected_range: z.object({ min: z.number(), max: z.number() }).strict(),
    observed: z.number(),
    reasons: z.array(z.string()),
    signals: z.array(
      z
        .object({
          name: z.string(),
          value: z.number(),
          contribution: z.number(),
          interpretation: z.string(),
        })
        .strict(),
    ),
    recommended_action: z.string(),
    timestamp: timestampSchema,
  })
  .strict();

export const anomalyDeviceSchema = z
  .object({
    device_id: z.string(),
    name: z.string(),
    asset_type: z.string(),
    location: z.string(),
    expected_range: z.object({ min: z.number(), max: z.number() }).strict(),
    readings_seen: z.number().int().nonnegative(),
    latest_energy_kwh: z.number().nullable(),
  })
  .strict();

export const anomalyTimelinePointSchema = z
  .object({
    timestamp: timestampSchema,
    energy_kwh: z.number(),
    lower_bound: z.number(),
    upper_bound: z.number(),
    status: anomalyStatusSchema,
    score: z.number(),
  })
  .strict();

export const anomalyDashboardSchema = z
  .object({
    device: anomalyDeviceSchema,
    timeline: z.array(anomalyTimelinePointSchema),
    alerts: z.array(anomalyAlertSchema),
    anomaly_rate: z.number(),
    emissions_at_risk_kg: z.number(),
    period_hours: z.number().int().min(1).max(720),
  })
  .strict();

export const anomalyAuditLogSchema = z
  .object({
    audit_id: z.string(),
    device_id: z.string(),
    user_id: z.string().nullable(),
    event_type: z.string(),
    severity: z.string(),
    score: z.number(),
    timestamp: timestampSchema,
    action: z.string(),
    result: z.string(),
  })
  .strict();

export type AnomalyReading = z.infer<typeof anomalyReadingSchema>;
export type AnomalyAlert = z.infer<typeof anomalyAlertSchema>;
export type AnomalyDevice = z.infer<typeof anomalyDeviceSchema>;
export type AnomalyDashboard = z.infer<typeof anomalyDashboardSchema>;

const client = createMlClient("anomaly-ml", env.ANOMALY_ML_URL, 5_000);

export async function ingestReading(input: unknown, requestId: string): Promise<AnomalyAlert> {
  const validatedInput = anomalyReadingSchema.parse(input);
  const { data } = await client.post<unknown>("/api/v1/iot/readings", validatedInput, {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("anomaly-ml", anomalyAlertSchema, data);
}

export async function listAnomalyAlerts(
  requestId: string,
  filters: { device_id?: string; severity?: "LOW" | "MEDIUM" | "HIGH" } = {},
): Promise<AnomalyAlert[]> {
  const { data } = await client.get<unknown>("/api/v1/security/alerts", {
    headers: { "x-request-id": requestId },
    params: filters,
  });
  return parseMlResponse("anomaly-ml", z.array(anomalyAlertSchema), data);
}

export async function getAnomalyAlert(alertId: string, requestId: string): Promise<AnomalyAlert> {
  const { data } = await client.get<unknown>(`/api/v1/security/alerts/${encodeURIComponent(alertId)}`, {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("anomaly-ml", anomalyAlertSchema, data);
}

export async function listAnomalyDevices(requestId: string): Promise<AnomalyDevice[]> {
  const { data } = await client.get<unknown>("/api/v1/devices", {
    headers: { "x-request-id": requestId },
  });
  return parseMlResponse("anomaly-ml", z.array(anomalyDeviceSchema), data);
}

export async function getAnomalyDashboard(
  deviceId: string,
  hours: number,
  requestId: string,
): Promise<AnomalyDashboard> {
  const { data } = await client.get<unknown>("/api/v1/dashboard", {
    headers: { "x-request-id": requestId },
    params: { device_id: deviceId, hours },
  });
  return parseMlResponse("anomaly-ml", anomalyDashboardSchema, data);
}

export async function listAnomalyAuditLogs(
  requestId: string,
  deviceId?: string,
): Promise<z.infer<typeof anomalyAuditLogSchema>[]> {
  const { data } = await client.get<unknown>("/api/v1/audit-logs", {
    headers: { "x-request-id": requestId },
    params: deviceId ? { device_id: deviceId } : {},
  });
  return parseMlResponse("anomaly-ml", z.array(anomalyAuditLogSchema), data);
}
