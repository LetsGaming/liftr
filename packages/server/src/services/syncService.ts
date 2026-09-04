import {
  bestLoadRatio,
  computeConsistencyBonus,
  computeStreak,
  computeVarietyBonus,
  computeWorkoutPlausibility,
  MAX_PLAUSIBLE_REPS,
  MAX_PLAUSIBLE_WEIGHT_KG,
  type PlausibilityInput,
} from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findSetByClientId, insertSet } from "../repositories/setRepository.js";
import { findExerciseById, findRankByExerciseId, findStandardsForExercise } from "../repositories/rankRepository.js";
import { creditStreak, findAllStreakDates } from "../repositories/streakRepository.js";
import { readJsonSetting } from "../repositories/settingsRepository.js";
import type { Profile } from "../routes/settings.js";
import {
  findPreviousFinishedWorkout,
  findPrimaryMuscleSlugsForWorkout,
  findTouchedExerciseIds,
  findWorkoutById,
  findWorkoutWithExercisesAndSets,
  insertWorkout,
  insertWorkoutExercise,
  insertWorkoutExercises,
  findWorkoutExerciseById,
  patchWorkout,
} from "../repositories/workoutRepository.js";
import { getCurrentBodyweightKg, getUserSex, recomputeRankForExercise } from "./rankService.js";

/**
 * The heart of offline (plan 1.1/1.3). The client queues mutations locally while offline, each
 * stamped with a `clientId` generated on-device, and flushes them here in a batch once
 * connectivity returns. Every mutation type below is upserted keyed on `clientId`, so replaying
 * the same batch twice (e.g. a retry after a flaky connection) is always a no-op the second time
 * — never a duplicate set, workout, or run.
 */

export interface StartWorkoutItem {
  clientId: string;
  type: "start_workout";
  payload: {
    id: string;
    routineId?: string | null;
    startedAt: Date;
    exercises: { id: string; exerciseId: string; orderIndex: number }[];
  };
}

export interface LogSetItem {
  clientId: string;
  type: "log_set";
  payload: {
    workoutExerciseId: string;
    setIndex: number;
    weightKg: number | null;
    reps: number;
    rpe?: number | null;
    kind: "normal" | "warmup" | "failure" | "dropset";
    notes?: string | null;
    loggedAt: Date;
  };
}

export interface FinishWorkoutItem {
  clientId: string;
  type: "finish_workout";
  payload: { workoutId: string; endedAt: Date; pausedSeconds: number; notes?: string | null };
}

export interface AddExerciseItem {
  clientId: string;
  type: "add_exercise";
  payload: { id: string; workoutId: string; exerciseId: string; orderIndex: number };
}

export type SyncItem = StartWorkoutItem | LogSetItem | FinishWorkoutItem | AddExerciseItem;

export interface RankVerdict {
  exerciseId: string;
  rankedUp: boolean;
  newPr: { kind: string; value: number } | null;
  tier: string;
  division: number;
  lp: number;
  prevLp: number;
  /** Rank engine v2 — set when this workout's plausibility gate discounted the recompute that
   *  produced this verdict, null when the workout was fully plausible. */
  plausibilityReason: "pace" | "improbable_jump" | "exceeds_ceiling" | null;
}

export interface SyncResult {
  clientId: string;
  status: "created" | "already_synced" | "error";
  serverId?: string;
  error?: string;
  /** Set only on finish_workout results — rank recompute moved from per-set to per-workout
   *  (engagement rework): a session with many sets on the same exercise previously paid a
   *  recompute after every one of them, and rank-ups fired mid-set instead of reading as one
   *  end-of-workout moment. One verdict per exercise that had at least one non-warmup set
   *  logged in this workout. */
  ranks?: RankVerdict[];
  /** Set only on finish_workout results — the streak/XP mechanics redesign
   *  (docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md, §2/§3): the two session-level
   *  XP bonuses frozen onto this workout's row, plus which muscles actually earned the variety bonus
   *  so the client's Finish Sequence can name them (e.g. "Schultern zum ersten Mal seit letztem
   *  Training") instead of showing a bare count. */
  consistencyBonusXp?: number;
  varietyBonusXp?: number;
  /** Primary-role muscle slugs trained this session that were NOT trained in the immediately-
   *  preceding finished session (or, for a user's first-ever finished session, all of this
   *  session's own primary muscles). Length always matches the muscle count that fed
   *  `computeVarietyBonus` before the per-session cap — the cap only bounds the XP magnitude, not
   *  this list, so the client can still name every newly-trained muscle even past the cap. */
  newMuscleSlugs?: string[];
}

async function applyStartWorkout(db: LiftrDb, item: StartWorkoutItem): Promise<SyncResult> {
  const existing = await findWorkoutById(db, item.payload.id);
  if (existing) return { clientId: item.clientId, status: "already_synced", serverId: existing.id };

  await insertWorkout(db, {
    id: item.payload.id,
    clientId: item.clientId,
    routineId: item.payload.routineId ?? null,
    startedAt: item.payload.startedAt,
    pausedSeconds: 0,
  });
  await insertWorkoutExercises(
    db,
    item.payload.exercises.map((ex) => ({ ...ex, workoutId: item.payload.id })),
  );
  return { clientId: item.clientId, status: "created", serverId: item.payload.id };
}

/**
 * Plausibility ceiling (feedback: "pretty easy to swindle the system to gain XP and ranks") —
 * rank/XP are computed straight from weightKg/reps with no upper bound otherwise. MAX_PLAUSIBLE_*
 * live in @liftr/shared so the client can clamp its steppers to the same ceiling (a normal UI
 * flow should never actually hit this branch); this check is defense-in-depth against a request
 * that didn't go through the client — direct API use or tampered local data. Checked here rather
 * than in the request schema: the batch's schema validates the *whole* array atomically, so a
 * schema-level `.max()` would fail every item in the batch (including an unrelated
 * finish_workout) over one bad set.
 */
async function applyLogSet(db: LiftrDb, item: LogSetItem): Promise<SyncResult> {
  const existing = await findSetByClientId(db, item.clientId);
  if (existing) return { clientId: item.clientId, status: "already_synced", serverId: existing.id };

  // guard: the referenced workout_exercise must exist, or this is a stale/bad queue entry
  const parent = await findWorkoutExerciseById(db, item.payload.workoutExerciseId);
  if (!parent) return { clientId: item.clientId, status: "error", error: "unknown_workout_exercise" };

  if ((item.payload.weightKg ?? 0) > MAX_PLAUSIBLE_WEIGHT_KG || item.payload.reps > MAX_PLAUSIBLE_REPS) {
    return { clientId: item.clientId, status: "error", error: "implausible_set" };
  }

  const row = await insertSet(db, {
    ...item.payload,
    isWarmup: item.payload.kind === "warmup",
    clientId: item.clientId,
  });
  // No rank recompute here — it runs once per touched exercise when the workout finishes
  // (applyFinishWorkout below), not after every set.
  return { clientId: item.clientId, status: "created", serverId: row.id };
}

async function applyFinishWorkout(db: LiftrDb, item: FinishWorkoutItem): Promise<SyncResult> {
  const existing = await findWorkoutById(db, item.payload.workoutId);
  if (existing?.endedAt) return { clientId: item.clientId, status: "already_synced", serverId: existing.id };

  await patchWorkout(db, item.payload.workoutId, {
    endedAt: item.payload.endedAt,
    pausedSeconds: item.payload.pausedSeconds,
    notes: item.payload.notes ?? null,
  });

  // Streak credit (plan §2.4) — the day the workout finished counts, which is what matters for
  // "did you train today", not when the sync happened to reach the server.
  const dateStr = item.payload.endedAt.toISOString().slice(0, 10);
  await creditStreak(db, dateStr, "workout");

  // Consistency bonus (streak/XP mechanics redesign, spec §2) — `creditStreak` above already
  // recorded today's date, so `computeStreak` here already reflects this session: do NOT add +1
  // or credit again. Uses `item.payload.endedAt` (not `new Date()`, unlike the live GET /api/streak
  // route) as "now" so a delayed/replayed sync flush computes the same streak the user actually
  // earned on the day they finished, not whatever day the batch happens to reach the server.
  const [streakDates, profile] = await Promise.all([findAllStreakDates(db), readJsonSetting<Profile>(db, "profile")]);
  const streakDays = computeStreak(streakDates, item.payload.endedAt, profile?.workoutsPerWeek).streak;
  const consistencyBonusXp = computeConsistencyBonus(streakDays);

  // Variety bonus (spec §3) — a plain factual diff between this session's own primary-muscle set
  // and the single immediately-preceding *finished* session's, never a recovery/readiness model.
  // `findPrimaryMuscleSlugsForWorkout` naturally returns [] for a workout with zero logged sets
  // (no sets to join against), so the zero-sets edge case falls out of this without a special case:
  // newMuscleSlugs ends up [] and varietyBonusXp ends up 0.
  const thisSessionMuscles = await findPrimaryMuscleSlugsForWorkout(db, item.payload.workoutId);
  const thisSessionSlugs = thisSessionMuscles.map((m) => m.muscleSlug);
  const previousWorkout = await findPreviousFinishedWorkout(db, item.payload.workoutId);
  let newMuscleSlugs: string[];
  if (!previousWorkout) {
    // First-ever finished session: nothing to compare against, so every muscle trained today
    // counts as "new" — intentional per the spec (a brand-new user gets the full variety bonus
    // on day one).
    newMuscleSlugs = thisSessionSlugs;
  } else {
    const previousMuscles = await findPrimaryMuscleSlugsForWorkout(db, previousWorkout.id);
    const previousSlugSet = new Set(previousMuscles.map((m) => m.muscleSlug));
    newMuscleSlugs = thisSessionSlugs.filter((slug) => !previousSlugSet.has(slug));
  }
  const varietyBonusXp = computeVarietyBonus(newMuscleSlugs.length);

  const touched = await findTouchedExerciseIds(db, item.payload.workoutId);

  // Plausibility gate (rank engine v2): computed once per finished workout, before the
  // per-exercise recompute loop, from the full set of sets just logged in this session. The
  // jump/ceiling checks need a load-ratio value in the same units as `apexThreshold`/
  // `storedPeakRatio` (both load-ratio = e1RM/bodyweight) — using raw weight-kg directly (ignoring
  // reps entirely, and ignoring bodyweight+leverage for bodyweight exercises) would compare the
  // wrong units. `sessionBestRatio` is computed via `bestLoadRatio` (shared/math/e1rm.ts), which
  // mirrors rankService.ts's own per-set e1RM/bodyweight-leverage loop, so the two never drift.
  // Note that `ranks.peakE1rm` is stored as a raw e1RM value (see rankService.ts's `bestE1rm`),
  // not a ratio, so it must also be divided by bodyweight here before comparison.
  const workoutWithSets = await findWorkoutWithExercisesAndSets(db, item.payload.workoutId);

  let plausibility: { multiplier: number; reason: "pace" | "improbable_jump" | "exceeds_ceiling" | null } = {
    multiplier: 1,
    reason: null,
  };
  if (workoutWithSets) {
    const allSets = workoutWithSets.workoutExercises.flatMap((we) => we.sets);
    const effectiveDurationSeconds =
      (item.payload.endedAt.getTime() - workoutWithSets.startedAt.getTime()) / 1000 - item.payload.pausedSeconds;
    const bodyweightKg = await getCurrentBodyweightKg(db);
    const sex = await getUserSex(db);

    const exerciseInputs: PlausibilityInput["exercises"] = [];
    for (const { exerciseId } of touched) {
      const rank = await findRankByExerciseId(db, exerciseId);
      const exerciseSets = workoutWithSets.workoutExercises
        .filter((we) => we.exerciseId === exerciseId)
        .flatMap((we) => we.sets)
        .filter((s) => !s.isWarmup);
      const standards = await findStandardsForExercise(db, exerciseId, sex);
      const apexThreshold = standards.find((s) => s.tier === "apex")?.threshold ?? null;
      // `metric === "reps"` exercises store a rep count in `peakE1rm`, not an e1RM — there is no
      // load-ratio concept for them, so they can't share the load-ratio math (`bestLoadRatio`)
      // with `metric === "load_ratio"` exercises, and a prior version of this function passed
      // null for all three fields here for that reason. But the jump/ceiling heuristics in
      // plausibility.ts are unit-agnostic ratio comparisons — they only ever compare a session
      // value against the *same exercise's own* stored peak / apex threshold, so a rep count
      // compared against a rep-count peak and a rep-count apex threshold is just as valid an
      // input as a load ratio compared against a load-ratio peak/threshold (engagement-audit-v3
      // Phase 3: closes the gap where a rep-based exercise, e.g. pull-ups/push-ups, had zero
      // jump/ceiling protection — a single suspiciously large rep count would sail through
      // undetected as long as the rest of the session's pace looked normal). The pace check is
      // metric-agnostic either way and always runs regardless.
      const metric = standards[0]?.metric;
      let sessionBestRatio: number | null = null;
      if (metric === "load_ratio") {
        const exercise = await findExerciseById(db, exerciseId);
        sessionBestRatio = bestLoadRatio(
          exerciseSets,
          bodyweightKg,
          exercise ? { isBodyweight: exercise.isBodyweight, leverageFactor: exercise.bodyweightLeverage ?? 1 } : null,
        );
      } else if (metric === "reps") {
        sessionBestRatio = exerciseSets.length > 0 ? Math.max(...exerciseSets.map((s) => s.reps)) : null;
      }
      const storedPeakRatio =
        metric === "load_ratio"
          ? rank?.peakE1rm != null
            ? rank.peakE1rm / bodyweightKg
            : null
          : metric === "reps"
            ? (rank?.peakE1rm ?? null) // rep count, not divided by bodyweight — see comment above
            : null;
      exerciseInputs.push({
        exerciseId,
        sessionBestRatio,
        storedPeakRatio,
        apexThreshold: metric === "load_ratio" || metric === "reps" ? apexThreshold : null,
      });
    }

    plausibility = computeWorkoutPlausibility({
      totalSetCount: allSets.filter((s) => !s.isWarmup).length,
      effectiveDurationSeconds,
      exercises: exerciseInputs,
    });
  }

  // Single write for every value this handler computes at finish-time (plausibility multiplier +
  // the two session-level XP bonuses) — matches the existing `plausibilityMultiplier` precedent of
  // freezing a value once at finish-time rather than re-deriving it on every read (spec's "Data
  // model" section). `plausibilityMultiplier` is only set when `workoutWithSets` was found (the
  // pre-existing guard); the two bonuses are always set, including the zero-sets edge case.
  await patchWorkout(db, item.payload.workoutId, {
    ...(workoutWithSets ? { plausibilityMultiplier: plausibility.multiplier } : {}),
    consistencyBonusXp,
    varietyBonusXp,
  });

  // Rank/PR recompute now runs once per finished workout, not once per set: every exercise that
  // had a non-warmup set logged in this session gets recomputed exactly once here, and the
  // verdicts come back together so the client can build a single end-of-workout reward beat
  // instead of one popping mid-set.
  const ranks: RankVerdict[] = [];
  for (const { exerciseId } of touched) {
    const result = await recomputeRankForExercise(db, exerciseId, plausibility.multiplier, plausibility.reason);
    if (result) ranks.push({ exerciseId, ...result, plausibilityReason: plausibility.reason });
  }

  return {
    clientId: item.clientId,
    status: "created",
    serverId: item.payload.workoutId,
    ranks,
    consistencyBonusXp,
    varietyBonusXp,
    newMuscleSlugs,
  };
}

async function applyAddExercise(db: LiftrDb, item: AddExerciseItem): Promise<SyncResult> {
  const existing = await findWorkoutExerciseById(db, item.payload.id);
  if (existing) return { clientId: item.clientId, status: "already_synced", serverId: existing.id };

  const row = await insertWorkoutExercise(db, {
    id: item.payload.id,
    workoutId: item.payload.workoutId,
    exerciseId: item.payload.exerciseId,
    orderIndex: item.payload.orderIndex,
  });
  return { clientId: item.clientId, status: "created", serverId: row.id };
}

/** Applies one queued mutation and returns its result — never throws for an *expected* failure
 *  (those are `status: "error"` results, retried by the client next flush); an unexpected
 *  exception here is caught by the route and turned into an `"error"` result for that one item
 *  only, so one bad item in a batch doesn't fail its siblings. */
export async function applySyncItem(db: LiftrDb, item: SyncItem): Promise<SyncResult> {
  switch (item.type) {
    case "start_workout":
      return applyStartWorkout(db, item);
    case "log_set":
      return applyLogSet(db, item);
    case "finish_workout":
      return applyFinishWorkout(db, item);
    case "add_exercise":
      return applyAddExercise(db, item);
  }
}

export async function applySyncBatch(db: LiftrDb, items: SyncItem[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const item of items) {
    try {
      results.push(await applySyncItem(db, item));
    } catch (err) {
      results.push({ clientId: item.clientId, status: "error", error: (err as Error).message });
    }
  }
  return results;
}

