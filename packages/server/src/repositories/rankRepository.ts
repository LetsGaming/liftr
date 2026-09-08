import { and, desc, eq, gte } from "drizzle-orm";
import { exercises, prs, rankEvents, ranks, sets, standards, workoutExercises, type LiftrDb } from "@liftr/db";

/** Every computed rank for this user, joined with its exercise (for display fields like slug/name). */
export function findAllRanksWithExercise(db: LiftrDb, userId: string) {
  return db.query.ranks.findMany({ where: eq(ranks.userId, userId), with: { exercise: true } });
}

/** Every computed rank for this user, bare — used where only the tier-by-exercise lookup matters (xp.ts). */
export function findAllRanks(db: LiftrDb, userId: string) {
  return db.query.ranks.findMany({ where: eq(ranks.userId, userId) });
}

/** Shared catalog — not user-scoped. */
export function findExerciseById(db: LiftrDb, exerciseId: string) {
  return db.query.exercises.findFirst({ where: eq(exercises.id, exerciseId) });
}

/**
 * `sex` defaults to "male" — the population ANCHOR_STANDARDS was already calibrated against
 * before FEMALE_ANCHOR_STANDARDS existed, so an unset profile keeps today's behavior rather than
 * silently switching anyone's ranks. Every ingested exercise has rows for both sexes (see
 * ingestStandards.ts), so this is a real, sourced choice for "female," not a fallback standing in
 * for missing data. Shared catalog — not user-scoped.
 */
export function findStandardsForExercise(db: LiftrDb, exerciseId: string, sex: "male" | "female" = "male") {
  return db.query.standards.findMany({ where: and(eq(standards.exerciseId, exerciseId), eq(standards.sex, sex)) });
}

/** All non-warmup sets this user has ever logged for this exercise, across every workout. */
export function findLoggedSetsForExercise(db: LiftrDb, userId: string, exerciseId: string) {
  return db
    .select({ weightKg: sets.weightKg, reps: sets.reps, id: sets.id, loggedAt: sets.loggedAt })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(sets.isWarmup, false), eq(sets.userId, userId)));
}

export function findRankByExerciseId(db: LiftrDb, userId: string, exerciseId: string) {
  return db.query.ranks.findFirst({ where: and(eq(ranks.userId, userId), eq(ranks.exerciseId, exerciseId)) });
}

export interface RankUpsert {
  exerciseId: string;
  tier: (typeof ranks.$inferInsert)["tier"];
  division: number;
  lp: number;
  e1rm: number;
  trust: (typeof ranks.$inferInsert)["trust"];
  nextTargetWeightKg: number | null;
  nextTargetReps: number | null;
  /** Ratchet-only "best ever" snapshot — see tiers.ts's `ratchetPeak`.
   *  Nullable: a badly-flagged first-ever recompute (no prior peak to compare against) does not
   *  establish one — see rankService.ts's `peak` computation. */
  peakTier: (typeof ranks.$inferInsert)["peakTier"];
  peakDivision: number | null;
  peakLp: number | null;
  peakE1rm: number | null;
  peakAchievedAt: Date | null;
}

export function upsertRank(db: LiftrDb, userId: string, values: RankUpsert) {
  const row = { ...values, userId, computedAt: new Date() };
  return db
    .insert(ranks)
    .values(row)
    .onConflictDoUpdate({ target: [ranks.userId, ranks.exerciseId], set: row });
}

export function findBestPrByKind(db: LiftrDb, userId: string, exerciseId: string, kind: (typeof prs.$inferInsert)["kind"]) {
  return db.query.prs.findFirst({
    where: and(eq(prs.userId, userId), eq(prs.exerciseId, exerciseId), eq(prs.kind, kind)),
    orderBy: desc(prs.value),
  });
}

export function insertPr(db: LiftrDb, userId: string, values: Omit<typeof prs.$inferInsert, "userId">) {
  return db.insert(prs).values({ ...values, userId });
}

/** History row for a genuine rank-up — mirrors `insertPr` above. */
export function insertRankEvent(db: LiftrDb, userId: string, values: Omit<typeof rankEvents.$inferInsert, "userId">) {
  return db.insert(rankEvents).values({ ...values, userId });
}

/** Raw rank-up timestamps (+ plausibility flag) within the window, for this user — the weekday
 *  reduction happens in the service layer (readinessService.ts's "repository fetches, service
 *  reduces" split). */
export function findRankEventsSince(db: LiftrDb, userId: string, since: Date) {
  return db
    .select({ occurredAt: rankEvents.occurredAt, plausibilityReason: rankEvents.plausibilityReason })
    .from(rankEvents)
    .where(and(eq(rankEvents.userId, userId), gte(rankEvents.occurredAt, since)));
}
