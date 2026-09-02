/**
 * Per-workout plausibility gate (rank engine v2). Three independent, cheap heuristics — not a
 * fraud verdict, an honest heuristic in the same spirit as recovery.ts/decay.ts. Never used to
 * discard a workout or its sets, only to discount their XP/LP/peak contribution: computed once
 * per finished workout and applied by the caller (rankService.ts, syncService.ts).
 *
 * Engagement-audit-v3 Phase 3 considered a fourth "implausible single-set session" heuristic
 * (one suspiciously heavy set hiding inside an otherwise normal-paced workout). That gap turned
 * out to already exist in the *caller*, not here: the jump/ceiling heuristics below are unit-
 * agnostic ratio comparisons (they only ever compare a session value against a same-exercise
 * stored peak / apex threshold, never against absolute kg), so they already catch a single
 * implausible set for any `load_ratio` exercise regardless of the rest of the session's pace.
 * The actual gap was that `syncService.ts` was passing `null` for `sessionBestRatio`/
 * `storedPeakRatio`/`apexThreshold` on every `metric === "reps"` exercise (pull-ups, push-ups,
 * etc.) — a deliberate fix for a real prior bug (comparing a load ratio against a raw rep count),
 * but it over-corrected into skipping the jump/ceiling checks for that whole exercise class
 * entirely. Rep counts are just as ratio-comparable to a rep-based peak/apex as a load ratio is
 * to a load-ratio peak/apex, so `syncService.ts` now wires session-best-reps /
 * stored-peak-reps / apex-reps-threshold through the same two heuristics instead of nulling them
 * out — no new heuristic function needed, and no duplicate logic to keep in sync with this one.
 */

/** Below this many seconds/set, pace severity starts rising; at or below this floor, severity
 *  is maximal.
 *  Tightened (engagement-audit-v3 Phase 3, from 12/4) to 15/6: 12s/set as a whole-session average
 *  is already almost a full-body-no-rest pace, but it left a gap for a moderately-fast circuit
 *  session (rack changes, transitions between stations) to log completely clean. Pace is
 *  deliberately the *least* risky heuristic to tighten of the three — a genuinely heavy PR
 *  attempt needs real rest to recover between sets, so a real breakthrough set is essentially
 *  never also a fast-pace session; tightening this ramp doesn't put real PR sessions at risk the
 *  way tightening the jump heuristic below would. */
export const PACE_FINE_THRESHOLD_S = 15;
export const PACE_MAX_SEVERITY_THRESHOLD_S = 6;

/** A same-session e1RM jump over this fraction above stored peak starts rising in severity.
 *  FINE threshold deliberately left at 0.4 (unchanged) — this is the one heuristic most likely to
 *  catch a genuine breakthrough session (short rest, good day, a lifter finally clearing a
 *  plateau), so the point where *any* discount starts must stay generous. MAX_SEVERITY tightened
 *  from 1.0 to 0.75: a same-session e1RM more than ~75% above the stored peak is far more often a
 *  unit-entry mistake (kg/lb mixup, decimal slip) or a fabricated set than a real single-session
 *  PR — genuine single-session jumps that large are rare even for novices making fast early
 *  gains. Tightening the top of the ramp (not the bottom) keeps ordinary 40-60% breakthrough
 *  sessions only lightly discounted while making truly outlandish jumps hit the floor sooner. */
export const JUMP_FINE_THRESHOLD = 0.4;
export const JUMP_MAX_SEVERITY_THRESHOLD = 0.75;

/** A load-ratio value beyond this multiple of the Apex entry threshold is maximally severe
 *  outright (not a gradient — this is a hard sanity ceiling, not a soft pace/jump signal).
 *  Tightened from 1.5 to 1.3 — the Apex threshold already represents the top of the modeled
 *  population; clearing it by 30% is already essentially unattested human performance for any
 *  natural lifter, so 1.5x was leaving real headroom for an implausible value to still read as
 *  merely "discounted" rather than "outright rejected." */
export const CEILING_MULTIPLE = 1.3;

/** Never fully zero a session's contribution — a token amount still credits, same "still earns
 *  *something*, just progressively less" precedent as xp.ts's REPEAT_XP_FLOOR_MULTIPLIER. Left
 *  unchanged: this is a design floor on XP/LP credit (deliberately never zero), not a detection
 *  threshold — the actual "reject outright" behavior for badly-flagged sessions now lives in
 *  rankService.ts's PR-hard-block and peak-eligibility gates instead, which is where "zero
 *  credit" belongs per the audit's hybrid decision (Phase 3, decision 1). */
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
