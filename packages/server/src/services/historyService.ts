import { computeSetXp, type Tier } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findFinishedWorkoutsPage, findRanksByExerciseIds, findRecentRunsPage } from "../repositories/historyRepository.js";

/** Unified reverse-chronological feed of finished workouts + runs (plan 1.6 / mockup's .actrow list). */
export interface HistoryItem {
  kind: "workout" | "run";
  id: string;
  at: Date;
  title: string | null;
  meta: Record<string, unknown>;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

/**
 * K-way-merge pagination across two sources (workouts, runs): each source is queried for up to
 * `limit` rows before the cursor, the results are merged and sorted, then trimmed to `limit` —
 * a correct approach because fetching the top `limit` from *each* source guarantees the true
 * top `limit` overall is present before the final slice, not just an approximation.
 */
export async function getHistoryPage(db: LiftrDb, cursor: string | undefined, limit: number): Promise<HistoryPage> {
  const before = cursor ? new Date(cursor) : new Date(8640000000000000); // far future

  const [finishedWorkouts, recentRuns] = await Promise.all([
    findFinishedWorkoutsPage(db, before, limit),
    findRecentRunsPage(db, before, limit),
  ]);

  // XP per workout (plan §6.4) — reuses the same exercise/set data already joined above, keyed
  // by each exercise's *current* rank tier (not a historical snapshot; this is a purely-additive
  // gamification layer, not a strict ledger, so re-tiering an exercise later is fine to apply
  // retroactively rather than needing a migration to track it per-set).
  const usedExerciseIds = [...new Set(finishedWorkouts.flatMap((w) => w.workoutExercises.map((we) => we.exerciseId)))];
  const rankRows = await findRanksByExerciseIds(db, usedExerciseIds);
  const tierByExercise = new Map(rankRows.map((r) => [r.exerciseId, r.tier as Tier]));

  const items: HistoryItem[] = [
    ...finishedWorkouts.map((w): HistoryItem => {
      const exerciseCount = w.workoutExercises.length;
      const allSets = w.workoutExercises.flatMap((we) => we.sets.map((s) => ({ ...s, exerciseId: we.exerciseId })));
      const volumeKg = allSets.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0);
      const xp = allSets
        .filter((s) => !s.isWarmup)
        .reduce((sum, s) => sum + computeSetXp(s.weightKg, s.reps, tierByExercise.get(s.exerciseId) ?? null), 0);
      return {
        kind: "workout",
        id: w.id,
        at: w.startedAt,
        // Was hardcoded null with a comment promising client-side resolution that never
        // happened — every history/dashboard row read "Workout" regardless of which routine
        // was actually done. `routine` can be null (Quick Start has no routineId).
        title: w.routine?.name ?? null,
        meta: {
          exerciseCount,
          volumeKg,
          xp: Math.round(xp),
          durationS: w.endedAt ? (w.endedAt.getTime() - w.startedAt.getTime()) / 1000 - w.pausedSeconds : null,
        },
      };
    }),
    ...recentRuns.map(
      (r): HistoryItem => ({
        kind: "run",
        id: r.id,
        at: r.startedAt,
        title: r.name,
        meta: { distanceM: r.distanceM, durationS: r.durationS, avgPaceSPerKm: r.avgPaceSPerKm },
      }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const page = items.slice(0, limit);
  const nextCursor = page.length === limit ? page[page.length - 1]!.at.toISOString() : null;
  return { items: page, nextCursor };
}
