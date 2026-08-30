import { computeLevel, computeTotalXp, type Tier } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findAllRanks } from "../repositories/rankRepository.js";
import { findAllSetsForXp } from "../repositories/xpRepository.js";

export interface XpSummary {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

/** Total XP across every logged non-warmup set + the resulting level (plan §6.4). */
export async function getXpSummary(db: LiftrDb): Promise<XpSummary> {
  const [rows, rankRows] = await Promise.all([findAllSetsForXp(db), findAllRanks(db)]);
  const tierByExercise = new Map(rankRows.map((r) => [r.exerciseId, r.tier as Tier]));

  const totalXp = Math.round(
    computeTotalXp(
      rows
        .filter((s) => !s.isWarmup)
        .map((s) => ({
          exerciseId: s.exerciseId,
          weightKg: s.weightKg,
          reps: s.reps,
          tier: tierByExercise.get(s.exerciseId) ?? null,
          loggedAt: s.loggedAt.getTime(),
        })),
    ),
  );

  return { totalXp, ...computeLevel(totalXp) };
}
