import { api } from "../lib/api";

/** Mirrors `routes/runRanks.ts`'s response shape — one row per running category with a
 *  computed rank. */
export interface RunRankRow {
  category: string;
  tier: string;
  division: number;
  lp: number;
  bestSpeedMps: number | null;
  trust: "real" | "derived" | "synthetic" | null;
  nextTargetSpeedMps: number | null;
  /** Peak snapshot used to render the "decayed below peak" caption; null only for rows never
   *  recomputed since peak tracking was added. Mirrors rankService.ts's own peakTier/peakDivision
   *  convention. */
  peakTier: string | null;
  peakDivision: number | null;
}

/** Mirrors `routes/runPrs.ts`'s response shape — the running Personal Records ledger. */
export interface RunPrListItem {
  id: string;
  category: string;
  kind: "time" | "speed";
  value: number;
  runId: string;
  achievedAt: string;
}

export interface RunOverallRankBand {
  tier: string;
  division: number;
  lp: number;
}

/** Mirrors `routes/runOverallRank.ts`'s response shape — the account-level "how good a runner
 *  am I overall" aggregate. */
export interface RunOverallRankResponse {
  current: RunOverallRankBand | null;
  peak: RunOverallRankBand | null;
}

export function getRunRanks(): Promise<RunRankRow[]> {
  return api.get<RunRankRow[]>("/api/runs/ranks");
}

export function getRunPrs(): Promise<RunPrListItem[]> {
  return api.get<RunPrListItem[]>("/api/runs/prs");
}

export function getRunOverallRank(): Promise<RunOverallRankResponse> {
  return api.get<RunOverallRankResponse>("/api/runs/overall-rank");
}
