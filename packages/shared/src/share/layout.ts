/**
 * Pure layout math for shareable workout/run cards (plan Phase 4.5). No canvas, no DOM —
 * unit-testable in CI, and reusable if a server-side renderer is ever added later without
 * rewriting the layout logic. The actual drawing (canvas + SVG data URIs) lives in the client
 * package; this module only decides *where things go* and *how text wraps/compresses*.
 */

export type CardSize = "square" | "story" | "wide";

export interface CardDimensions {
  width: number;
  height: number;
}

/** Base card pixel size per breakpoint, at 1x. The client scales the canvas backing store 2x. */
export const CARD_DIMENSIONS: Record<CardSize, CardDimensions> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  wide: { width: 1200, height: 630 },
};

export interface SetChip {
  weightKg: number | null; // null for rep-only (bodyweight) sets
  reps: number;
  isWarmup: boolean;
}

export interface ExerciseCardEntry {
  name: string;
  sets: SetChip[];
}

export interface WorkoutCardModel {
  kind: "workout";
  routineName: string;
  dateLabel: string;
  durationLabel: string;
  volumeKg: number;
  setCount: number;
  prCount: number;
  exercises: ExerciseCardEntry[];
  /** Feedback: "share image should also show the trained muscle groups" — same primary/
   *  secondary muscle slugs MuscleFigure.vue renders everywhere else in the app, drawn onto the
   *  card as the same anatomical silhouette (see client/src/lib/shareCard.ts) rather than a
   *  second, differently-styled representation. */
  muscles: { primary: string[]; secondary: string[] };
}

export interface RunCardModel {
  kind: "run";
  dateLabel: string;
  distanceLabel: string;
  durationLabel: string;
  paceLabel: string;
  avgHr: number | null;
}

export type CardModel = WorkoutCardModel | RunCardModel;

/**
 * Exercise line, compressed once a workout has more entries than fit comfortably.
 * Long workouts (>10 exercises) collapse each exercise to one summary line
 * ("Kurzhantelrudern · 3 × 9-12 kg") instead of listing every individual set.
 */
export const COMPRESS_EXERCISE_THRESHOLD = 10;

export interface RenderedExerciseLine {
  name: string;
  detail: string;
}

export function renderExerciseLines(exercises: ExerciseCardEntry[]): RenderedExerciseLine[] {
  const compress = exercises.length > COMPRESS_EXERCISE_THRESHOLD;
  return exercises.map((ex) => {
    const working = ex.sets.filter((s) => !s.isWarmup);
    if (!compress) {
      const detail = ex.sets
        .map((s) => {
          const w = s.isWarmup ? "W " : "";
          // reps×weight, not weight×reps (feedback: share card showed "7,5×8" for 7.5kg × 8
          // reps — reps first is how every other set display in the app already reads it,
          // e.g. WorkoutPage.vue's set rows show "7,5 kg · 8 Wdh.").
          return s.weightKg != null ? `${w}${s.reps}×${formatKg(s.weightKg)}kg` : `${w}${s.reps}`;
        })
        .join("  ");
      return { name: ex.name, detail };
    }
    const weights = working.map((s) => s.weightKg).filter((w): w is number => w != null);
    const detail =
      weights.length > 0
        ? `${working.length} × ${formatKg(Math.min(...weights))}-${formatKg(Math.max(...weights))} kg`
        : `${working.length} Sätze`;
    return { name: ex.name, detail };
  });
}

function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/** Word-wrap a string to a max character width per line (canvas measures text separately;
 *  this is a fast pre-pass so the drawing code knows line counts before it starts drawing). */
export function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
