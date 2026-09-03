import { api } from "../lib/api";

export interface PrListItem {
  id: string;
  exerciseId: string;
  exerciseSlug: string;
  kind: "e1rm" | "weight" | "reps" | "volume";
  value: number;
  achievedAt: string;
  workoutId: string | null;
}

export function getPrs(): Promise<PrListItem[]> {
  return api.get<PrListItem[]>("/api/prs");
}
