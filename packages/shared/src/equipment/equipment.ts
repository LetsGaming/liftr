/**
 * Canonical equipment vocabulary (plan 0.4 follow-up: "map equipment to exercises without
 * manually adjusting the code every time"). Single source of truth for what "equipment" means
 * in this app — the client's icon/label maps (equipmentIcons.ts) and the ingest pipeline's
 * external-source normalizers (packages/ingest/src/equipment/) both key off this list instead
 * of each inventing/duplicating it. Deliberately a closed, curated set (not "whatever the
 * upstream API happens to call things") — every exercise's equipment must render a real icon and
 * be filterable by the equipment picker, so an unrecognized upstream value normalizes to `null`
 * (see normalizeFreeExerciseDbEquipment/normalizeWgerEquipment below) rather than being
 * invented as an eleventh category no icon/label exists for.
 */
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "bodyweight"
  | "machine"
  | "cable"
  | "ez-bar"
  | "trap-bar"
  | "rings"
  | "kettlebell"
  | "ab-wheel";

export const EQUIPMENT_SLUGS: Equipment[] = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "ez-bar",
  "trap-bar",
  "machine",
  "cable",
  "kettlebell",
  "rings",
  "ab-wheel",
];

/**
 * free-exercise-db (github.com/yuhonas/free-exercise-db, Unlicense) uses its own 12-value
 * `equipment` string per exercise — verified against its `dist/exercises.json` (873 rows) as of
 * this mapping's authoring. Four of its values (bands, medicine ball, exercise ball, foam roll)
 * and the catch-all "other" have no equivalent in this app's vocabulary and intentionally map to
 * null rather than being force-fit onto the nearest-sounding category.
 */
const FREE_EXERCISE_DB_EQUIPMENT_MAP: Record<string, Equipment | null> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  "body only": "bodyweight",
  cable: "cable",
  machine: "machine",
  kettlebells: "kettlebell",
  "e-z curl bar": "ez-bar",
  bands: null,
  "medicine ball": null,
  "exercise ball": null,
  "foam roll": null,
  other: null,
};

export function normalizeFreeExerciseDbEquipment(raw: string | null | undefined): Equipment | null {
  if (!raw) return null;
  return FREE_EXERCISE_DB_EQUIPMENT_MAP[raw.trim().toLowerCase()] ?? null;
}

/**
 * wger (wger.de/api/v2, CC-BY-SA 4.0) tags an exercise with zero or more equipment items (a
 * bench press might carry both "Barbell" and "Bench") rather than this app's single equipment
 * field — resolved by priority, most training-defining piece of kit first (a barbell matters
 * more to "what do I need" than the bench it's performed on). "Bench"/"Incline bench"/"Gym
 * mat"/"Swiss Ball" are supporting props, not the thing the app's equipment filter means by
 * "equipment" (per free-exercise-db's own tighter list above), so they never win a match; a
 * lift tagged only with one of those falls through to null rather than guessing.
 */
const WGER_EQUIPMENT_PRIORITY: { name: string; equipment: Equipment }[] = [
  { name: "none (bodyweight exercise)", equipment: "bodyweight" },
  { name: "barbell", equipment: "barbell" },
  { name: "sz-bar", equipment: "ez-bar" },
  { name: "dumbbell", equipment: "dumbbell" },
  { name: "kettlebell", equipment: "kettlebell" },
  { name: "cable machine", equipment: "cable" },
];

export function normalizeWgerEquipment(equipmentNames: string[]): Equipment | null {
  const lower = new Set(equipmentNames.map((n) => n.trim().toLowerCase()));
  for (const { name, equipment } of WGER_EQUIPMENT_PRIORITY) {
    if (lower.has(name)) return equipment;
  }
  return null;
}
