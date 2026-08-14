import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createApp } from "../src/app.js";

describe("operational endpoints", () => {
  const app = createApp();

  it("reports liveness with a request ID", async () => {
    const response = await request(app).get("/health").set("x-request-id", "test-health-001");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("test-health-001");
    expect(response.body).toMatchObject({
      requestId: "test-health-001",
      service: "ecoyantra-api",
      status: "ok",
      version: "0.1.0",
    });
  });

  it("reports readiness", async () => {
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      checks: [{ name: "process", status: "ready" }],
      service: "ecoyantra-api",
      status: "ready",
    });
  });

  it("normalizes missing routes", async () => {
    const response = await request(app).get("/missing");
    const body = z
      .object({
        error: z.object({ code: z.string() }),
        requestId: z.string(),
      })
      .parse(response.body);

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: {
        code: "ROUTE_NOT_FOUND",
      },
    });
    expect(body.requestId).not.toHaveLength(0);
  });
});
