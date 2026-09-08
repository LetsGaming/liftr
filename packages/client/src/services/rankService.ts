import { api } from "../lib/api";

export interface RankRow {
  exerciseId: string;
  slug: string;
  name: string | null;
  isBodyweight: boolean;
  tier: string;
  division: number;
  lp: number;
  e1rm: number;
  trust: "real" | "derived" | "synthetic";
  nextTargetWeightKg: number | null;
  nextTargetReps: number | null;
  /** Peak snapshot used to render the "decayed below peak" caption; null only for rows never
   *  recomputed since peak tracking was added. */
  peakTier: string | null;
  peakDivision: number | null;
}

export function getRanks(): Promise<RankRow[]> {
  return api.get<RankRow[]>("/api/ranks");
}
