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

import type { ActivityType } from "./riegel.js";

/** XP per kilometer of distance. Nominal, tuned so a typical 5K sits in the same rough order of
 *  magnitude as a typical strength session's per-set XP total. This is an initial guess, not
 *  first-principles derived — like `TIER_XP_MULTIPLIER`'s values, it was arrived at by eyeballing
 *  rough parity with the existing set-XP formula, not by any formal derivation, and is expected to
 *  need a future balancing pass once real usage data exists.
 *
 *  Divided by xp.ts's `XP_SCALE_DOWN` (not re-imported — this module is a deliberate standalone
 *  sibling, see the module comment) so runs stay in the same rescaled order of magnitude as set
 *  XP and the shared level curve, instead of suddenly dwarfing them. */
export const RUN_XP_PER_KM = 60 / 10;

/** XP per kilometer for a walk. Walking's net metabolic cost is roughly half running's per
 *  kilometre, and a walked kilometre is far easier to accumulate incidentally (it takes no
 *  specific fitness), so the rate sits under half rather than exactly half — "it would be unfair
 *  to treat as the same as jogging." */
export const WALK_XP_PER_KM = 25 / 10;

/** XP per kilometer for a hike. Terrain and elevation make a hiked kilometre cost more than a
 *  walked one but still well under a run — sits between the two rather than at either end. */
export const HIKE_XP_PER_KM = 35 / 10;

/** XP per minute for a cardio activity that isn't run/walk/hike (cycling, rowing, swimming, ...).
 *  These types are distance-incomparable across each other (10km cycled != 10km rowed), so they
 *  pay by time instead of distance — 12 XP/hour, just under what an hour's walk earns. */
export const OTHER_XP_PER_MINUTE = 0.2;

/** Anti-grinding decay step/floor for repeated similar-distance runs. Deliberately the *same*
 *  values as `xp.ts`'s `REPEAT_XP_DECAY_STEP`/`REPEAT_XP_FLOOR_MULTIPLIER` — same anti-grinding
 *  spirit, same "decay toward a floor, never to zero" shape, just applied to a distance bucket
 *  instead of an exercise+weight+reps combo. Kept as separate constants (not re-exported from
 *  xp.ts) so this module stays a standalone sibling, matching the precedent set by
 *  `runPlausibility.ts` duplicating `severityRamp` rather than importing the workout gate's
 *  internals. */
export const RUN_REPEAT_XP_DECAY_STEP = 0.15;
export const RUN_REPEAT_XP_FLOOR_MULTIPLIER = 0.5;

/** Small XP bonus for a run whose distance/pace/HR came from a synced smartwatch (Health Connect
 *  today) rather than phone GPS alone: watch-derived GPS+HR is higher-fidelity and meaningfully
 *  harder to fabricate than a phone-only recording, so it's treated as more plausible and earns a
 *  little more — not a reward for owning a watch, a reward for the run being better-corroborated.
 *  Deliberately modest (unlike `computeRunPlausibility`'s multiplier, this never gates rank/PR
 *  eligibility or moves where a run lands against the rank thresholds — only the XP payout). */
export const HEALTHCONNECT_XP_BONUS_MULTIPLIER = 1.08;

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

/** Width (minutes) of the duration bucket used for "other" cardio's repeat-decay occurrence key —
 *  these activities pay by time, so their decay bucket is time-based too. */
const OTHER_DURATION_BUCKET_S = 600; // 10 minutes

/** Namespaces the repeat-decay occurrence key by activity type, so a daily walk can't burn down
 *  the decay counter for the user's runs of the same distance (and vice versa) — each activity
 *  type gets its own independent occurrence sequence. "other" keys on duration, not distance,
 *  since it pays by time. Every pre-existing run has `activityType: "run"` (the schema column's
 *  default), so historical keys shift uniformly (`"10"` -> `"run:10"`) and past totals are
 *  unchanged. */
export function runDecayKey(activityType: ActivityType, distanceM: number, durationS: number): string {
  if (activityType === "other") {
    return `other:${Math.round(durationS / OTHER_DURATION_BUCKET_S)}`;
  }
  return `${activityType}:${quantizeDistanceForDecay(distanceM)}`;
}

/** XP rate per kilometre (run/walk/hike) — "other" pays by time instead, see `computeRunXp`. */
export function cardioXpPerKm(activityType: ActivityType): number {
  if (activityType === "walk") return WALK_XP_PER_KM;
  if (activityType === "hike") return HIKE_XP_PER_KM;
  return RUN_XP_PER_KM;
}

export interface RunXpInput {
  runId: string;
  distanceM: number;
  durationS: number;
  loggedAt: Date; // startedAt
  /** Defaults to "run" so every existing caller (all running today) computes byte-identical XP. */
  activityType?: ActivityType;
  /** Defaults to 1 (no discount). Manual runs always pass 1 — the plausibility gate
   *  (`computeRunPlausibility`) never runs against a manual entry, since there are no
   *  `run_points` to independently check distance against in the first place. */
  plausibilityMultiplier?: number;
  /** "healthconnect" applies `HEALTHCONNECT_XP_BONUS_MULTIPLIER`; every other source (gpx/fit/
   *  manual, or omitted) gets no bonus. Optional since most callers (rank/PR code) never need it —
   *  only computeRunXp reads this field. Applies to all activity types alike — the bonus rewards
   *  corroboration fidelity (watch-derived GPS+HR vs. phone-only), not the activity's modality. */
  source?: "gpx" | "fit" | "manual" | "healthconnect";
}

/** A single activity's base XP before repeat-decay. Run/walk are purely linear in distance
 *  (unlike sets, a run's raw magnitude legitimately scales with how far it covered — the
 *  anti-grinding protection here is entirely in the *decay*). "other" pays linearly in duration
 *  instead, since its distance isn't comparable across activity types. */
function baseCardioXp(activityType: ActivityType, distanceM: number, durationS: number): number {
  if (activityType === "other") {
    return (durationS / 60) * OTHER_XP_PER_MINUTE;
  }
  return (distanceM / 1000) * cardioXpPerKm(activityType);
}

/** Sums XP across a full cardio history, applying the repeat-decay per activity-type-namespaced
 *  bucket in chronological order. Mirrors `computeTotalXp`'s "sort then walk, keying occurrence on
 *  a bucketed value" shape. Pure function over an array of run records — computes nothing that
 *  gets persisted; `getRunXpSummary` calls this by scanning all of a user's `runs` rows fresh on
 *  every read, matching the codebase's "no XP ledger table" philosophy. */
export function computeRunXp(runs: RunXpInput[]): number {
  const sorted = [...runs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const occurrenceByKey = new Map<string, number>();
  let total = 0;
  for (const run of sorted) {
    const activityType = run.activityType ?? "run";
    const key = runDecayKey(activityType, run.distanceM, run.durationS);
    const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
    occurrenceByKey.set(key, occurrence);
    const plausibilityMultiplier = run.plausibilityMultiplier ?? 1;
    const sourceBonus = run.source === "healthconnect" ? HEALTHCONNECT_XP_BONUS_MULTIPLIER : 1;
    total +=
      baseCardioXp(activityType, run.distanceM, run.durationS) *
      repeatRunMultiplier(occurrence) *
      plausibilityMultiplier *
      sourceBonus;
  }
  return total;
}
