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

/** Phase 5 (share-card redesign): the overall rank badge to draw on the card, plus the level it
 *  was earned at — same shape `overallRankStore`/`xpStore` already carry client-side, kept
 *  string-typed here (not `Tier`) so @liftr/shared's share layer doesn't need a hard dependency
 *  on the rank engine's tier union just to describe what a caller hands it. */
export interface WorkoutCardTier {
  tier: string;
  division: number;
  level: number;
}

/** The session's single highest rank-up, if any — mirrors `FinishSequence.vue`'s own
 *  "topRankUp" reduction (already computed client-side in WorkoutPage.vue), not a full list:
 *  the card shows one earned headline, not a repeat of the in-app rank-up beat. */
export interface WorkoutCardTopRankUp {
  exerciseName: string;
  tier: string;
  division: number;
  isPr: boolean;
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
  /** null when the caller has no rank context yet (e.g. offline, never loaded) — the card simply
   *  omits the badge rather than drawing a placeholder. */
  tier: WorkoutCardTier | null;
  topRankUp: WorkoutCardTopRankUp | null;
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
          // Bodyweight sets (weightKg null) get an explicit "Wdh." suffix (critique finding,
          // clarify): the bare number ("4  4  7") is legible only with the surrounding app's
          // context, which a shared image doesn't have — an outside viewer had no way to read
          // it as reps at all.
          return s.weightKg != null ? `${w}${s.reps}×${formatKg(s.weightKg)}kg` : `${w}${s.reps} Wdh.`;
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

/** How many 2-column exercise-grid rows a given number of rendered lines needs (Phase 5:
 *  exercise list redrawn as a 2-column grid of bordered rows instead of a single-column list). */
export function exerciseGridRowCount(lineCount: number): number {
  return Math.ceil(lineCount / 2);
}

/**
 * Picks which fixed card size actually fits the content instead of always defaulting to
 * "square" and either leaving dead space (a short routine) or silently overflowing (a long one)
 * — `CardSize` already had a "story" (9:16) variant defined and unused before Phase 5 (confirmed
 * bug: `CARD_DIMENSIONS.square` fixed at 1080x1080 regardless of content). `square` and `story`
 * share the same width (1080), so only height needs to be picked; the caller supplies the real
 * pixel height its own draw-time fonts/spacing produce (font sizes live in the client's
 * canvas-drawing code, not duplicated here — this function is pure size arithmetic only).
 * `overflowsStory: true` tells the caller even "story" isn't tall enough, so it should fall back
 * to compressing/capping rows within story rather than growing a third format.
 */
export function chooseCardSize(
  naturalContentHeight: number,
  verticalPadding: number,
): { size: CardSize; overflowsStory: boolean } {
  const squareAvailable = CARD_DIMENSIONS.square.height - verticalPadding * 2;
  const storyAvailable = CARD_DIMENSIONS.story.height - verticalPadding * 2;
  if (naturalContentHeight <= squareAvailable) return { size: "square", overflowsStory: false };
  if (naturalContentHeight <= storyAvailable) return { size: "story", overflowsStory: false };
  return { size: "story", overflowsStory: true };
}

/**
 * A short routine leaves the fixed-size card with dead space at the bottom (Phase 5, confirmed
 * bug — Liftoff's own reference run card has the identical flaw, not something worth copying).
 * Rather than leaving a blank gap after the last drawn row, the unused space is spread evenly
 * across the gaps between the card's major sections so the layout reads as intentionally roomy,
 * not unfinished. Capped per-slot (`maxPerSlot`) so a near-empty card doesn't stretch into an
 * absurd gap — any leftover past the cap just becomes a slightly larger bottom margin.
 */
export function distributeFillGap(
  naturalContentHeight: number,
  availableHeight: number,
  slots: number,
  maxPerSlot = 56,
): number {
  if (slots <= 0) return 0;
  const surplus = availableHeight - naturalContentHeight;
  if (surplus <= 0) return 0;
  return Math.min(maxPerSlot, surplus / slots);
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
