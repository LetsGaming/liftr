/**
 * Muscle-readiness heuristic (engagement rework W5) for the Übersicht "Erholungszone" hero —
 * answers "what should I train today?" as a training-decision aid, not a score. Deliberately
 * simple: a fixed recovery window per muscle group, not physiology (no volume/intensity/sleep
 * inputs) — same honesty posture as streak.ts's own "known simplification" note. Muscle-group
 * recovery time varies enormously by person, load, and sleep; this is a reasonable default
 * heuristic to drive a training suggestion, not a claim about the user's actual recovery state.
 */

/** Hours until a muscle is considered fully recovered from *primary* involvement in a session.
 *  Larger, multi-joint groups get the longer window; smaller/more resilient groups the shorter
 *  one. Must cover every slug in packages/client/src/lib/muscles.ts / packages/ingest/src/
 *  muscles.ts — missing slugs fall back to DEFAULT_RECOVERY_HOURS below. */
export const RECOVERY_HOURS: Record<string, number> = {
  chest: 72,
  lats: 72,
  quads: 72,
  hamstrings: 72,
  glutes: 72,
  traps: 72,
  biceps: 48,
  triceps: 48,
  "front-delts": 48,
  abs: 48,
  obliques: 48,
  serratus: 48,
  brachialis: 48,
  calves: 48,
  soleus: 48,
};

export const DEFAULT_RECOVERY_HOURS = 48;

/** Secondary (assisting) involvement in an exercise is lighter than primary — the muscle
 *  recovers faster than a full working session on it would require. */
export const SECONDARY_RECOVERY_FACTOR = 0.6;

/**
 * QUAL-04: a modest age adjustment to the recovery window, not a rank/score input (deliberately
 * kept out of the rank-tier badge — see @liftr/shared's rank/defaultStandards.ts for where a
 * sourced, precise adjustment like the sex ratio belongs instead). The literature here is
 * genuinely mixed — some studies find meaningfully slower recovery past middle age, others find
 * no age effect once training status is controlled for — so this stays a small, capped nudge
 * starting well past the age range where the evidence is weakest, not a claimed coefficient.
 * Consistent with this file's own "not a claim about real physiology" stance.
 */
const AGE_ADJUSTMENT_START_YEARS = 45;
const AGE_ADJUSTMENT_PER_YEAR = 0.01; // +1% recovery window per year past the threshold
const MAX_AGE_WINDOW_MULTIPLIER = 1.3; // capped at +30%, even for a much older lifter

function ageWindowMultiplier(birthYear: number | null | undefined, now: Date): number {
  if (!birthYear) return 1;
  const age = now.getUTCFullYear() - birthYear;
  if (age <= AGE_ADJUSTMENT_START_YEARS) return 1;
  return Math.min(MAX_AGE_WINDOW_MULTIPLIER, 1 + (age - AGE_ADJUSTMENT_START_YEARS) * AGE_ADJUSTMENT_PER_YEAR);
}

/**
 * 0 = just trained, fully fatigued. 1 = fully recovered (window elapsed, or never trained at
 * all). Linear ramp in between — not a claim of real physiological recovery curves, just enough
 * granularity to tint a muscle map from "hot" to "cool". `birthYear` is optional and only ever
 * widens the window (never shortens it) — an unset onboarding profile behaves exactly as before.
 */
export function computeReadiness(
  slug: string,
  lastTrainedAt: Date | null,
  wasPrimary: boolean,
  now: Date = new Date(),
  birthYear?: number | null,
): number {
  if (!lastTrainedAt) return 1;

  const baseHours = RECOVERY_HOURS[slug] ?? DEFAULT_RECOVERY_HOURS;
  const windowHours = (wasPrimary ? baseHours : baseHours * SECONDARY_RECOVERY_FACTOR) * ageWindowMultiplier(birthYear, now);

  const elapsedHours = (now.getTime() - lastTrainedAt.getTime()) / (1000 * 60 * 60);
  if (elapsedHours <= 0) return 0;
  if (elapsedHours >= windowHours) return 1;
  return elapsedHours / windowHours;
}
