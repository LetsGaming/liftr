import {
  cardioActivity,
  classifyHealthConnectWorkoutType,
  computeRunPlausibility,
  runRankValue,
  summarizeRun,
  type ActivityType,
  type RankBucket,
  type RankedActivityType,
  type RunPoint,
} from "@liftr/shared";
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
  const rankMode = cardioActivity(run.activityType).rank.mode;
  if (rankMode !== "none" && run.source !== "manual" && points.length > 0) {
    // Narrowed by rankMode !== "none" above — today only "other" has that mode, so
    // run.activityType here is genuinely RankedActivityType, not just cast for convenience.
    const activityType = run.activityType as RankedActivityType;
    const plausibility = computeRunPlausibility({
      distanceM: run.distanceM,
      durationS: run.durationS,
      points,
      activityType,
    });
    inserted = await updateRunPlausibilityMultiplier(db, inserted.id, plausibility.multiplier);
    // Distance-ladder (running) picks its bucket from distance; single-speed (walk/hike) has
    // exactly one bucket, "all" — see cardioActivities.ts's RankMode.
    const bucket: RankBucket = rankMode === "distance-ladder" ? runRankValue(run.distanceM, run.durationS).category : "all";
    rankResult = await recomputeRunRank(
      db,
      userId,
      bucket,
      activityType,
      plausibility.multiplier,
      plausibility.reason,
    );
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
      activityType: "run",
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

export interface HealthConnectImportInput {
  platformId: string;
  name: string | null;
  /** Health Connect's own raw exercise-type string, classified via
   *  `classifyHealthConnectWorkoutType` below. */
  rawWorkoutType: string;
  /** Required when `points` is empty — there's no first point to derive it from. */
  startedAt: Date | null;
  /** The watch's own aggregate distance/duration (READ_DISTANCE), used only when `points` is
   *  empty — a workout Health Connect withheld the route for (consent gate, or none recorded)
   *  still gets XP + streak credit from these, just never a rank (persistRun's rank gate
   *  requires points, matching the existing "manual runs never earn rank" rule — no GPS trace
   *  means no independent check against a claimed distance). */
  distanceM: number | null;
  durationS: number | null;
  points: HealthConnectPoint[];
}

/** POST /api/runs/healthconnect — native in-app import via capacitor-health. */
export async function importHealthConnectRun(db: LiftrDb, userId: string, input: HealthConnectImportInput) {
  const clientId = `healthconnect:${input.platformId}`;
  const existing = await findRunByClientId(db, userId, clientId);
  if (existing) return existing; // already imported this workout — idempotent, not an error

  const activityType: ActivityType = classifyHealthConnectWorkoutType(input.rawWorkoutType);
  const rawPoints = input.points.map((p) => ({
    t: p.t.getTime(),
    lat: p.lat,
    lon: p.lon,
    ele: p.ele ?? undefined,
    hr: p.hr ?? undefined,
  }));

  if (rawPoints.length > 0) {
    const summary = summarizeRun(rawPoints);
    const startedAt = new Date(rawPoints[0]!.t);
    return persistRun(
      db,
      userId,
      {
        source: "healthconnect",
        activityType,
        name: input.name,
        startedAt,
        clientId,
        distanceM: summary.distanceM,
        durationS: summary.durationS,
        avgPaceSPerKm: summary.avgPaceSPerKm,
        avgHr: summary.avgHr,
        elevationGainM: summary.elevationGainM,
      },
      rawPoints.map((p, idx) => ({ ...p, idx })),
    );
  }

  // Route-less fallback: no GPS trace, so no independent plausibility check and no rank (the
  // `points.length > 0` gate in persistRun already handles that) — XP + streak credit only, from
  // the watch's own reported distance/duration.
  if (input.distanceM == null || input.durationS == null || input.startedAt == null) {
    throw new RunParseError(
      "Health Connect hat für dieses Workout weder eine Strecke noch eine Distanz geliefert.",
    );
  }
  return persistRun(
    db,
    userId,
    {
      source: "healthconnect",
      activityType,
      name: input.name,
      startedAt: input.startedAt,
      clientId,
      distanceM: input.distanceM,
      durationS: input.durationS,
      avgPaceSPerKm: input.durationS / (input.distanceM / 1000),
      avgHr: null,
      elevationGainM: null,
    },
    [],
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
    activityType: ActivityType;
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
      activityType: input.activityType,
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
