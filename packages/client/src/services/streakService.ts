import { api } from "../lib/api";

export interface StreakStatus {
  streak: number;
  tokensRemaining: number;
}

export function getStreak(): Promise<StreakStatus> {
  return api.get<StreakStatus>("/api/streak");
}
