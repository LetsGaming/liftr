import { MAX_PLAUSIBLE_REPS, MAX_PLAUSIBLE_WEIGHT_KG } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findSetByClientId, insertSet } from "../repositories/setRepository.js";
import { creditStreak } from "../repositories/streakRepository.js";
import {
  findTouchedExerciseIds,
  findWorkoutById,
  insertWorkout,
  insertWorkoutExercise,
  insertWorkoutExercises,
  findWorkoutExerciseById,
  patchWorkout,
} from "../repositories/workoutRepository.js";
import { recomputeRankForExercise } from "./rankService.js";

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
  payload: { workoutId: string; endedAt: Date; pausedSeconds: number };
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

  await patchWorkout(db, item.payload.workoutId, { endedAt: item.payload.endedAt, pausedSeconds: item.payload.pausedSeconds });

  // Streak credit (plan §2.4) — the day the workout finished counts, which is what matters for
  // "did you train today", not when the sync happened to reach the server.
  const dateStr = item.payload.endedAt.toISOString().slice(0, 10);
  await creditStreak(db, dateStr, "workout");

  // Rank/PR recompute now runs once per finished workout, not once per set: every exercise that
  // had a non-warmup set logged in this session gets recomputed exactly once here, and the
  // verdicts come back together so the client can build a single end-of-workout reward beat
  // instead of one popping mid-set.
  const touched = await findTouchedExerciseIds(db, item.payload.workoutId);
  const ranks: RankVerdict[] = [];
  for (const { exerciseId } of touched) {
    const result = await recomputeRankForExercise(db, exerciseId);
    if (result) ranks.push({ exerciseId, ...result });
  }

  return { clientId: item.clientId, status: "created", serverId: item.payload.workoutId, ranks };
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

