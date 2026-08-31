/**
 * Per-workout plausibility gate (rank engine v2). Three independent, cheap heuristics — not a
 * fraud verdict, an honest heuristic in the same spirit as recovery.ts/decay.ts. Never used to
 * discard a workout or its sets, only to discount their XP/LP/peak contribution: computed once
 * per finished workout and applied by the caller (rankService.ts, syncService.ts).
 */

/** Below this many seconds/set, pace severity starts rising; at or below this floor, severity
 *  is maximal. */
const PACE_FINE_THRESHOLD_S = 12;
const PACE_MAX_SEVERITY_THRESHOLD_S = 4;

/** A same-session e1RM jump over this fraction above stored peak starts rising in severity. */
const JUMP_FINE_THRESHOLD = 0.4;
const JUMP_MAX_SEVERITY_THRESHOLD = 1.0;

/** A load-ratio value beyond this multiple of the Apex entry threshold is maximally severe
 *  outright (not a gradient — this is a hard sanity ceiling, not a soft pace/jump signal). */
const CEILING_MULTIPLE = 1.5;

/** Never fully zero a session's contribution — a token amount still credits, same "still earns
 *  *something*, just progressively less" precedent as xp.ts's REPEAT_XP_FLOOR_MULTIPLIER. */
export const PLAUSIBILITY_FLOOR = 0.05;

export interface PlausibilityExerciseInput {
  exerciseId: string;
  sessionBestRatio: number | null;
  storedPeakRatio: number | null;
  apexThreshold: number | null;
}

export interface PlausibilityInput {
  totalSetCount: number;
  effectiveDurationSeconds: number;
  exercises: PlausibilityExerciseInput[];
}

export type PlausibilityReason = "pace" | "improbable_jump" | "exceeds_ceiling";

export interface PlausibilityResult {
  multiplier: number;
  reason: PlausibilityReason | null;
}

/** Maps a "fine at `fineAt`, maximally severe at `maxAt`" linear ramp to a [0,1] severity. */
function severityRamp(value: number, fineAt: number, maxAt: number): number {
  if (value <= maxAt) return 1;
  if (value >= fineAt) return 0;
  return (fineAt - value) / (fineAt - maxAt);
}

function paceSeverity(input: PlausibilityInput): number {
  if (input.totalSetCount === 0 || input.effectiveDurationSeconds <= 0) return 0;
  const secondsPerSet = input.effectiveDurationSeconds / input.totalSetCount;
  return severityRamp(secondsPerSet, PACE_FINE_THRESHOLD_S, PACE_MAX_SEVERITY_THRESHOLD_S);
}

function jumpSeverity(input: PlausibilityInput): number {
  let worst = 0;
  for (const ex of input.exercises) {
    if (ex.sessionBestRatio == null || ex.storedPeakRatio == null || ex.storedPeakRatio <= 0) continue;
    const jumpFraction = (ex.sessionBestRatio - ex.storedPeakRatio) / ex.storedPeakRatio;
    if (jumpFraction <= 0) continue;
    const severity = severityRamp(-jumpFraction, -JUMP_FINE_THRESHOLD, -JUMP_MAX_SEVERITY_THRESHOLD);
    worst = Math.max(worst, severity);
  }
  return worst;
}

function ceilingSeverity(input: PlausibilityInput): number {
  for (const ex of input.exercises) {
    if (ex.sessionBestRatio == null || ex.apexThreshold == null || ex.apexThreshold <= 0) continue;
    if (ex.sessionBestRatio > ex.apexThreshold * CEILING_MULTIPLE) return 1;
  }
  return 0;
}

export function computeWorkoutPlausibility(input: PlausibilityInput): PlausibilityResult {
  const pace = paceSeverity(input);
  const jump = jumpSeverity(input);
  const ceiling = ceilingSeverity(input);

  const worst = Math.max(pace, jump, ceiling);
  if (worst === 0) return { multiplier: 1, reason: null };

  const reason: PlausibilityReason = ceiling === worst ? "exceeds_ceiling" : jump === worst ? "improbable_jump" : "pace";
  const multiplier = Math.max(PLAUSIBILITY_FLOOR, 1 - worst);
  return { multiplier, reason };
}
