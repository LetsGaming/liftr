import { and, asc, desc, eq, exists, ne } from "drizzle-orm";
import { runPoints, runPrs, runRankEvents, runRanks, runs, runStandards, type LiftrDb } from "@liftr/db";
import { nearestRunCategory, type RankBucket, type RankedActivityType } from "@liftr/shared";

/** Shared catalog — not user-scoped, mirrors findStandardsForExercise's shape. `activityType` is
 *  a required parameter (not defaulted) at this layer — a default here is exactly how a walk
 *  would silently join a running query. `bucket` is a `RunCategory` for running's distance-ladder
 *  or the literal "all" for a single-speed activity (walk/hike). */
export function findRunStandardsForBucket(db: LiftrDb, bucket: RankBucket, activityType: RankedActivityType) {
  return db.query.runStandards.findMany({
    where: and(eq(runStandards.category, bucket), eq(runStandards.activityType, activityType)),
  });
}

export interface FindLoggedRunsOptions {
  /** `source !== "manual"` AND at least one `run_points` row — a manual run has no GPS trace to
   *  rank against, and a non-manual run with zero points would mean the ingest pipeline never
   *  finished writing its trace (see runRepository.ts's insertRunPoints). */
  rankEligibleOnly?: boolean;
}

/**
 * Fetches this user's run history for one activity type in ONE query, then filters to the given
 * bucket in application code — there is no `category` column on `runs` to filter on in SQL (a
 * run's category is derived at read time from its distance, see `@liftr/shared`'s riegel.ts).
 * The `activityType` filter itself IS applied in SQL — that's the boundary that keeps a walk from
 * ever being visible to a running-bucket query, or vice versa.
 *
 * `bucket: "all"` (single-speed activities — walk/hike) matches every run of that activity type
 * regardless of distance, since there is only one bucket; a `RunCategory` bucket (running) filters
 * to runs whose distance falls nearest that category, same as before.
 */
export async function findLoggedRunsForBucket(
  db: LiftrDb,
  userId: string,
  bucket: RankBucket,
  activityType: RankedActivityType,
  options: FindLoggedRunsOptions = {},
) {
  const { rankEligibleOnly = false } = options;

  const where = rankEligibleOnly
    ? and(
        eq(runs.userId, userId),
        eq(runs.activityType, activityType),
        ne(runs.source, "manual"),
        exists(db.select({ runId: runPoints.runId }).from(runPoints).where(eq(runPoints.runId, runs.id))),
      )
    : and(eq(runs.userId, userId), eq(runs.activityType, activityType));

  const rows = await db.query.runs.findMany({ where });
  if (bucket === "all") return rows;
  return rows.filter((run) => nearestRunCategory(run.distanceM) === bucket);
}

export function findRunRankByBucket(db: LiftrDb, userId: string, bucket: RankBucket, activityType: RankedActivityType) {
  return db.query.runRanks.findFirst({
    where: and(eq(runRanks.userId, userId), eq(runRanks.activityType, activityType), eq(runRanks.category, bucket)),
  });
}

export interface RunRankUpsert {
  tier: (typeof runRanks.$inferInsert)["tier"];
  division: number;
  lp: number;
  bestSpeedMps: number | null;
  trust: (typeof runRanks.$inferInsert)["trust"];
  nextTargetSpeedMps: number | null;
  /** Ratchet-only "best ever" snapshot — see rankRepository.ts's `RankUpsert.peakTier` for the
   *  same nullable-on-first-recompute convention. */
  peakTier: (typeof runRanks.$inferInsert)["peakTier"];
  peakDivision: number | null;
  peakLp: number | null;
  peakSpeedMps: number | null;
  peakAchievedAt: Date | null;
}

export function upsertRunRank(
  db: LiftrDb,
  userId: string,
  bucket: RankBucket,
  activityType: RankedActivityType,
  values: RunRankUpsert,
) {
  const row = { ...values, userId, activityType, category: bucket, computedAt: new Date() };
  return db
    .insert(runRanks)
    .values(row)
    .onConflictDoUpdate({ target: [runRanks.userId, runRanks.activityType, runRanks.category], set: row });
}

/** "Best" is kind-direction-aware: for `kind: "speed"` (m/s) higher is better, but for
 *  `kind: "time"` (seconds) LOWER is better — a plain `desc(value)` would return the slowest
 *  historically-recorded time instead of the fastest once more than one "time" row exists for a
 *  bucket. Ordering by the direction that actually means "best" for each kind keeps this a
 *  correct, single-source-of-truth "best PR row" lookup for every current and future caller,
 *  rather than pushing kind-direction awareness onto each call site. */
export function findBestRunPrByKind(
  db: LiftrDb,
  userId: string,
  bucket: RankBucket,
  activityType: RankedActivityType,
  kind: (typeof runPrs.$inferInsert)["kind"],
) {
  return db.query.runPrs.findFirst({
    where: and(
      eq(runPrs.userId, userId),
      eq(runPrs.activityType, activityType),
      eq(runPrs.category, bucket),
      eq(runPrs.kind, kind),
    ),
    orderBy: kind === "time" ? asc(runPrs.value) : desc(runPrs.value),
  });
}

export function insertRunPr(db: LiftrDb, userId: string, values: Omit<typeof runPrs.$inferInsert, "userId">) {
  return db.insert(runPrs).values({ ...values, userId });
}

/** Every run PR row for this user — for GET /api/runs/prs. `activityType` is optional: omitted
 *  returns PRs across every ladder (the route decides whether to filter), passed narrows to one
 *  ladder. Mirrors prRepository's listing shape, but no exercise join is needed: `category` is
 *  enough context on its own, and `runId` alone (no exercise/set join chain) is the "jump to this
 *  run" link. */
export function findAllRunPrs(db: LiftrDb, userId: string, activityType?: RankedActivityType) {
  const where = activityType
    ? and(eq(runPrs.userId, userId), eq(runPrs.activityType, activityType))
    : eq(runPrs.userId, userId);
  return db.query.runPrs.findMany({ where, orderBy: desc(runPrs.achievedAt) });
}

/** History row for a genuine run rank-up — mirrors rankRepository.ts's `insertRankEvent`. */
export function insertRunRankEvent(db: LiftrDb, userId: string, values: Omit<typeof runRankEvents.$inferInsert, "userId">) {
  return db.insert(runRankEvents).values({ ...values, userId });
}

/** Every computed rank for this user within one activity type's ladder — for Overall Runner Rank
 *  (only "run" counts toward it, see `activityCountsTowardOverallRunnerRank` in
 *  cardioActivities.ts) or for rendering a single-speed activity's one rank card. Required
 *  parameter for the same reason as everywhere else in this file: a default would let one
 *  ladder's aggregate silently include another's rows. */
export function findAllRunRanks(db: LiftrDb, userId: string, activityType: RankedActivityType) {
  return db.query.runRanks.findMany({
    where: and(eq(runRanks.userId, userId), eq(runRanks.activityType, activityType)),
  });
}
