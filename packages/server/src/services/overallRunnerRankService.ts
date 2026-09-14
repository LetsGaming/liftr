/**
 * Overall Runner Rank — the running analog of `overallRankService.ts`'s Overall Lifter Rank: a
 * single account-level "how good a runner am I overall" aggregate, computed the same way
 * (trust-weighted average of ordinal position across every category with a computed rank) but
 * over `runRanks` (one row per running category) instead of `ranks` (one row per exercise). Kept
 * as its own sibling file rather than folded into overallRankService.ts, mirroring how
 * `runRankRepository.ts`/`rankRepository.ts` are already separate sibling files for
 * running/strength — same "on-demand from a small per-user table, no second cache" reasoning as
 * `getOverallRank`.
 */
import type { LiftrDb } from "@liftr/db";
import { computeOverallPeak, computeOverallRank } from "@liftr/shared";
import { findAllRunRanks } from "../repositories/runRankRepository.js";
import type { OverallRankResult } from "./overallRankService.js";

export async function getOverallRunnerRank(db: LiftrDb, userId: string): Promise<OverallRankResult> {
  const rows = await findAllRunRanks(db, userId);

  // `runRanks.trust` is nullable at the schema level (unlike `ranks.trust`) — in practice
  // `recomputeRunRank` always sets it, but a row somehow missing it is excluded rather than
  // crashing or being coerced to a fake trust tier, same "exclude, don't zero/fake" philosophy as
  // the peak-row filtering below.
  const currentRows = rows.filter((r) => r.trust != null);
  const current = computeOverallRank(
    currentRows.map((r) => ({ tier: r.tier, division: r.division, lp: r.lp, trust: r.trust! })),
  );

  // Peak aggregate only includes rows that actually have a peak snapshot (a row recomputed since
  // peak tracking was added always does; excludes nothing else) — same convention as
  // `getOverallRank`'s own peak filtering.
  const peakRows = rows.filter(
    (r) => r.peakTier != null && r.peakDivision != null && r.peakLp != null && r.trust != null,
  );
  const peak = computeOverallPeak(
    peakRows.map((r) => ({ tier: r.peakTier!, division: r.peakDivision!, lp: r.peakLp!, trust: r.trust! })),
  );

  return { current, peak };
}
