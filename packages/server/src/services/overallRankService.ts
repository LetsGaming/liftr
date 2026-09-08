/**
 * Overall Lifter Rank — thin orchestration around @liftr/shared's
 * computeOverallRank/computeOverallPeak. Computed on-demand from the already-small, single-user
 * `ranks` table rather than persisted into its own derived-cache table: the input is cheap to
 * aggregate fresh on every request, and this avoids a second cache needing its own invalidation
 * logic.
 */
import type { LiftrDb } from "@liftr/db";
import { computeOverallPeak, computeOverallRank, type OverallRank } from "@liftr/shared";
import { findAllRanks } from "../repositories/rankRepository.js";

export interface OverallRankResult {
  current: OverallRank | null;
  peak: OverallRank | null;
}

export async function getOverallRank(db: LiftrDb, userId: string): Promise<OverallRankResult> {
  const rows = await findAllRanks(db, userId);

  const current = computeOverallRank(rows.map((r) => ({ tier: r.tier, division: r.division, lp: r.lp, trust: r.trust })));

  // Peak aggregate only includes rows that actually have a peak snapshot (a row recomputed since
  // peak tracking was added always does; excludes nothing else — same "exclude, don't zero"
  // philosophy as current).
  const peakRows = rows.filter(
    (r) => r.peakTier != null && r.peakDivision != null && r.peakLp != null,
  );
  const peak = computeOverallPeak(
    peakRows.map((r) => ({ tier: r.peakTier!, division: r.peakDivision!, lp: r.peakLp!, trust: r.trust })),
  );

  return { current, peak };
}
