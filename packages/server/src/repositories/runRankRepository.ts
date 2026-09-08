import { and, asc, desc, eq, exists, ne } from "drizzle-orm";
import { runPoints, runPrs, runRankEvents, runRanks, runs, runStandards, type LiftrDb } from "@liftr/db";
import { nearestRunCategory, type RunCategory } from "@liftr/shared";

/** Shared catalog — not user-scoped, mirrors findStandardsForExercise's shape. */
export function findRunStandardsForCategory(db: LiftrDb, category: RunCategory) {
  return db.query.runStandards.findMany({ where: eq(runStandards.category, category) });
}

export interface FindLoggedRunsOptions {
  /** `source !== "manual"` AND at least one `run_points` row — a manual run has no GPS trace to
   *  rank against, and a non-manual run with zero points would mean the ingest pipeline never
   *  finished writing its trace (see runRepository.ts's insertRunPoints). */
  rankEligibleOnly?: boolean;
}

/**
 * Fetches this user's full run history in ONE query, then filters to the given category in
 * application code via `nearestRunCategory` — there is no `category` column on `runs` to filter
 * on in SQL (a run's category is derived at read time from its distance, see
 * `@liftr/shared`'s riegel.ts). This keeps a single DB round-trip reusable across all 5
 * categories instead of issuing 5 near-identical queries.
 */
export async function findLoggedRunsForCategory(
  db: LiftrDb,
  userId: string,
  category: RunCategory,
  options: FindLoggedRunsOptions = {},
) {
  const { rankEligibleOnly = false } = options;

  const where = rankEligibleOnly
    ? and(
        eq(runs.userId, userId),
        ne(runs.source, "manual"),
        exists(db.select({ runId: runPoints.runId }).from(runPoints).where(eq(runPoints.runId, runs.id))),
      )
    : eq(runs.userId, userId);

  const rows = await db.query.runs.findMany({ where });
  return rows.filter((run) => nearestRunCategory(run.distanceM) === category);
}

export function findRunRankByCategory(db: LiftrDb, userId: string, category: RunCategory) {
  return db.query.runRanks.findFirst({ where: and(eq(runRanks.userId, userId), eq(runRanks.category, category)) });
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

export function upsertRunRank(db: LiftrDb, userId: string, category: RunCategory, values: RunRankUpsert) {
  const row = { ...values, userId, category, computedAt: new Date() };
  return db
    .insert(runRanks)
    .values(row)
    .onConflictDoUpdate({ target: [runRanks.userId, runRanks.category], set: row });
}

/** "Best" is kind-direction-aware: for `kind: "speed"` (m/s) higher is better, but for
 *  `kind: "time"` (seconds) LOWER is better — a plain `desc(value)` would return the slowest
 *  historically-recorded time instead of the fastest once more than one "time" row exists for a
 *  category. Ordering by the direction that actually means "best" for each kind keeps this a
 *  correct, single-source-of-truth "best PR row" lookup for every current and future caller,
 *  rather than pushing kind-direction awareness onto each call site. */
export function findBestRunPrByKind(db: LiftrDb, userId: string, category: RunCategory, kind: (typeof runPrs.$inferInsert)["kind"]) {
  return db.query.runPrs.findFirst({
    where: and(eq(runPrs.userId, userId), eq(runPrs.category, category), eq(runPrs.kind, kind)),
    orderBy: kind === "time" ? asc(runPrs.value) : desc(runPrs.value),
  });
}

export function insertRunPr(db: LiftrDb, userId: string, values: Omit<typeof runPrs.$inferInsert, "userId">) {
  return db.insert(runPrs).values({ ...values, userId });
}

/** Every run PR row for this user, across every category and kind — for GET /api/runs/prs.
 *  Mirrors prRepository's listing shape, but no exercise join is needed: `category` is enough
 *  context on its own, and `runId` alone (no exercise/set join chain) is the "jump to this run"
 *  link. */
export function findAllRunPrs(db: LiftrDb, userId: string) {
  return db.query.runPrs.findMany({ where: eq(runPrs.userId, userId), orderBy: desc(runPrs.achievedAt) });
}

/** History row for a genuine run rank-up — mirrors rankRepository.ts's `insertRankEvent`. */
export function insertRunRankEvent(db: LiftrDb, userId: string, values: Omit<typeof runRankEvents.$inferInsert, "userId">) {
  return db.insert(runRankEvents).values({ ...values, userId });
}

/** Every computed run rank for this user, across all categories — for Overall Runner Rank
 *  aggregation. */
export function findAllRunRanks(db: LiftrDb, userId: string) {
  return db.query.runRanks.findMany({ where: eq(runRanks.userId, userId) });
}
