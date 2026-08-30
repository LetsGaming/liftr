import { api } from "../lib/api";

export interface BodyweightEntry {
  id: string;
  date: string;
  weightKg: number;
}

export function getBodyweightLogs(): Promise<BodyweightEntry[]> {
  return api.get<BodyweightEntry[]>("/api/bodyweight");
}

export function logBodyweight(date: string, weightKg: number): Promise<BodyweightEntry> {
  return api.post("/api/bodyweight", { date, weightKg });
}
