/**
 * `pnpm ingest --catalog` also generates a short "how do I log this" cue per exercise
 * (plan Phase 3.2 — the mockup's "Wie protokollieren?" text). Templated from movementPattern +
 * primary muscle, not hand-written per exercise: audit §2.8 explicitly budgets translation
 * effort at ~zero, and 89 individually hand-written German cues would blow well past that.
 * Honest tradeoff, documented rather than hidden — see the DIFFERENCE from free-exercise-db's
 * `instructions` field (a *possible* richer source, English-only, not used here since
 * translating 89 multi-step instructions is exactly the effort audit §2.8 says to skip).
 */
import type { CatalogEntry } from "./catalogSchema.js";

const MUSCLE_DE: Record<string, string> = {
  biceps: "den Bizeps",
  "front-delts": "die vordere Schulter",
  serratus: "den seitlichen Rumpf",
  chest: "die Brust",
  triceps: "den Trizeps",
  abs: "die Bauchmuskulatur",
  calves: "die Waden",
  glutes: "das Gesäß",
  traps: "den oberen Rücken",
  quads: "den vorderen Oberschenkel",
  hamstrings: "die hintere Oberschenkelmuskulatur",
  lats: "den seitlichen Rücken",
  brachialis: "den Oberarm",
  obliques: "die seitliche Bauchmuskulatur",
  soleus: "die untere Wade",
};

const PATTERN_TEMPLATE: Record<string, (muscle: string) => string> = {
  squat: (m) => `Rücken gerade halten, Knie in Fußrichtung, kontrolliert absenken — spürbar in ${m}.`,
  hinge: (m) => `Bewegung aus der Hüfte, Rücken neutral halten, ${m} bewusst anspannen.`,
  "push-horizontal": (m) => `Ellenbogen ca. 45° zum Körper, kontrolliert ablassen, ohne Schwung drücken — ${m} arbeitet.`,
  "push-vertical": (m) => `Rumpf anspannen, Gewicht gerade nach oben führen, ${m} trägt die Bewegung.`,
  "pull-horizontal": (m) => `Schulterblätter zusammenziehen, Ellenbogen nah am Körper — ${m} zieht.`,
  "pull-vertical": (m) => `Schulterblätter aktiv nach unten ziehen, kontrolliert ablassen — ${m} übernimmt.`,
  carry: (m) => `Rumpf stabil halten, aufrechte Haltung, gleichmäßige Schritte — ${m} stabilisiert.`,
};

function isolationTemplate(muscle: string): string {
  return `Bewegung langsam und kontrolliert ausführen, ${muscle} bewusst anspannen — kein Schwung.`;
}

export function howToTextFor(entry: CatalogEntry): string {
  const primarySlug = entry.primaryMuscles[0];
  const muscle = primarySlug ? (MUSCLE_DE[primarySlug] ?? "die Zielmuskulatur") : "die Zielmuskulatur";
  const template = PATTERN_TEMPLATE[entry.movementPattern];
  if (template) return template(muscle);
  return isolationTemplate(muscle);
}
