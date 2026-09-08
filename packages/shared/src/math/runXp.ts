/**
 * Run XP formula — the run-side sibling of `xp.ts`'s per-set formula. Same anti-grinding
 * philosophy: rather than paying out linearly for raw distance (which would be trivially gameable
 * — "run the same easy 1K in a loop all day"), repeating a *similar* distance decays toward a
 * floor rather than to zero, exactly like `repeatSetMultiplier`/`quantizeLoadForDecay` decay a
 * repeated identical set. Unlike sets, though, different distances genuinely are different runs
 * — a 5K and a 10K are not "the same run repeated" the way an identical weight/rep set is, so the
 * decay keys on a *rounded distance bucket*, not on distance-as-such: a 5K, a 6K, and a 10K each
 * get their own independent occurrence counter.
 */

/** XP per kilometer of distance. Nominal, tuned so a typical 5K (~300 XP) sits in the same rough
 *  order of magnitude as a typical strength session's per-set XP total. This is an initial guess,
 *  not first-principles derived — like `TIER_XP_MULTIPLIER`'s values, it was arrived at by eyeballing
 *  rough parity with the existing set-XP formula, not by any formal derivation, and is expected to
 *  need a future balancing pass once real usage data exists. */
export const RUN_XP_PER_KM = 60;

/** Anti-grinding decay step/floor for repeated similar-distance runs. Deliberately the *same*
 *  values as `xp.ts`'s `REPEAT_XP_DECAY_STEP`/`REPEAT_XP_FLOOR_MULTIPLIER` — same anti-grinding
 *  spirit, same "decay toward a floor, never to zero" shape, just applied to a distance bucket
 *  instead of an exercise+weight+reps combo. Kept as separate constants (not re-exported from
 *  xp.ts) so this module stays a standalone sibling, matching the precedent set by
 *  `runPlausibility.ts` duplicating `severityRamp` rather than importing the workout gate's
 *  internals. */
export const RUN_REPEAT_XP_DECAY_STEP = 0.15;
export const RUN_REPEAT_XP_FLOOR_MULTIPLIER = 0.5;

/** Multiplier for the Nth time (1-indexed, `occurrence` = 1 on first-ever performance) a similar
 *  distance bucket has been run. Same `1/(1 + DECAY_STEP*(occurrence-1))`-shaped formula, floored
 *  the same way, as `repeatSetMultiplier`. */
export function repeatRunMultiplier(occurrence: number): number {
  return Math.max(
    RUN_REPEAT_XP_FLOOR_MULTIPLIER,
    1 / (1 + RUN_REPEAT_XP_DECAY_STEP * (occurrence - 1)),
  );
}

/** Width (meters) of the distance bucket used for the repeat-decay occurrence key — genuinely
 *  different distances (a 5K vs a 10K) must land in different buckets, while cosmetic GPS-noise
 *  differences in an otherwise-repeated route (5.02km vs 4.98km) should not. Nearest-500m rounding
 *  gives a fixed absolute bucket width (unlike `xp.ts`'s load bucketing, which is proportional —
 *  distance doesn't need log-space scaling since the range of realistic run distances is far
 *  narrower than the range of realistic lift loads). */
const RUN_DISTANCE_BUCKET_M = 500;

/** Quantizes a distance into a coarse bucket (nearest 500m) for use in the repeat-decay
 *  occurrence key, analogous to `quantizeLoadForDecay` in xp.ts but for distance instead of load.
 *  Exported so the bucketing/anti-cheat properties can be tested directly. */
export function quantizeDistanceForDecay(distanceM: number): string {
  const bucket = Math.round(distanceM / RUN_DISTANCE_BUCKET_M);
  return String(bucket);
}

export interface RunXpInput {
  runId: string;
  distanceM: number;
  durationS: number;
  loggedAt: Date; // startedAt
  /** Defaults to 1 (no discount). Manual runs always pass 1 — the plausibility gate
   *  (`computeRunPlausibility`) never runs against a manual entry, since there are no
   *  `run_points` to independently check distance against in the first place. */
  plausibilityMultiplier?: number;
}

/** A single run's base XP before repeat-decay: purely linear in distance (unlike sets, a run's
 *  raw magnitude legitimately scales with how far it covered — the anti-grinding protection here
 *  is entirely in the *decay*, not in flattening the base formula the way `computeSetXp` flattens
 *  weight out of its own magnitude). `durationS` isn't used in the magnitude itself — pace/duration
 *  plausibility is `computeRunPlausibility`'s job upstream, feeding in as `plausibilityMultiplier`
 *  here — but is kept on the interface since callers (and a future pace-aware term) need it
 *  alongside distance to describe a run at all. */
function baseRunXp(distanceM: number): number {
  return (distanceM / 1000) * RUN_XP_PER_KM;
}

/** Sums XP across a full run history, applying the repeat-distance decay per rounded-distance
 *  bucket in chronological order. Mirrors `computeTotalXp`'s "sort then walk, keying occurrence on
 *  a bucketed value" shape. Pure function over an array of run records — computes nothing that
 *  gets persisted; `getRunXpSummary` (Task 10) calls this by scanning all of a user's `runs` rows
 *  fresh on every read, matching the codebase's "no XP ledger table" philosophy. */
export function computeRunXp(runs: RunXpInput[]): number {
  const sorted = [...runs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const occurrenceByKey = new Map<string, number>();
  let total = 0;
  for (const run of sorted) {
    const key = quantizeDistanceForDecay(run.distanceM);
    const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
    occurrenceByKey.set(key, occurrence);
    const plausibilityMultiplier = run.plausibilityMultiplier ?? 1;
    total += baseRunXp(run.distanceM) * repeatRunMultiplier(occurrence) * plausibilityMultiplier;
  }
  return total;
}
