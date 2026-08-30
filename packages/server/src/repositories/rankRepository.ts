import { and, desc, eq, gte } from "drizzle-orm";
import { exercises, prs, rankEvents, ranks, sets, standards, workoutExercises, type LiftrDb } from "@liftr/db";

/** Every computed rank, joined with its exercise (for display fields like slug/nameKey). */
export function findAllRanksWithExercise(db: LiftrDb) {
  return db.query.ranks.findMany({ with: { exercise: true } });
}

/** Every computed rank, bare — used where only the tier-by-exercise lookup matters (xp.ts). */
export function findAllRanks(db: LiftrDb) {
  return db.query.ranks.findMany();
}

export function findExerciseById(db: LiftrDb, exerciseId: string) {
  return db.query.exercises.findFirst({ where: eq(exercises.id, exerciseId) });
}

/**
 * QUAL-04: `sex` defaults to "male" — the population ANCHOR_STANDARDS was already calibrated
 * against before FEMALE_ANCHOR_STANDARDS existed, so an unset profile keeps today's behavior
 * rather than silently switching anyone's ranks. Every ingested exercise has rows for both
 * sexes (see ingestStandards.ts), so this is a real, sourced choice for "female," not a
 * fallback standing in for missing data.
 */
export function findStandardsForExercise(db: LiftrDb, exerciseId: string, sex: "male" | "female" = "male") {
  return db.query.standards.findMany({ where: and(eq(standards.exerciseId, exerciseId), eq(standards.sex, sex)) });
}

/** All non-warmup sets ever logged for this exercise, across every workout. */
export function findLoggedSetsForExercise(db: LiftrDb, exerciseId: string) {
  return db
    .select({ weightKg: sets.weightKg, reps: sets.reps, id: sets.id, loggedAt: sets.loggedAt })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(sets.isWarmup, false)));
}

export function findRankByExerciseId(db: LiftrDb, exerciseId: string) {
  return db.query.ranks.findFirst({ where: eq(ranks.exerciseId, exerciseId) });
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
}

export function upsertRank(db: LiftrDb, values: RankUpsert) {
  const row = { ...values, computedAt: new Date() };
  return db
    .insert(ranks)
    .values(row)
    .onConflictDoUpdate({ target: ranks.exerciseId, set: row });
}

export function findBestPrByKind(db: LiftrDb, exerciseId: string, kind: (typeof prs.$inferInsert)["kind"]) {
  return db.query.prs.findFirst({
    where: and(eq(prs.exerciseId, exerciseId), eq(prs.kind, kind)),
    orderBy: desc(prs.value),
  });
}

export function insertPr(db: LiftrDb, values: typeof prs.$inferInsert) {
  return db.insert(prs).values(values);
}

/** History row for a genuine rank-up (engagement rework W8) — mirrors `insertPr` above. */
export function insertRankEvent(db: LiftrDb, values: typeof rankEvents.$inferInsert) {
  return db.insert(rankEvents).values(values);
}

/** Raw rank-up timestamps within the window — the weekday reduction happens in the service
 *  layer (readinessService.ts's "repository fetches, service reduces" split). */
export function findRankEventsSince(db: LiftrDb, since: Date) {
  return db.select({ occurredAt: rankEvents.occurredAt }).from(rankEvents).where(gte(rankEvents.occurredAt, since));
}
