import { api } from "../lib/api";

export interface OverallRankBand {
  tier: string;
  division: number;
  lp: number;
}

export interface OverallRankResponse {
  current: OverallRankBand | null;
  peak: OverallRankBand | null;
}

export function getOverallRank(): Promise<OverallRankResponse> {
  return api.get<OverallRankResponse>("/api/overall-rank");
}
