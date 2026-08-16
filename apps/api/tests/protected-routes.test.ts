import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createApp } from "../src/app.js";

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

describe("authentication boundary", () => {
  const app = createApp();

  it.each([
    "/api/v1/projects",
    "/api/v1/carbon/context?projectId=64b64b64b64b64b64b64b64b",
    "/api/v1/anomaly/devices?projectId=64b64b64b64b64b64b64b64b",
  ])("protects %s", async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects invalid registration input before database access", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "person@example.com", password: "short" });
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("requires a refresh cookie and safely clears missing sessions", async () => {
    const response = await request(app).post("/api/v1/auth/refresh");
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe("REFRESH_TOKEN_REQUIRED");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("allows idempotent logout without an existing session", async () => {
    const response = await request(app).post("/api/v1/auth/logout");
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });
});
