import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, type LiftrDb } from "@liftr/db";
import type { FastifyInstance } from "fastify";
import { registerBodyweightRoutes } from "~server/routes/bodyweight.js";
import { createTestApp } from "../helpers/testApp.js";

let app: FastifyInstance;
let db: LiftrDb;

beforeEach(() => {
  ({ app, db } = createTestApp());
  registerBodyweightRoutes(app, db);
});

async function insertLog(date: string, weightKg: number) {
  const [row] = await db.insert(bodyweightLogs).values({ date, weightKg }).returning();
  return row!;
}

describe("GET /api/bodyweight", () => {
  it("returns an empty array when nothing has been logged", async () => {
    const res = await app.inject({ method: "GET", url: "/api/bodyweight" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns logged entries most-recent-date first", async () => {
    await insertLog("2026-09-01", 80);
    await insertLog("2026-09-05", 81);

    const res = await app.inject({ method: "GET", url: "/api/bodyweight" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((r: { date: string }) => r.date)).toEqual(["2026-09-05", "2026-09-01"]);
  });
});

describe("POST /api/bodyweight", () => {
  it("logs a new entry and returns 201 with the created row", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bodyweight",
      payload: { date: "2026-09-07", weightKg: 78.5 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ date: "2026-09-07", weightKg: 78.5 });
    expect(typeof body.id).toBe("string");
  });

  it("upserts by date rather than creating a duplicate row", async () => {
    await app.inject({ method: "POST", url: "/api/bodyweight", payload: { date: "2026-09-07", weightKg: 78.5 } });
    const res = await app.inject({ method: "POST", url: "/api/bodyweight", payload: { date: "2026-09-07", weightKg: 79.2 } });

    expect(res.statusCode).toBe(201);
    expect(res.json().weightKg).toBe(79.2);

    const all = await db.query.bodyweightLogs.findMany();
    expect(all).toHaveLength(1);
  });

  it("rejects a malformed date with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bodyweight",
      payload: { date: "09-07-2026", weightKg: 78.5 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a weight over the 400kg sanity cap with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bodyweight",
      payload: { date: "2026-09-07", weightKg: 450 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing weightKg with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bodyweight",
      payload: { date: "2026-09-07" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});
