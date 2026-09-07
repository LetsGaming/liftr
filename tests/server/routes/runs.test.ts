import { beforeEach, describe, expect, it } from "vitest";
import multipart from "@fastify/multipart";
import { runPoints, runs, type LiftrDb } from "@liftr/db";
import { registerRunRoutes } from "~server/routes/runs.js";
import { createTestApp } from "../helpers/testApp.js";

/** Hand-builds a `multipart/form-data` body — the runs.ts import route parses the file inline
 *  via `req.file()` (no `schema.body`, see the route's own comment), so there's no JSON shortcut
 *  for exercising it; `app.inject` needs a real multipart payload + matching boundary header. */
function buildMultipart(parts: { name: string; value: string; filename?: string; contentType?: string }[]) {
  const boundary = "----liftrTestBoundary";
  const chunks = parts.map((p) => {
    const disposition = p.filename
      ? `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"`
      : `Content-Disposition: form-data; name="${p.name}"`;
    const contentType = p.contentType ? `\r\nContent-Type: ${p.contentType}` : "";
    return `--${boundary}\r\n${disposition}${contentType}\r\n\r\n${p.value}\r\n`;
  });
  const body = chunks.join("") + `--${boundary}--\r\n`;
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const validGpx = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="52.0" lon="13.0"><ele>34</ele><time>2026-01-01T10:00:00Z</time></trkpt>
<trkpt lat="52.001" lon="13.001"><ele>35</ele><time>2026-01-01T10:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;

async function seedRun(db: LiftrDb, overrides: Partial<typeof runs.$inferInsert> = {}) {
  const [row] = await db
    .insert(runs)
    .values({
      source: "manual",
      name: "Evening run",
      startedAt: new Date("2026-01-01T10:00:00Z"),
      distanceM: 5000,
      durationS: 1800,
      avgPaceSPerKm: 360,
      clientId: `client-${Math.random().toString(36).slice(2, 8)}`,
      ...overrides,
    })
    .returning();
  return row!;
}

describe("run routes", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let db: LiftrDb;

  beforeEach(async () => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
    registerRunRoutes(app, db);
  });

  describe("GET /api/runs", () => {
    it("returns an empty array when nothing has been logged", async () => {
      const res = await app.inject({ method: "GET", url: "/api/runs" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("lists recently logged runs", async () => {
      await seedRun(db);
      const res = await app.inject({ method: "GET", url: "/api/runs" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ source: "manual", name: "Evening run", distanceM: 5000 });
    });
  });

  describe("GET /api/runs/:id", () => {
    it("returns 404 for an unknown run", async () => {
      const res = await app.inject({ method: "GET", url: "/api/runs/does-not-exist" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("returns the run with its full point array", async () => {
      const run = await seedRun(db);
      await db.insert(runPoints).values([
        { runId: run.id, idx: 0, t: new Date("2026-01-01T10:00:00Z"), lat: 52.0, lon: 13.0 },
        { runId: run.id, idx: 1, t: new Date("2026-01-01T10:01:00Z"), lat: 52.001, lon: 13.001 },
      ]);

      const res = await app.inject({ method: "GET", url: `/api/runs/${run.id}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(run.id);
      expect(body.points).toHaveLength(2);
      expect(body.points[0]).toMatchObject({ idx: 0, lat: 52.0, lon: 13.0 });
    });
  });

  describe("DELETE /api/runs/:id", () => {
    it("returns 404 for an unknown run", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/runs/does-not-exist" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("deletes an existing run", async () => {
      const run = await seedRun(db);
      const res = await app.inject({ method: "DELETE", url: `/api/runs/${run.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      const getRes = await app.inject({ method: "GET", url: `/api/runs/${run.id}` });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("POST /api/runs (manual)", () => {
    it("logs a manual run", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs",
        payload: { name: "Morning jog", startedAt: "2026-01-02T07:00:00Z", distanceM: 3000, durationS: 900 },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({ source: "manual", name: "Morning jog", distanceM: 3000, durationS: 900 });
    });

    it("rejects a body missing required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs",
        payload: { name: "Missing distance", startedAt: "2026-01-02T07:00:00Z", durationS: 900 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects a non-positive distance", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs",
        payload: { startedAt: "2026-01-02T07:00:00Z", distanceM: -5, durationS: 900 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  describe("POST /api/runs/healthconnect", () => {
    it("imports a Health Connect workout", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs/healthconnect",
        payload: {
          platformId: "hc-123",
          name: "HC run",
          points: [
            { t: "2026-01-03T08:00:00Z", lat: 52.0, lon: 13.0 },
            { t: "2026-01-03T08:01:00Z", lat: 52.001, lon: 13.001 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ source: "healthconnect", name: "HC run" });
    });

    it("is idempotent on platformId", async () => {
      const payload = {
        platformId: "hc-idempotent",
        points: [
          { t: "2026-01-03T08:00:00Z", lat: 52.0, lon: 13.0 },
          { t: "2026-01-03T08:01:00Z", lat: 52.001, lon: 13.001 },
        ],
      };
      const first = await app.inject({ method: "POST", url: "/api/runs/healthconnect", payload });
      const second = await app.inject({ method: "POST", url: "/api/runs/healthconnect", payload });

      expect(first.json().id).toBe(second.json().id);
    });

    it("rejects a body missing platformId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs/healthconnect",
        payload: { points: [{ t: "2026-01-03T08:00:00Z", lat: 52.0, lon: 13.0 }] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects an empty points array", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/runs/healthconnect",
        payload: { platformId: "hc-empty", points: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  describe("POST /api/runs/import", () => {
    it("imports a valid GPX file", async () => {
      const { body, headers } = buildMultipart([
        { name: "file", value: validGpx, filename: "morning.gpx", contentType: "application/gpx+xml" },
      ]);
      const res = await app.inject({ method: "POST", url: "/api/runs/import", payload: body, headers });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ source: "gpx", name: "morning" });
    });

    it("rejects an unsupported file extension", async () => {
      const { body, headers } = buildMultipart([
        { name: "file", value: "not a run file", filename: "notes.txt", contentType: "text/plain" },
      ]);
      const res = await app.inject({ method: "POST", url: "/api/runs/import", payload: body, headers });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "unsupported_format" });
    });

    it("rejects a GPX file it can't parse", async () => {
      const { body, headers } = buildMultipart([
        { name: "file", value: "<not-gpx-at-all/>", filename: "broken.gpx", contentType: "application/gpx+xml" },
      ]);
      const res = await app.inject({ method: "POST", url: "/api/runs/import", payload: body, headers });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "parse_failed" });
    });

    it("returns 400 no_file when the multipart body carries no file part", async () => {
      const { body, headers } = buildMultipart([{ name: "note", value: "no file here" }]);
      const res = await app.inject({ method: "POST", url: "/api/runs/import", payload: body, headers });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "no_file" });
    });
  });
});
