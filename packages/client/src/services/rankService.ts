import { api } from "../lib/api";

export interface RankRow {
  exerciseId: string;
  slug: string;
  nameKey: string;
  isBodyweight: boolean;
  tier: string;
  division: number;
  lp: number;
  e1rm: number;
  trust: "real" | "derived" | "synthetic";
  nextTargetWeightKg: number | null;
  nextTargetReps: number | null;
}

export function getRanks(): Promise<RankRow[]> {
  return api.get<RankRow[]>("/api/ranks");
}
