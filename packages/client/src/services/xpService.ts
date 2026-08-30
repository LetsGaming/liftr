import { api } from "../lib/api";

export interface XpResponse {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

export function getXp(): Promise<XpResponse> {
  return api.get<XpResponse>("/api/xp");
}
