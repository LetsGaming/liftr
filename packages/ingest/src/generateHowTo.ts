/**
 * `pnpm ingest --catalog` also generates a short "how do I log this" cue per exercise (the
 * mockup's "Wie protokollieren?" text). Templated from movementPattern + primary muscle, not
 * hand-written per exercise: translation budget is effectively zero, and 89 individually
 * hand-written cues per locale would blow well past that. Honest tradeoff, documented rather than
 * hidden — see the DIFFERENCE from free-exercise-db's `instructions` field (a *possible* richer
 * source, English-only, not used here since translating 89 multi-step instructions is exactly
 * the effort this approach is meant to skip).
 */
import type { CatalogEntry } from "./catalogSchema.js";

export type HowToLocale = "de" | "en";

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

const MUSCLE_EN: Record<string, string> = {
  biceps: "your biceps",
  "front-delts": "your front delts",
  serratus: "your side ribs",
  chest: "your chest",
  triceps: "your triceps",
  abs: "your abs",
  calves: "your calves",
  glutes: "your glutes",
  traps: "your upper back",
  quads: "the front of your thighs",
  hamstrings: "the back of your thighs",
  lats: "your lats",
  brachialis: "your upper arm",
  obliques: "your side abs",
  soleus: "your lower calf",
};

const PATTERN_TEMPLATE_DE: Record<string, (muscle: string) => string> = {
  squat: (m) => `Rücken gerade halten, Knie in Fußrichtung, kontrolliert absenken — spürbar in ${m}.`,
  hinge: (m) => `Bewegung aus der Hüfte, Rücken neutral halten, ${m} bewusst anspannen.`,
  "push-horizontal": (m) => `Ellenbogen ca. 45° zum Körper, kontrolliert ablassen, ohne Schwung drücken — ${m} arbeitet.`,
  "push-vertical": (m) => `Rumpf anspannen, Gewicht gerade nach oben führen, ${m} trägt die Bewegung.`,
  "pull-horizontal": (m) => `Schulterblätter zusammenziehen, Ellenbogen nah am Körper — ${m} zieht.`,
  "pull-vertical": (m) => `Schulterblätter aktiv nach unten ziehen, kontrolliert ablassen — ${m} übernimmt.`,
  carry: (m) => `Rumpf stabil halten, aufrechte Haltung, gleichmäßige Schritte — ${m} stabilisiert.`,
};

const PATTERN_TEMPLATE_EN: Record<string, (muscle: string) => string> = {
  squat: (m) => `Keep your back straight, knees tracking over toes, lower under control — you'll feel it in ${m}.`,
  hinge: (m) => `Move from the hips, keep your back neutral, brace ${m} on the way up.`,
  "push-horizontal": (m) => `Elbows at roughly 45° to your body, lower under control, press with no bounce — ${m} does the work.`,
  "push-vertical": (m) => `Brace your core, drive the weight straight up — ${m} carries the movement.`,
  "pull-horizontal": (m) => `Squeeze your shoulder blades together, elbows close to your body — ${m} does the pulling.`,
  "pull-vertical": (m) => `Actively pull your shoulder blades down, lower under control — ${m} takes over.`,
  carry: (m) => `Keep your core braced, stand tall, take even steps — ${m} keeps you stable.`,
};

function isolationTemplateDe(muscle: string): string {
  return `Bewegung langsam und kontrolliert ausführen, ${muscle} bewusst anspannen — kein Schwung.`;
}

function isolationTemplateEn(muscle: string): string {
  return `Move slowly and under control, keep ${muscle} braced the whole time — no swinging.`;
}

const LOCALES: Record<HowToLocale, {
  muscles: Record<string, string>;
  fallbackMuscle: string;
  patterns: Record<string, (muscle: string) => string>;
  isolation: (muscle: string) => string;
}> = {
  de: { muscles: MUSCLE_DE, fallbackMuscle: "die Zielmuskulatur", patterns: PATTERN_TEMPLATE_DE, isolation: isolationTemplateDe },
  en: { muscles: MUSCLE_EN, fallbackMuscle: "the target muscle", patterns: PATTERN_TEMPLATE_EN, isolation: isolationTemplateEn },
};

export function howToTextFor(entry: CatalogEntry, locale: HowToLocale = "de"): string {
  const { muscles, fallbackMuscle, patterns, isolation } = LOCALES[locale];
  const primarySlug = entry.primaryMuscles[0];
  const muscle = primarySlug ? (muscles[primarySlug] ?? fallbackMuscle) : fallbackMuscle;
  const template = patterns[entry.movementPattern];
  if (template) return template(muscle);
  return isolation(muscle);
}
