import { api } from "../lib/api";

/** Mirrors `routes/runRanks.ts`'s response shape — one row per rank bucket (a running category,
 *  or "all" for a single-speed activity's one bucket) with a computed rank. */
export interface RunRankRow {
  activityType: string;
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

/** Mirrors `routes/runPrs.ts`'s response shape — the cardio Personal Records ledger, across every
 *  activity type at once. */
export interface RunPrListItem {
  id: string;
  activityType: string;
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
 *  am I overall" aggregate. Running only (see cardioActivities.ts's
 *  countsTowardOverallRunnerRank) — no activityType param. */
export interface RunOverallRankResponse {
  current: RunOverallRankBand | null;
  peak: RunOverallRankBand | null;
}

/** `activityType` is required (not defaulted) — same "no silent single-ladder default" rule the
 *  server repository layer follows, so a caller can't forget to ask for walk/hike ranks. */
export function getRunRanks(activityType: string): Promise<RunRankRow[]> {
  return api.get<RunRankRow[]>(`/api/runs/ranks?activityType=${activityType}`);
}

export function getRunPrs(): Promise<RunPrListItem[]> {
  return api.get<RunPrListItem[]>("/api/runs/prs");
}

export function getRunOverallRank(): Promise<RunOverallRankResponse> {
  return api.get<RunOverallRankResponse>("/api/runs/overall-rank");
}
