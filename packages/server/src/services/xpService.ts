import { computeLevel, computeRunXp, computeTotalXp, type Tier } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findAllRanks } from "../repositories/rankRepository.js";
import { findAllRunsForXp, findAllSetsForXp, findTotalSessionBonusXp } from "../repositories/xpRepository.js";

export interface XpSummary {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

/** Total XP across every logged non-warmup set + every logged run + the resulting level. XP is
 *  global-per-user (there's no separate "strength XP"/"running XP" split anywhere else in the
 *  product), so this is the one place strength and running literally converge into the same
 *  number. */
export async function getXpSummary(db: LiftrDb, userId: string): Promise<XpSummary> {
  const [rows, runRows, rankRows, sessionBonusXp] = await Promise.all([
    findAllSetsForXp(db, userId),
    findAllRunsForXp(db, userId),
    findAllRanks(db, userId),
    findTotalSessionBonusXp(db, userId),
  ]);
  const tierByExercise = new Map(rankRows.map((r) => [r.exerciseId, r.tier as Tier]));

  const perSetXp = computeTotalXp(
    rows
      .filter((s) => !s.isWarmup)
      .map((s) => ({
        exerciseId: s.exerciseId,
        weightKg: s.weightKg,
        reps: s.reps,
        tier: tierByExercise.get(s.exerciseId) ?? null,
        loggedAt: s.loggedAt.getTime(),
        plausibilityMultiplier: s.plausibilityMultiplier ?? 1,
      })),
  );

  // Ruling 5: a manual run's `plausibilityMultiplier` is always `null` in the DB (the gate never
  // runs against one, since there are no `run_points` to check distance against) — that must map
  // to `1` (full credit), NOT `0`, which would zero out every manual run's XP entirely.
  const runXp = computeRunXp(
    runRows.map((r) => ({
      runId: r.id,
      distanceM: r.distanceM,
      durationS: r.durationS,
      loggedAt: r.startedAt,
      plausibilityMultiplier: r.plausibilityMultiplier ?? 1,
    })),
  );

  const totalXp = Math.round(
    perSetXp + runXp + sessionBonusXp.totalConsistencyBonusXp + sessionBonusXp.totalVarietyBonusXp,
  );

  return { totalXp, ...computeLevel(totalXp) };
}
