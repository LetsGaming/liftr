/**
 * Turns the cardio activity registry's anchor data (`cardioActivities.ts`) into full 9-tier
 * threshold tables, via the exact same `widenAnchorSpread -> interpolateNineTierAnchors -> expand`
 * pipeline `defaultStandards.ts` already uses for strength standards. Zero new interpolation math
 * — only new anchor data and, for single-speed activities, a single "all" bucket instead of five
 * per-category ones.
 */

import type { RankBucket, RankedActivityType, RunCategory } from "../math/riegel.js";
import { CARDIO_ACTIVITIES, rankedCardioActivities, type SexedAnchors } from "./cardioActivities.js";
import { expand, interpolateNineTierAnchors, widenAnchorSpread } from "./defaultStandards.js";
import type { StandardThreshold, TrustTier } from "./tiers.js";

export type CardioStandardRow = StandardThreshold & {
  activityType: RankedActivityType;
  category: RankBucket;
  sex: "male" | "female";
};

function buildAnchorRows(
  anchors: SexedAnchors,
  activityType: RankedActivityType,
  category: RankBucket,
  trust: TrustTier,
): CardioStandardRow[] {
  const out: CardioStandardRow[] = [];
  for (const sex of ["male", "female"] as const) {
    const sexAnchors = sex === "male" ? anchors.male : anchors.female;
    const widened = widenAnchorSpread(sexAnchors);
    const interpolated = interpolateNineTierAnchors(widened);
    const expanded = expand(interpolated, trust);
    for (const threshold of expanded) {
      out.push({ ...threshold, activityType, category, sex });
    }
  }
  return out;
}

/** @returns 270 rows: 5 categories × 2 sexes × 27 divisions. */
export function buildRunStandards(): CardioStandardRow[] {
  const runDef = CARDIO_ACTIVITIES.find((a) => a.id === "run")!;
  if (runDef.rank.mode !== "distance-ladder") throw new Error("buildRunStandards: run is not a distance-ladder");
  const out: CardioStandardRow[] = [];
  for (const category of runDef.rank.categories as RunCategory[]) {
    out.push(...buildAnchorRows(runDef.rank.anchors[category], "run", category, runDef.trust));
  }
  return out;
}

/** @returns 54 rows: 1 bucket ("all") × 2 sexes × 27 divisions, for one single-speed activity. */
function buildSingleSpeedStandards(activityId: RankedActivityType): CardioStandardRow[] {
  const def = CARDIO_ACTIVITIES.find((a) => a.id === activityId)!;
  if (def.rank.mode !== "single-speed") throw new Error(`buildSingleSpeedStandards: "${activityId}" is not single-speed`);
  return buildAnchorRows(def.rank.anchors, activityId, "all", def.trust);
}

/** Every rankable activity's standards in one array — the single source `ingestRunStandards.ts`
 *  writes from, so its whole-table delete-and-rewrite stays correct by construction regardless of
 *  how many activities the registry grows to. */
export function buildCardioStandards(): CardioStandardRow[] {
  const out: CardioStandardRow[] = [];
  for (const activity of rankedCardioActivities()) {
    if (activity.rank.mode === "distance-ladder") {
      if (activity.id === "run") out.push(...buildRunStandards());
      // A future second distance-ladder activity would need its own buildXStandards() the same
      // shape as buildRunStandards() — not written generically since "run" is the only one today
      // and RUN_CATEGORIES/riegel.ts's normalization is running-specific.
    } else if (activity.rank.mode === "single-speed") {
      out.push(...buildSingleSpeedStandards(activity.id));
    }
  }
  return out;
}
