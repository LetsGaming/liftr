/**
 * Per-run plausibility gate — the run-side sibling of `plausibility.ts`'s per-workout gate. Same
 * spirit: not a fraud verdict, an honest heuristic that discounts a run's XP/LP/peak contribution
 * rather than discarding it outright. Deliberately a pure function with no knowledge of `source`
 * ("manual" vs GPS-tracked) — the call site (rankService.ts/syncService.ts, Task 8's concern) is
 * responsible for only ever calling this for GPS-tracked runs, since a manual entry has no
 * `run_points` to independently check distance against in the first place.
 *
 * `paceSeverity` in the workout gate is seconds-per-*set* and has no meaning here — a run's two
 * heuristics below are genuinely new, not a reuse of that one.
 */

import { MAX_PLAUSIBLE_SPEED_M_S, pathDistanceM } from "../math/gps.js";
import type { RankedActivityType } from "../math/riegel.js";
import { PLAUSIBILITY_FLOOR } from "./plausibility.js";

/** Below this sustained average speed (m/s), no discount at all. Set comfortably above real-world
 *  elite *distance* pace — world-record marathon pace is ~5.8 m/s, world-record 10K ~6.4 m/s,
 *  world-record 5K ~6.6 m/s — so a genuinely elite (but real) performance never starts the ramp.
 *  Severity then rises from here up to `MAX_PLAUSIBLE_SPEED_M_S` (8 m/s, already "faster than
 *  world-class marathon pace" per gps.ts and the actual point-level jitter-rejection ceiling used
 *  when a run is first summarized), where it's treated as physically impossible to sustain and
 *  hits the floor. The ~1.4 m/s gap between this and the ceiling is deliberately wide: it's the
 *  one heuristic most likely to sit near a genuine world-class outlier, so the point where *any*
 *  discount starts must stay generous, the same design choice `plausibility.ts` makes for its own
 *  most-likely-to-catch-a-real-breakthrough heuristic (`JUMP_FINE_THRESHOLD`). */
export const RUN_SPEED_FINE_THRESHOLD_M_S = 7.0;

/** The walking sibling of `RUN_SPEED_FINE_THRESHOLD_M_S`. Today's gate only penalizes runs for
 *  being implausibly *fast*; without a walk-specific floor, an activity mislabeled "walk" (e.g. a
 *  jog misclassified by Health Connect, or a user picking the wrong type) would sail onto the
 *  easier walking ladder at a full 1.0 multiplier. 3.0 m/s (~10:53 min/mile) sits comfortably
 *  above even competitive race-walking pace (world-class 20K race walkers sustain ~4.3 m/s, but
 *  that's a specialized gait most watches won't distinguish from a fast walk at the sample rate
 *  Health Connect gives us) while catching anything that is unambiguously a run. Severity then
 *  ramps up to `RUN_SPEED_FINE_THRESHOLD_M_S`, the speed at which it's unambiguously running. */
export const WALK_SPEED_FINE_THRESHOLD_M_S = 3.0;

/** A same-run independently-recomputed distance (via `pathDistanceM` over the run's own points)
 *  that differs from the stored `distanceM` by more than this fraction starts rising in severity.
 *  Kept generous because `distanceM` is derived from a *smoothed*, pause-gap-filtered, jitter-
 *  rejecting pass over the raw points (`summarizeRun`), while this check's `pathDistanceM` is a
 *  raw, unfiltered straight-line sum over the same points — some daylight between the two is
 *  expected for any real run and must not be flagged. */
export const DISTANCE_MISMATCH_FINE_FRACTION = 0.15;

/** A mismatch at/beyond this fraction is far past any plausible smoothing/filtering daylight and
 *  reads as a fabricated or corrupted `distanceM` (a manual override of a GPS-derived value, or a
 *  bad import) — maximal severity. */
export const DISTANCE_MISMATCH_MAX_SEVERITY_FRACTION = 0.5;

export interface RunPlausibilityInput {
  distanceM: number;
  durationS: number;
  points: { t: number; lat: number; lon: number }[]; // run_points, chronological
  /** Defaults to "run" so existing callers (all running today) are unaffected. */
  activityType?: RankedActivityType;
}

export type RunPlausibilityReason = "sustained_speed" | "distance_mismatch";

export interface RunPlausibilityResult {
  multiplier: number; // same PLAUSIBILITY_FLOOR=0.05 floor as the workout gate, never zero
  reason: RunPlausibilityReason | null;
}

/** Maps a "fine at `fineAt`, maximally severe at `maxAt`" linear ramp to a [0,1] severity. Same
 *  helper as `plausibility.ts`'s `severityRamp` (duplicated, not imported, to keep this module a
 *  standalone sibling rather than reaching into the workout gate's internals). */
function severityRamp(value: number, fineAt: number, maxAt: number): number {
  if (value <= maxAt) return 1;
  if (value >= fineAt) return 0;
  return (fineAt - value) / (fineAt - maxAt);
}

function sustainedSpeedSeverity(input: RunPlausibilityInput): number {
  if (input.durationS <= 0 || input.distanceM <= 0) return 0;
  const avgSpeedMS = input.distanceM / input.durationS;
  // higher speed is worse, so negate to reuse the "lower value is worse" ramp convention (same
  // trick `ceilingSeverity` in plausibility.ts uses for its own "higher ratio is worse" check).
  if (input.activityType === "walk" || input.activityType === "hike") {
    return severityRamp(-avgSpeedMS, -WALK_SPEED_FINE_THRESHOLD_M_S, -RUN_SPEED_FINE_THRESHOLD_M_S);
  }
  return severityRamp(-avgSpeedMS, -RUN_SPEED_FINE_THRESHOLD_M_S, -MAX_PLAUSIBLE_SPEED_M_S);
}

function distanceMismatchSeverity(input: RunPlausibilityInput): number {
  if (input.distanceM <= 0 || input.points.length < 2) return 0;
  const recomputedM = pathDistanceM(input.points);
  const mismatchFraction = Math.abs(recomputedM - input.distanceM) / input.distanceM;
  return severityRamp(
    -mismatchFraction,
    -DISTANCE_MISMATCH_FINE_FRACTION,
    -DISTANCE_MISMATCH_MAX_SEVERITY_FRACTION,
  );
}

export function computeRunPlausibility(input: RunPlausibilityInput): RunPlausibilityResult {
  const speed = sustainedSpeedSeverity(input);
  const mismatch = distanceMismatchSeverity(input);

  const worst = Math.max(speed, mismatch);
  if (worst === 0) return { multiplier: 1, reason: null };

  const reason: RunPlausibilityReason = mismatch === worst ? "distance_mismatch" : "sustained_speed";
  const multiplier = Math.max(PLAUSIBILITY_FLOOR, 1 - worst);
  return { multiplier, reason };
}
