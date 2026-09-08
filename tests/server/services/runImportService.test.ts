import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, runPoints, runs, streaks, type LiftrDb } from "@liftr/db";
import {
  importHealthConnectRun,
  importRunFile,
  logManualRun,
  RunParseError,
  UnsupportedFileFormatError,
  type HealthConnectPoint,
} from "~server/services/runImportService.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

/**
 * Minimal valid GPX 1.1 fixture: 3 trackpoints, 5 seconds apart, each ~13m from the last (well
 * under the 8 m/s plausible-speed ceiling in @liftr/shared's summarizeRun, and well under the
 * 10s pause-gap threshold), each with an ele/hr extension so the summary's elevation-gain and
 * avg-HR branches are exercised too.
 */
const VALID_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Run</name>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050">
        <ele>34.0</ele>
        <time>2026-09-01T10:00:00Z</time>
        <extensions><hr>140</hr></extensions>
      </trkpt>
      <trkpt lat="52.5201" lon="13.4051">
        <ele>35.0</ele>
        <time>2026-09-01T10:00:05Z</time>
        <extensions><hr>145</hr></extensions>
      </trkpt>
      <trkpt lat="52.5202" lon="13.4052">
        <ele>36.0</ele>
        <time>2026-09-01T10:00:10Z</time>
        <extensions><hr>150</hr></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("importRunFile", () => {
  it("throws UnsupportedFileFormatError for a filename that isn't .gpx or .fit", async () => {
    await expect(importRunFile(db, OWNER_USER_ID, "run.txt", Buffer.from("whatever"))).rejects.toBeInstanceOf(UnsupportedFileFormatError);
  });

  it("throws RunParseError when the .gpx file's content doesn't parse as GPX", async () => {
    await expect(importRunFile(db, OWNER_USER_ID, "run.gpx", Buffer.from("<xml>not a gpx file</xml>"))).rejects.toBeInstanceOf(RunParseError);
  });

  it("throws RunParseError when the .fit file's content isn't a valid FIT binary", async () => {
    await expect(importRunFile(db, OWNER_USER_ID, "run.fit", Buffer.from("not a real fit file"))).rejects.toBeInstanceOf(RunParseError);
  });

  it("parses a valid GPX file, persists the run + every trackpoint, and credits the run streak", async () => {
    const result = await importRunFile(db, OWNER_USER_ID, "Morning Run.gpx", Buffer.from(VALID_GPX, "utf-8"));

    expect(result.source).toBe("gpx");
    expect(result.name).toBe("Morning Run"); // .gpx extension stripped
    expect(result.startedAt.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(result.distanceM).toBeGreaterThan(0);
    expect(result.durationS).toBe(10); // two 5s intervals, neither a pause nor a jitter spike
    expect(result.avgHr).toBe(145); // mean of 140/145/150
    expect(result.elevationGainM).toBeCloseTo(2, 5); // +1m then +1m
    expect(result.avgPaceSPerKm).not.toBeNull();

    const persistedRun = await db.query.runs.findFirst({ where: eq(runs.id, result.id) });
    expect(persistedRun).toBeDefined();

    const points = await db.query.runPoints.findMany({ where: eq(runPoints.runId, result.id) });
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.idx).sort()).toEqual([0, 1, 2]);

    const streakRows = await db.select().from(streaks).where(eq(streaks.date, "2026-09-01"));
    expect(streakRows).toHaveLength(1);
    expect(streakRows[0]!.kind).toBe("run");
  });

  it("generates a distinct clientId for each GPX import, so re-importing the same file doesn't collide", async () => {
    const first = await importRunFile(db, OWNER_USER_ID, "run1.gpx", Buffer.from(VALID_GPX, "utf-8"));
    const second = await importRunFile(db, OWNER_USER_ID, "run2.gpx", Buffer.from(VALID_GPX, "utf-8"));
    expect(first.clientId).not.toBe(second.clientId);
  });
});

describe("importHealthConnectRun", () => {
  const points: HealthConnectPoint[] = [
    { t: new Date("2026-09-02T08:00:00Z"), lat: 52.52, lon: 13.405, ele: 34, hr: 140 },
    { t: new Date("2026-09-02T08:00:05Z"), lat: 52.5201, lon: 13.4051, ele: 35, hr: 145 },
  ];

  it("persists a new run keyed by a healthconnect: prefixed clientId and credits the streak", async () => {
    const result = await importHealthConnectRun(db, OWNER_USER_ID, "platform-123", "HC Run", points);

    expect(result.source).toBe("healthconnect");
    expect(result.clientId).toBe("healthconnect:platform-123");
    expect(result.name).toBe("HC Run");

    const streakRows = await db.select().from(streaks).where(eq(streaks.date, "2026-09-02"));
    expect(streakRows).toHaveLength(1);
  });

  it("is idempotent: importing the same platformId twice returns the existing run instead of duplicating it", async () => {
    const first = await importHealthConnectRun(db, OWNER_USER_ID, "platform-abc", "First", points);
    const second = await importHealthConnectRun(db, OWNER_USER_ID, "platform-abc", "Second name ignored", points);

    expect(second.id).toBe(first.id);
    const allRuns = await db.select().from(runs).where(eq(runs.clientId, "healthconnect:platform-abc"));
    expect(allRuns).toHaveLength(1);
  });
});

describe("logManualRun", () => {
  it("persists a manual run with a computed pace and credits the streak", async () => {
    const startedAt = new Date("2026-09-03T07:00:00Z");
    const result = await logManualRun(db, OWNER_USER_ID, { name: "Manual 5k", startedAt, distanceM: 5000, durationS: 1500 });

    expect(result.source).toBe("manual");
    expect(result.name).toBe("Manual 5k");
    // 1500s / (5000m / 1000) = 300 s/km
    expect(result.avgPaceSPerKm).toBe(300);

    const streakRows = await db.select().from(streaks).where(eq(streaks.date, "2026-09-03"));
    expect(streakRows).toHaveLength(1);
    expect(streakRows[0]!.kind).toBe("run");

    const points = await db.query.runPoints.findMany({ where: eq(runPoints.runId, result.id) });
    expect(points).toHaveLength(0); // no GPS trace for a manual entry
  });

  it("leaves avgPaceSPerKm null when distanceM is zero, rather than dividing by zero", async () => {
    const result = await logManualRun(db, OWNER_USER_ID, {
      name: "Treadmill (no distance logged)",
      startedAt: new Date("2026-09-04T07:00:00Z"),
      distanceM: 0,
      durationS: 600,
    });

    expect(result.avgPaceSPerKm).toBeNull();
  });
});
