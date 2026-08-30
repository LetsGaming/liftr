/**
 * Equipment → icon glyphs (feedback: "no per-exercise icons; find if there's a public source").
 * There is no open icon set with 94 distinct exercise icons — that dataset doesn't exist — but
 * the catalog already carries an `equipment` field end-to-end (curated.yaml -> schema.ts ->
 * exercises.ts -> catalogStore.ts) with exactly 10 values, and it was rendered nowhere. This
 * maps those 10 values to icons instead of 94 exercises to icons.
 *
 * The `Equipment` type/vocabulary itself now lives in @liftr/shared (equipment/equipment.ts) —
 * it's also what packages/ingest's free-exercise-db/wger adapters normalize external equipment
 * strings into, so the client's icon/label maps and the ingest pipeline's source-of-truth
 * mapping can never drift into two different "what counts as equipment" lists.
 *
 * Six of these are Tabler Icons (github.com/tabler/tabler-icons, MIT, no attribution required),
 * copied verbatim as outline paths — same 24x24/stroke-width:2/round-cap contract as App.vue's
 * hand-authored nav icons, so they render identically via the same <svg> wrapper. Tabler has no
 * kettlebell, cable-machine, ab-wheel, or gymnastic-rings glyph; those four are hand-drawn here
 * in the same visual language rather than left as a gap or reusing a misleading icon.
 */
import { EQUIPMENT_SLUGS, SUPPORT_EQUIPMENT_SLUGS, type Equipment, type EquipmentRequirement, type SupportEquipment } from "@liftr/shared";

export { EQUIPMENT_SLUGS, SUPPORT_EQUIPMENT_SLUGS };
export type { Equipment, EquipmentRequirement, SupportEquipment };

export const EQUIPMENT_ICON_PATH: Record<Equipment, string> = {
  // Tabler "barbell"
  barbell:
    '<path d="M2 12h1" /><path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2" /><path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" /><path d="M9 12h6" /><path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" /><path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2" /><path d="M22 12h-1" />',
  // ez-bar / trap-bar are barbell variants with no real external-standards distinction in the
  // catalog either (curated.yaml anchors them to the barbell lifts) — reuse, don't invent.
  "ez-bar":
    '<path d="M2 12h1" /><path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2" /><path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" /><path d="M9 12h6" /><path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" /><path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2" /><path d="M22 12h-1" />',
  "trap-bar":
    '<path d="M2 12h1" /><path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2" /><path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" /><path d="M9 12h6" /><path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" /><path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2" /><path d="M22 12h-1" />',
  // Tabler "dumbbell"
  dumbbell:
    '<path d="M7.026 9.61l-.95 -4.18a2 2 0 0 1 1.95 -2.43h8a2 2 0 0 1 2 2.43l-1 4.2" /><path d="M9.026 17.001h6" /><path d="M18.906 20.06a7.92 7.92 0 0 0 1 -5.33a8 8 0 1 0 -14.77 5.33a2 2 0 0 0 1.71 .94h10.36a2 2 0 0 0 1.7 -.94" />',
  // Tabler "stretching"
  bodyweight: '<path d="M15 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M5 20l5 -.5l1 -2" /><path d="M18 20v-5h-5.5l2.5 -6.5l-5.5 1l1.5 2" />',
  // Tabler "weight"
  machine:
    '<path d="M9 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M6.835 9h10.33a1 1 0 0 1 .984 .821l1.637 9a1 1 0 0 1 -.984 1.179h-13.604a1 1 0 0 1 -.984 -1.179l1.637 -9a1 1 0 0 1 .984 -.821" />',
  // Hand-drawn: pulley wheel + cable + T-bar handle.
  cable: '<circle cx="12" cy="5" r="2.2" /><path d="M12 7.2v7.3" /><path d="M8 16.5h8" /><path d="M8 16.5v3M16 16.5v3" />',
  // Hand-drawn: two rings hanging by straps from a bar.
  rings: '<path d="M4 3h16" /><path d="M8 3v4M16 3v4" /><circle cx="8" cy="10" r="3" /><circle cx="16" cy="10" r="3" />',
  // Hand-drawn: handle arc + ball body.
  kettlebell: '<path d="M8 6a4 4 0 0 1 8 0" /><path d="M8 6v3M16 6v3" /><circle cx="12" cy="15" r="6" />',
  // Hand-drawn: wheel + axle + hub.
  "ab-wheel": '<circle cx="12" cy="14" r="6" /><path d="M4 14h2M18 14h2" /><circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />',
};

/** Supporting props (equipment/requirements.ts) — hand-drawn in the same visual language as the
 *  primary-equipment icons above, for ExerciseInfoPanel's "Benötigtes Equipment" list and the
 *  gym-setup step of onboarding/Profil. */
export const SUPPORT_EQUIPMENT_ICON_PATH: Record<SupportEquipment, string> = {
  // Hand-drawn: stack of plates, front-on.
  plates:
    '<rect x="4" y="6" width="16" height="3" rx="1" /><rect x="5" y="11" width="14" height="3" rx="1" /><rect x="6" y="16" width="12" height="3" rx="1" />',
  // Hand-drawn: flat bench, side profile.
  bench: '<path d="M3 15h18" /><path d="M3 15v4M21 15v4" /><rect x="4" y="11" width="16" height="4" rx="1" />',
  // Hand-drawn: bench tilted up at the head end.
  "incline-bench": '<path d="M3 17h18" /><path d="M3 17v3M21 17v3" /><path d="M4 17l1 -6l15 -3v5z" />',
  // Hand-drawn: squat rack, two uprights + j-hooks.
  rack: '<path d="M5 3v18M19 3v18" /><path d="M5 8h3M16 8h3" /><path d="M2 12h4M18 12h4" />',
  // Tabler "pull-up bar"-style: wall-mounted horizontal bar.
  "pullup-bar": '<path d="M4 6h16" /><path d="M4 6v3M20 6v3" /><path d="M9 9v3M15 9v3" />',
  // Hand-drawn: parallel dip bars, top-down.
  "dip-bars": '<path d="M6 4v16M18 4v16" /><path d="M4 8h4M16 8h4" />',
  // Tabler "yoga mat"-style: rolled mat outline.
  mat: '<rect x="3" y="9" width="18" height="6" rx="2" /><path d="M3 12h18" />',
  // Hand-drawn: plyo box, front-on.
  box: '<rect x="5" y="7" width="14" height="12" rx="1" /><path d="M5 13h14" />',
};

export function equipmentIconSvg(equipment: string): string {
  return EQUIPMENT_ICON_PATH[equipment as Equipment] ?? SUPPORT_EQUIPMENT_ICON_PATH[equipment as SupportEquipment] ?? EQUIPMENT_ICON_PATH.machine;
}

/** German display names (feature: "allow the user to set equipment they own") — same
 *  fixed-noun-map convention as MUSCLE_LABEL_DE (lib/muscles.ts) rather than the full i18n
 *  machinery, since this app is German-only. */
export const EQUIPMENT_LABEL_DE: Record<Equipment, string> = {
  bodyweight: "Körpergewicht",
  dumbbell: "Kurzhanteln",
  barbell: "Langhantel",
  "ez-bar": "SZ-Stange",
  "trap-bar": "Trap-Bar",
  machine: "Maschine",
  cable: "Kabelzug",
  kettlebell: "Kettlebell",
  rings: "Ringe",
  "ab-wheel": "Ab-Wheel",
};

/** Support-equipment labels — same convention as EQUIPMENT_LABEL_DE above. */
export const SUPPORT_EQUIPMENT_LABEL_DE: Record<SupportEquipment, string> = {
  plates: "Gewichtsscheiben",
  bench: "Flachbank",
  "incline-bench": "Schrägbank",
  rack: "Squat-Rack",
  "pullup-bar": "Klimmzugstange",
  "dip-bars": "Dip-Barren",
  mat: "Matte",
  box: "Plyo-Box",
};

/** Every requirement's label, primary and support vocabularies combined — the one lookup
 *  ExerciseInfoPanel/onboarding's equipment list actually needs. */
export function equipmentRequirementLabelDe(requirement: EquipmentRequirement): string {
  return (
    (EQUIPMENT_LABEL_DE as Record<string, string>)[requirement] ??
    (SUPPORT_EQUIPMENT_LABEL_DE as Record<string, string>)[requirement] ??
    requirement
  );
}
