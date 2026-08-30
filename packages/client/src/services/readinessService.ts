import { api } from "../lib/api";

export interface MuscleLastTrained {
  slug: string;
  lastTrainedAt: string | null;
  wasPrimary: boolean;
}

export function getReadiness(): Promise<MuscleLastTrained[]> {
  return api.get<MuscleLastTrained[]>("/api/readiness");
}
