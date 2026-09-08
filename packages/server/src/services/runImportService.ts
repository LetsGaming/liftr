import { computeRunPlausibility, runRankValue, summarizeRun, type RunPoint } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { parseFit } from "../fit.js";
import { parseGpx } from "../gpx.js";
import { NotFoundError } from "../lib/errors.js";
import { findPlannedRouteById } from "../repositories/plannedRouteRepository.js";
import {
  findRunByClientId,
  insertRun,
  insertRunPoints,
  updateRunPlausibilityMultiplier,
  type NewRun,
} from "../repositories/runRepository.js";
import { creditStreak } from "../repositories/streakRepository.js";
import { recomputeRunRank } from "./runRankService.js";

/**
 * Running: import a GPX you own, or log a run manually with no file. All three write paths below
 * converge on the same `runs` + `run_points` tables and the same history/streak/rank plumbing — a
 * manual entry and an imported one are indistinguishable downstream except for the rank step
 * itself. Factored here (not left as three near-identical route handlers) because that
 * convergence is exactly the kind of duplicated-across-a-boundary shape that drifts if repeated.
 *
 * This is the run-analog of workoutService.ts's `applyFinishWorkout`: insert -> streak -> (for a
 * GPS-tracked run only) plausibility gate -> rank recompute. A manual run has no `run_points` to
 * independently check its claimed distance/duration against, so it's XP-only — it skips both the
 * plausibility computation and the rank recompute entirely, and `plausibilityMultiplier` stays
 * `null` on that row forever (never defaulted to 1, which would be a silent lie about a check that
 * never ran).
 */
async function persistRun(db: LiftrDb, userId: string, run: NewRun, points: (RunPoint & { idx: number })[]) {
  let inserted = await insertRun(db, userId, run);
  await insertRunPoints(db, inserted.id, points);
  const dateStr = run.startedAt.toISOString().slice(0, 10);
  await creditStreak(db, userId, dateStr, "run");

  let rankResult: Awaited<ReturnType<typeof recomputeRunRank>> = null;
  if (run.source !== "manual" && points.length > 0) {
    const plausibility = computeRunPlausibility({ distanceM: run.distanceM, durationS: run.durationS, points });
    inserted = await updateRunPlausibilityMultiplier(db, inserted.id, plausibility.multiplier);
    const { category } = runRankValue(run.distanceM, run.durationS);
    rankResult = await recomputeRunRank(db, userId, category, plausibility.multiplier, plausibility.reason);
  }

  return { ...inserted, rankResult };
}

export class UnsupportedFileFormatError extends Error {}
export class RunParseError extends Error {}

/** POST /api/runs/import — GPX or FIT file bytes in, a stored run + full point array out. */
export async function importRunFile(db: LiftrDb, userId: string, filename: string, buffer: Buffer) {
  const lower = filename.toLowerCase();
  const isGpx = lower.endsWith(".gpx");
  const isFit = lower.endsWith(".fit");
  if (!isGpx && !isFit) throw new UnsupportedFileFormatError("only .gpx and .fit are supported");

  let points: RunPoint[];
  try {
    points = isGpx ? parseGpx(buffer.toString("utf-8")) : parseFit(buffer);
  } catch (err) {
    throw new RunParseError((err as Error).message);
  }

  const summary = summarizeRun(points);
  const startedAt = new Date(points[0]!.t);

  return persistRun(
    db,
    userId,
    {
      source: isGpx ? "gpx" : "fit",
      name: filename.replace(/\.(gpx|fit)$/i, ""),
      startedAt,
      clientId: crypto.randomUUID(),
      distanceM: summary.distanceM,
      durationS: summary.durationS,
      avgPaceSPerKm: summary.avgPaceSPerKm,
      avgHr: summary.avgHr,
      elevationGainM: summary.elevationGainM,
    },
    points.map((p, idx) => ({ ...p, idx })),
  );
}

export interface HealthConnectPoint {
  t: Date;
  lat: number;
  lon: number;
  ele?: number | null;
  hr?: number | null;
}

/** POST /api/runs/healthconnect — native in-app import via capacitor-health. */
export async function importHealthConnectRun(
  db: LiftrDb,
  userId: string,
  platformId: string,
  name: string | null,
  rawPoints: HealthConnectPoint[],
) {
  const clientId = `healthconnect:${platformId}`;
  const existing = await findRunByClientId(db, userId, clientId);
  if (existing) return existing; // already imported this workout — idempotent, not an error

  const points = rawPoints.map((p) => ({ t: p.t.getTime(), lat: p.lat, lon: p.lon, ele: p.ele ?? undefined, hr: p.hr ?? undefined }));
  const summary = summarizeRun(points);
  const startedAt = new Date(points[0]!.t);

  return persistRun(
    db,
    userId,
    {
      source: "healthconnect",
      name,
      startedAt,
      clientId,
      distanceM: summary.distanceM,
      durationS: summary.durationS,
      avgPaceSPerKm: summary.avgPaceSPerKm,
      avgHr: summary.avgHr,
      elevationGainM: summary.elevationGainM,
    },
    points.map((p, idx) => ({ ...p, idx })),
  );
}

/** POST /api/runs — manual fallback for runs without a file. */
export async function logManualRun(
  db: LiftrDb,
  userId: string,
  input: {
    name: string | null;
    startedAt: Date;
    distanceM: number;
    durationS: number;
    plannedRouteId?: string | null;
    elevationGainM?: number | null;
  },
) {
  let elevationGainM = input.elevationGainM ?? null;
  if (input.plannedRouteId) {
    const route = await findPlannedRouteById(db, userId, input.plannedRouteId);
    if (!route) throw new NotFoundError(); // prevents a cross-user FK write
    if (elevationGainM == null) elevationGainM = route.elevationGainM;
  }

  return persistRun(
    db,
    userId,
    {
      source: "manual",
      name: input.name,
      startedAt: input.startedAt,
      clientId: crypto.randomUUID(),
      distanceM: input.distanceM, // always from the body — adjusting the real result is the point
      durationS: input.durationS,
      avgPaceSPerKm: input.distanceM > 0 ? input.durationS / (input.distanceM / 1000) : null,
      elevationGainM,
      plannedRouteId: input.plannedRouteId ?? null,
    },
    [],
  );
}
