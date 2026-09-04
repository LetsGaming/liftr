import { computeLevel, computeTotalXp, type Tier } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findAllRanks } from "../repositories/rankRepository.js";
import { findAllSetsForXp, findTotalSessionBonusXp } from "../repositories/xpRepository.js";

export interface XpSummary {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

/** Total XP across every logged non-warmup set + the resulting level (plan §6.4). */
export async function getXpSummary(db: LiftrDb): Promise<XpSummary> {
  const [rows, rankRows, sessionBonusXp] = await Promise.all([
    findAllSetsForXp(db),
    findAllRanks(db),
    findTotalSessionBonusXp(db),
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

  const totalXp = Math.round(
    perSetXp + sessionBonusXp.totalConsistencyBonusXp + sessionBonusXp.totalVarietyBonusXp,
  );

  return { totalXp, ...computeLevel(totalXp) };
}
