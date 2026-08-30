/**
 * free-exercise-db (github.com/yuhonas/free-exercise-db, Unlicense/public domain) — the same
 * dataset ingestImages.ts already mirrors photos from, keyed by the same `freeExerciseDbId`
 * curated.yaml already hand-verifies for images. One static JSON file, no auth, no pagination.
 */
import { normalizeFreeExerciseDbEquipment, type Equipment } from "@liftr/shared";
import type { EquipmentSourceAdapter } from "./types.js";

const EXERCISES_JSON_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

interface FreeExerciseDbRow {
  id: string;
  equipment: string | null;
}

export const freeExerciseDbEquipmentSource: EquipmentSourceAdapter = {
  name: "free-exercise-db",

  async buildIndex(): Promise<Map<string, Equipment | null>> {
    const res = await fetch(EXERCISES_JSON_URL);
    if (!res.ok) throw new Error(`free-exercise-db fetch failed: ${res.status} ${res.statusText}`);
    const rows = (await res.json()) as FreeExerciseDbRow[];

    const index = new Map<string, Equipment | null>();
    for (const row of rows) {
      index.set(row.id, normalizeFreeExerciseDbEquipment(row.equipment));
    }
    return index;
  },
};
