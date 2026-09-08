import { runPoints, runs, type LiftrDb } from "@liftr/db";
import { and, desc, eq } from "drizzle-orm";
import type { RunPoint } from "@liftr/shared";

export function findRecentRuns(db: LiftrDb, userId: string, limit = 50) {
  return db.query.runs.findMany({ where: eq(runs.userId, userId), orderBy: desc(runs.startedAt), limit });
}

export function findRunById(db: LiftrDb, userId: string, id: string) {
  return db.query.runs.findFirst({ where: and(eq(runs.userId, userId), eq(runs.id, id)) });
}

export function findRunByClientId(db: LiftrDb, userId: string, clientId: string) {
  return db.query.runs.findFirst({ where: and(eq(runs.userId, userId), eq(runs.clientId, clientId)) });
}

/** `run_points` has no `user_id` of its own (child-via-parent, like `sets`/`workout_exercises`)
 *  — callers must already have resolved/authorized `runId` via `findRunById` before calling this. */
export function findRunPoints(db: LiftrDb, runId: string) {
  return db.query.runPoints.findMany({ where: eq(runPoints.runId, runId), orderBy: runPoints.idx });
}

export function deleteRun(db: LiftrDb, userId: string, id: string) {
  return db.delete(runs).where(and(eq(runs.userId, userId), eq(runs.id, id)));
}

export interface NewRun {
  source: "gpx" | "fit" | "manual" | "healthconnect";
  name: string | null;
  startedAt: Date;
  clientId: string;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  avgHr?: number | null;
  elevationGainM?: number | null;
}

export async function insertRun(db: LiftrDb, userId: string, values: NewRun) {
  const [run] = await db
    .insert(runs)
    .values({ ...values, userId })
    .returning();
  if (!run) throw new Error("run insert failed");
  return run;
}

/** The replay-enabling table — never discard points after computing the summary. */
export function insertRunPoints(db: LiftrDb, runId: string, points: (RunPoint & { idx: number })[]) {
  if (points.length === 0) return Promise.resolve();
  return db.insert(runPoints).values(
    points.map((p) => ({
      runId,
      idx: p.idx,
      t: new Date(p.t),
      lat: p.lat,
      lon: p.lon,
      ele: p.ele ?? null,
      hr: p.hr ?? null,
      cadence: p.cadence ?? null,
    })),
  );
}
