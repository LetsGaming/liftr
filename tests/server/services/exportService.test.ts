import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, runs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { buildExportZip } from "~server/services/exportService.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

/** The zip is written with the "store" (no compression) method, so every CSV's bytes land
 *  verbatim in the output archive -- we can assert on the zip Buffer directly without a zip
 *  reader, the same way a hex/text editor opening the file would see them. */
function includesText(buf: Buffer, text: string): boolean {
  return buf.includes(Buffer.from(text, "utf-8"));
}

describe("buildExportZip", () => {
  it("produces a valid, non-empty zip with just CSV headers when nothing is logged", async () => {
    const zip = await buildExportZip(db);

    expect(zip).toBeInstanceOf(Buffer);
    expect(zip.length).toBeGreaterThan(0);
    // local file header signature (PK\x03\x04) must open the archive
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // end-of-central-directory signature must close it
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);

    for (const name of ["workouts.csv", "sets.csv", "runs.csv", "bodyweight.csv"]) {
      expect(includesText(zip, name)).toBe(true);
    }
    expect(includesText(zip, "id,routineId,startedAt,endedAt,pausedSeconds,notes\r\n")).toBe(true);
    expect(includesText(zip, "id,workoutId,exerciseSlug,setIndex,weightKg,reps,rpe,isWarmup,notes,loggedAt\r\n")).toBe(true);
    expect(includesText(zip, "id,source,name,startedAt,distanceM,durationS,avgPaceSPerKm,avgHr,elevationGainM\r\n")).toBe(true);
    expect(includesText(zip, "id,date,weightKg\r\n")).toBe(true);
  });

  it("includes a logged workout's own fields, formatting dates as ISO strings", async () => {
    const startedAt = new Date("2026-09-01T10:00:00.000Z");
    const endedAt = new Date("2026-09-01T11:00:00.000Z");
    await db.insert(workouts).values({
      clientId: "w-export",
      startedAt,
      endedAt,
      pausedSeconds: 30,
      notes: "felt strong",
    });

    const zip = await buildExportZip(db);

    expect(includesText(zip, startedAt.toISOString())).toBe(true);
    expect(includesText(zip, endedAt.toISOString())).toBe(true);
    expect(includesText(zip, "felt strong")).toBe(true);
  });

  it("writes an empty endedAt as a blank field rather than the literal string 'null'", async () => {
    await db.insert(workouts).values({
      clientId: "w-unfinished",
      startedAt: new Date("2026-09-01T10:00:00.000Z"),
      pausedSeconds: 0,
    });

    const zip = await buildExportZip(db);

    expect(includesText(zip, "null")).toBe(false);
    expect(includesText(zip, "undefined")).toBe(false);
  });

  it("includes a logged set joined to its exercise's slug, not its internal exercise id", async () => {
    const exercise = await insertTestExercise(db, { slug: "bench-press" });
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "w-set-export", startedAt: new Date("2026-09-01T10:00:00Z"), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    await db.insert(sets).values({
      workoutExerciseId: we!.id,
      setIndex: 0,
      weightKg: 82.5,
      reps: 5,
      rpe: 8,
      kind: "normal",
      isWarmup: false,
      notes: "PR attempt",
      loggedAt: new Date("2026-09-01T10:05:00Z"),
      clientId: "s-export",
    });

    const zip = await buildExportZip(db);

    expect(includesText(zip, "bench-press")).toBe(true);
    expect(includesText(zip, "82.5")).toBe(true);
    expect(includesText(zip, "PR attempt")).toBe(true);
    // the raw exercise id (a uuid, not the human-readable slug) should not leak into the sets csv
    expect(includesText(zip, exercise.id)).toBe(false);
  });

  it("includes a logged run's fields", async () => {
    await db.insert(runs).values({
      source: "gpx",
      name: "Morning run",
      startedAt: new Date("2026-09-01T06:00:00Z"),
      distanceM: 5000,
      durationS: 1500,
      avgPaceSPerKm: 300,
      avgHr: 150,
      elevationGainM: 42,
      clientId: "r-export",
    });

    const zip = await buildExportZip(db);

    expect(includesText(zip, "Morning run")).toBe(true);
    expect(includesText(zip, "5000")).toBe(true);
    expect(includesText(zip, "gpx")).toBe(true);
  });

  it("includes a logged bodyweight entry", async () => {
    await db.insert(bodyweightLogs).values({ date: "2026-09-01", weightKg: 78.4 });

    const zip = await buildExportZip(db);

    expect(includesText(zip, "2026-09-01")).toBe(true);
    expect(includesText(zip, "78.4")).toBe(true);
  });
});
