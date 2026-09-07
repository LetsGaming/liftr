import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import type { FastifyInstance } from "fastify";
import { registerExportRoutes } from "~server/routes/export.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

let app: FastifyInstance;
let db: LiftrDb;

beforeEach(() => {
  ({ app, db } = createTestApp());
  registerExportRoutes(app, db);
});

describe("GET /api/export.zip", () => {
  it("returns an empty-but-valid zip when there is no data yet", async () => {
    const res = await app.inject({ method: "GET", url: "/api/export.zip" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    // ZIP local-file-header magic bytes ("PK\x03\x04") — confirms a real zip was written, not an
    // empty/garbage buffer.
    expect(res.rawPayload.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("names the download with today's date", async () => {
    const today = new Date().toISOString().slice(0, 10);

    const res = await app.inject({ method: "GET", url: "/api/export.zip" });

    expect(res.headers["content-disposition"]).toBe(`attachment; filename="liftr-export-${today}.zip"`);
  });

  it("includes every source CSV with the seeded rows' data (store method, so plain text is readable directly in the raw bytes)", async () => {
    const exercise = await insertTestExercise(db, { slug: "export-test-exercise" });
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "export-workout-1", startedAt: new Date("2026-09-01T10:00:00Z"), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values({
      workoutExerciseId: we!.id,
      setIndex: 0,
      weightKg: 60,
      reps: 5,
      kind: "normal",
      isWarmup: false,
      loggedAt: new Date("2026-09-01T10:05:00Z"),
      clientId: "export-set-1",
    });
    await db.insert(runs).values({
      source: "manual",
      name: "Export Test Run",
      startedAt: new Date("2026-09-02T08:00:00Z"),
      distanceM: 5000,
      durationS: 1800,
      clientId: "export-run-1",
    });
    await db.insert(bodyweightLogs).values({ date: "2026-09-03", weightKg: 82.5 });

    const res = await app.inject({ method: "GET", url: "/api/export.zip" });

    expect(res.statusCode).toBe(200);
    const raw = res.rawPayload.toString("latin1");

    expect(raw).toContain("workouts.csv");
    expect(raw).toContain("sets.csv");
    expect(raw).toContain("runs.csv");
    expect(raw).toContain("bodyweight.csv");

    // workouts.csv exports the row's own id, not the sync `clientId` — assert on the id actually
    // returned from the insert.
    expect(raw).toContain(workout!.id);
    expect(raw).toContain("export-test-exercise");
    expect(raw).toContain("Export Test Run");
    expect(raw).toContain("82.5");
  });
});
