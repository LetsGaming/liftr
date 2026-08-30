import { runPoints, runs, type LiftrDb } from "@liftr/db";
import { desc, eq } from "drizzle-orm";
import type { RunPoint } from "@liftr/shared";

export function findRecentRuns(db: LiftrDb, limit = 50) {
  return db.query.runs.findMany({ orderBy: desc(runs.startedAt), limit });
}

export function findRunById(db: LiftrDb, id: string) {
  return db.query.runs.findFirst({ where: eq(runs.id, id) });
}

export function findRunByClientId(db: LiftrDb, clientId: string) {
  return db.query.runs.findFirst({ where: eq(runs.clientId, clientId) });
}

export function findRunPoints(db: LiftrDb, runId: string) {
  return db.query.runPoints.findMany({ where: eq(runPoints.runId, runId), orderBy: runPoints.idx });
}

export function deleteRun(db: LiftrDb, id: string) {
  return db.delete(runs).where(eq(runs.id, id));
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

export async function insertRun(db: LiftrDb, values: NewRun) {
  const [run] = await db.insert(runs).values(values).returning();
  if (!run) throw new Error("run insert failed");
  return run;
}

/** The replay-enabling table (audit §5) — never discard points after computing the summary. */
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
