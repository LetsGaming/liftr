import { api } from "../lib/api";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface Profile {
  sex?: "male" | "female";
  birthYear?: number;
  experienceLevel?: ExperienceLevel;
  workoutsPerWeek?: number;
}

export interface ProfileInput extends Profile {
  /** Write-only: also upserts today's bodyweightLogs entry server-side: see server's routes/settings.ts. */
  currentWeightKg?: number;
}

export function getProfile(): Promise<Profile | null> {
  return api.get<Profile | null>("/api/settings/profile");
}

export function saveProfile(input: ProfileInput): Promise<Profile> {
  return api.put<Profile>("/api/settings/profile", input);
}

export async function getOwnedEquipment(): Promise<string[] | null> {
  const { equipment } = await api.get<{ equipment: string[] | null }>("/api/settings/equipment");
  return equipment;
}

export function saveOwnedEquipment(equipment: string[]): Promise<{ equipment: string[] }> {
  return api.put<{ equipment: string[] }>("/api/settings/equipment", { equipment });
}

export interface PlateInventoryEntry {
  weightKg: number;
  count: number;
}

/** One empty-bar weight per bar-family equipment type — a barbell, EZ-bar, trap-bar, and an
 *  adjustable-dumbbell handle are all meaningfully different (feedback: "a barbell usually has a
 *  different weight than a dumbbell"). All optional: SetEntry.vue falls back to
 *  @liftr/shared's DEFAULT_BAR_WEIGHT_KG for whichever type isn't configured. */
export interface BarWeights {
  barbell?: number;
  "ez-bar"?: number;
  "trap-bar"?: number;
  dumbbell?: number;
}

export interface GymSetup {
  barWeights: BarWeights;
  plates: PlateInventoryEntry[];
}

export function getGymSetup(): Promise<GymSetup | null> {
  return api.get<GymSetup | null>("/api/settings/gym");
}

export function saveGymSetup(input: GymSetup): Promise<GymSetup> {
  return api.put<GymSetup>("/api/settings/gym", input);
}
