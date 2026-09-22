/**
 * The cardio activity registry — the single place that says which cardio activities exist, how
 * each one ranks (or doesn't), what it pays in XP, its data-trust level, and which raw Health
 * Connect exercise-type strings map onto it. Every layer (ingest, the rank service, the routes,
 * the client's ladder grid) reads this instead of hardcoding activity-specific branches, so
 * adding a future activity (cycling, rowing, ...) is a new entry here plus anchor data — not a
 * change spread across a dozen files. That property already exists on the strength side (its
 * rankable unit is a DB row driven by `tools/catalog/curated.yaml`); this registry gives cardio
 * the same property, since its rankable unit (an activity type) can't be a DB row the same way.
 *
 * Two rank shapes exist, not one:
 * - "distance-ladder" (running only): five fixed distance categories, each independently ranked,
 *   with Riegel normalization onto the category's exact distance — see `../math/riegel.ts`.
 * - "single-speed" (walking, hiking): one bucket, ranked on plain average speed with no Riegel
 *   normalization at all. An earlier design gave walking five categories too, with its own Riegel
 *   exponent — but that exponent (a "walking pace barely decays with distance" argument) directly
 *   contradicted its own anchor speeds, which dropped ~15% from mile to marathon (an effective
 *   exponent of ~1.05, not the claimed 1.02). Rather than reconcile synthetic data against itself,
 *   walking/hiking rank on one number: how fast, not how far — XP already rewards distance
 *   (`../math/runXp.ts`), so nothing is lost by not also ranking it.
 *
 * Single-speed activities gate rank eligibility on a minimum distance AND duration — without a
 * floor, a 200m walk to the mailbox at a brisk moment could rank as highly as a genuine long walk,
 * and short efforts are disproportionately noisy (one paused-at-a-crosswalk moment skews the whole
 * average). Below the floor: XP + streak credit, same as `"other"`, just no rank.
 */

import { RUN_CATEGORIES, type ActivityType, type RankedActivityType, type RunCategory } from "../math/riegel.js";
import { HIKE_XP_PER_KM, OTHER_XP_PER_MINUTE, RUN_XP_PER_KM, WALK_XP_PER_KM } from "../math/runXp.js";
import type { TrustTier } from "./tiers.js";

/** 5-tier anchor speeds (m/s), matching tier indices [Beginner, Novice, Intermediate, Advanced,
 *  Elite] — the same shape `defaultStandards.ts` uses for strength anchors, just named here since
 *  cardio's anchor data lives in this file instead of a YAML catalog. */
export type FiveAnchor = [number, number, number, number, number];
export interface SexedAnchors {
  male: FiveAnchor;
  female: FiveAnchor;
}

export type RankMode =
  | {
      mode: "distance-ladder";
      categories: readonly RunCategory[];
      anchors: Record<RunCategory, SexedAnchors>;
    }
  | {
      mode: "single-speed";
      anchors: SexedAnchors;
      /** A run below EITHER floor earns XP/streak only — no rank. */
      minDistanceM: number;
      minDurationS: number;
    }
  | { mode: "none" };

export interface CardioActivityDef {
  id: ActivityType;
  rank: RankMode;
  trust: TrustTier;
  /** Whether this activity's rank contributes to Overall Runner Rank. Running does; walking and
   *  hiking don't — their standards are synthetic estimates, not physiologically cross-validated
   *  the way running's are (see runStandards.ts), and folding them in would let effort that takes
   *  no specific fitness move a number people read as being about running. The exclusion is
   *  surfaced in the UI (RankRunnerSection.vue), not just silently applied here. */
  countsTowardOverallRunnerRank: boolean;
  xp: { perKm: number } | { perMinute: number };
  /** Health Connect's raw `exerciseType` strings (via capacitor-health's Kotlin mapping) that
   *  classify as this activity. Classification runs server-side (the client posts the raw
   *  string) so the mapping stays single-sourced and re-classifiable without a client release. */
  healthConnectTypes: readonly string[];
}

/**
 * Running-category anchors keyed by RunCategory, each mapping male/female to their independent
 * 5-tier anchor speed table (m/s). Sourced from RunningLevel's tiered finish-time tables
 * (Beginner/Novice/Intermediate/Advanced/Elite, 5th/20th/50th/80th/95th percentile of RunRepeat's
 * underlying ~35M-result/28,000+-race database), age 20 as the open/prime-age baseline — the same
 * simplification `defaultStandards.ts` makes implicitly (its strength anchors aren't age-graded
 * either).
 *
 * Independently cross-validated before trusted:
 * - Internal consistency via Daniels' VDOT (Daniels' Running Formula, 3rd ed.): each tier row's
 *   time at all 5 distances converts to an implied VDOT score, every row tested clustered within
 *   ~0.3 VDOT points across all distances — i.e. the table behaves like one physiologically
 *   coherent fitness level, not an arbitrary per-distance guess.
 * - Sanity ceiling via WMA/USATF age-grading Age Standards (2025): M/F 5K 12:49/13:54, 10K
 *   26:24/28:46, Half 57:31/1:02:52, Marathon 2:00:35/2:09:56 — comfortably faster than our Elite
 *   tier everywhere, as expected.
 * - Population framing: RunningLevel's tiers reflect training-intent racers, not all-comers
 *   charity-run finishers. Liftr's strength-standards precedent already uses a training-intent
 *   population (gym lifters), not general-public, so this fit was deliberately kept rather than
 *   pulled toward slower all-comers medians.
 *
 * Converted from finish time to average speed (categoryDistanceM / finishTimeS) so they slot
 * directly into `resolveRank`'s "higher = better" convention. All values in m/s, 3 decimal places.
 * Example: Mile Elite M 5:08 = 308s, 1609.344/308 = 5.226 m/s.
 *
 * Trust tier: "derived" — not "real" (no single row is a direct primary governing-body number)
 * but stronger than "synthetic" (every row passed real independent physiological cross-validation
 * against Daniels' VDOT model, not just a single commercial source taken on faith).
 */
export const RUN_ANCHOR_STANDARDS: Record<RunCategory, SexedAnchors> = {
  mile: {
    male: [2.848, 3.439, 4.043, 4.651, 5.226],
    female: [2.514, 2.98, 3.469, 3.945, 4.397],
  },
  "5k": {
    male: [2.647, 3.167, 3.701, 4.223, 4.717],
    female: [2.351, 2.766, 3.191, 3.613, 4.01],
  },
  "10k": {
    male: [2.545, 3.05, 3.568, 4.075, 4.55],
    female: [2.253, 2.654, 3.068, 3.476, 3.858],
  },
  half_marathon: {
    male: [2.426, 2.902, 3.396, 3.884, 4.341],
    female: [2.141, 2.514, 2.903, 3.29, 3.654],
  },
  marathon: {
    male: [2.368, 2.812, 3.272, 3.727, 4.156],
    female: [2.102, 2.453, 2.816, 3.176, 3.516],
  },
};

/**
 * Walking's single speed-bucket anchors (m/s), same [5th, 20th, 50th, 80th, 95th] percentile
 * shape as RUN_ANCHOR_STANDARDS. There is no RunningLevel-equivalent percentile dataset for
 * recreational walking, so these are grounded in published normative gait-speed research rather
 * than a race database:
 * - Median (50th pct): Bohannon & Williams Andrews (2011) normative comfortable gait speed for
 *   healthy adults, ~1.3-1.4 m/s; cross-checked against Tudor-Locke's ~100 steps/min
 *   moderate-intensity walking cadence (~1.35 m/s at a typical stride length).
 * - Upper anchors: maximal (non-running) gait-speed norms and recreational power-walk 5K finish
 *   times (44-52 min, i.e. 1.6-1.9 m/s).
 * - Lower anchor: a relaxed/casual walking pace well below moderate-intensity cadence.
 * - Sex gap: ~4%, matching the gap the gait-speed literature consistently shows — much smaller
 *   than running's ~11%, since walking speed is far less strength/power-limited.
 *
 * This is the 5K row from an earlier, since-removed five-category walking ladder — the mid-range
 * reference, kept as the one bucket now that walking ranks on a single speed instead of distance.
 *
 * Trust tier: "synthetic" — unlike RUN_ANCHOR_STANDARDS, no independent physiological
 * cross-validation (à la Daniels' VDOT for running) has been done against these numbers; they are
 * a reasonable estimate, not a validated model, and the UI labels them as such (the `≈` /
 * "Geschätzter Standard" trust affordance).
 */
export const WALK_ANCHOR_STANDARDS: SexedAnchors = {
  male: [1.05, 1.25, 1.4, 1.6, 1.9],
  female: [1.01, 1.2, 1.34, 1.54, 1.82],
};

/**
 * Hiking's single speed-bucket anchors (m/s) — a fresh estimate, not sourced from a published
 * dataset the way even WALK_ANCHOR_STANDARDS partially is. Set at ~80% of the walking anchors:
 * terrain and elevation reliably cost 15-25% of flat-ground walking speed for a moderate
 * recreational hike (rule-of-thumb figures from hiking-pace literature, e.g. Naismith's-rule-
 * adjacent guidance), and there is no honest way to account for a specific hike's actual elevation
 * profile from Health Connect's data alone (no per-point elevation is guaranteed), so a flat
 * discount is the least-wrong simple model.
 *
 * Trust tier: "synthetic", same reasoning and same `≈` UI affordance as walking — arguably more
 * so, since this table's derivation is one step further from real data.
 */
export const HIKE_ANCHOR_STANDARDS: SexedAnchors = {
  male: [0.84, 1.0, 1.12, 1.28, 1.52],
  female: [0.81, 0.96, 1.08, 1.23, 1.46],
};

/** The full cardio activity registry. Order doesn't matter functionally, but running first
 *  matches its historical primacy in the codebase. */
export const CARDIO_ACTIVITIES: readonly CardioActivityDef[] = [
  {
    id: "run",
    rank: { mode: "distance-ladder", categories: RUN_CATEGORIES, anchors: RUN_ANCHOR_STANDARDS },
    trust: "derived",
    countsTowardOverallRunnerRank: true,
    xp: { perKm: RUN_XP_PER_KM },
    healthConnectTypes: ["RUNNING", "RUNNING_TREADMILL"],
  },
  {
    id: "walk",
    rank: { mode: "single-speed", anchors: WALK_ANCHOR_STANDARDS, minDistanceM: 1000, minDurationS: 600 },
    trust: "synthetic",
    countsTowardOverallRunnerRank: false,
    xp: { perKm: WALK_XP_PER_KM },
    healthConnectTypes: ["WALKING"],
  },
  {
    id: "hike",
    rank: { mode: "single-speed", anchors: HIKE_ANCHOR_STANDARDS, minDistanceM: 2000, minDurationS: 1800 },
    trust: "synthetic",
    countsTowardOverallRunnerRank: false,
    xp: { perKm: HIKE_XP_PER_KM },
    healthConnectTypes: ["HIKING"],
  },
  {
    id: "other",
    rank: { mode: "none" },
    trust: "synthetic",
    countsTowardOverallRunnerRank: false,
    xp: { perMinute: OTHER_XP_PER_MINUTE },
    healthConnectTypes: [],
  },
];

const CARDIO_ACTIVITY_BY_ID: ReadonlyMap<ActivityType, CardioActivityDef> = new Map(
  CARDIO_ACTIVITIES.map((a) => [a.id, a]),
);

/** Looks up an activity's registry entry. Throws on an unknown id — every `ActivityType` value
 *  must have a registry entry; this is a programmer error, not a runtime data condition. */
export function cardioActivity(id: ActivityType): CardioActivityDef {
  const def = CARDIO_ACTIVITY_BY_ID.get(id);
  if (!def) throw new Error(`cardioActivity: no registry entry for "${id}"`);
  return def;
}

/** Every activity whose `rank.mode` isn't "none" — i.e. every activity that can produce a
 *  `run_ranks` row. Narrowed to `id: RankedActivityType` so callers (recompute.ts,
 *  runRankService.ts) don't need their own cast: an activity that survives this filter is, by
 *  construction, ranked. */
export function rankedCardioActivities(): (CardioActivityDef & { id: RankedActivityType })[] {
  return CARDIO_ACTIVITIES.filter((a) => a.rank.mode !== "none") as (CardioActivityDef & {
    id: RankedActivityType;
  })[];
}

export function activityCountsTowardOverall(id: ActivityType): boolean {
  return CARDIO_ACTIVITY_BY_ID.get(id)?.countsTowardOverallRunnerRank ?? false;
}

/** Classifies Health Connect's raw `exerciseType` string into one of Liftr's activity types,
 *  via each registry entry's `healthConnectTypes`. Falls back to "other" for anything
 *  unrecognized (BIKING, ROWING, SWIMMING_*, WHEELCHAIR, ...) — XP + streak credit, no rank
 *  ladder, since there's no honest standards data to rank them against yet. */
export function classifyHealthConnectWorkoutType(rawWorkoutType: string): ActivityType {
  const normalized = rawWorkoutType.toUpperCase();
  for (const activity of CARDIO_ACTIVITIES) {
    if (activity.healthConnectTypes.includes(normalized)) return activity.id;
  }
  return "other";
}

/** True when a single-speed activity's distance/duration clears its rank-eligibility floor.
 *  Ladder (running) and "none" (other) activities have no floor — always eligible / never
 *  ranked, respectively, handled by the caller checking `rank.mode` first. */
export function isRankEligible(id: ActivityType, distanceM: number, durationS: number): boolean {
  const def = cardioActivity(id);
  if (def.rank.mode !== "single-speed") return def.rank.mode === "distance-ladder";
  return distanceM >= def.rank.minDistanceM && durationS >= def.rank.minDurationS;
}
