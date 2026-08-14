export type ServiceStatus = "ok" | "ready" | "not_ready";

export interface HealthResponse {
  requestId: string;
  service: string;
  status: "ok";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

export interface ReadinessCheck {
  name: string;
  status: "ready" | "not_ready";
}

export interface ReadinessResponse {
  checks: ReadinessCheck[];
  requestId: string;
  service: string;
  status: "ready" | "not_ready";
  timestamp: string;
}
