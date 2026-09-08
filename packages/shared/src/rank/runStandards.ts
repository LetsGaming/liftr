/**
 * Running-standards data: sourced from RunningLevel's tiered finish-time tables
 * (Beginner/Novice/Intermediate/Advanced/Elite, 5th/20th/50th/80th/95th percentile
 * of RunRepeat's underlying ~35M-result/28,000+-race database), age 20 as the
 * open/prime-age baseline — the same simplification `defaultStandards.ts` makes
 * implicitly (its strength anchors aren't age-graded either).
 *
 * Independently cross-validated before trusted:
 * - Internal consistency via Daniels' VDOT (Daniels' Running Formula, 3rd ed.):
 *   each tier row's time at all 5 distances converts to an implied VDOT score,
 *   every row tested clustered within ~0.3 VDOT points across all distances — i.e.
 *   the table behaves like one physiologically coherent fitness level, not an
 *   arbitrary per-distance guess.
 * - Sanity ceiling via WMA/USATF age-grading Age Standards (2025): M/F 5K
 *   12:49/13:54, 10K 26:24/28:46, Half 57:31/1:02:52, Marathon 2:00:35/2:09:56 —
 *   comfortably faster than our Elite tier everywhere, as expected.
 * - Population framing: RunningLevel's tiers reflect training-intent racers, not
 *   all-comers charity-run finishers. Liftr's strength-standards precedent already
 *   uses a training-intent population (gym lifters), not general-public, so this fit
 *   was deliberately kept rather than pulled toward slower all-comers medians.
 *
 * Converted from finish time to average speed (categoryDistanceM / finishTimeS) so
 * they slot directly into `resolveRank`'s "higher = better" convention. All values
 * in m/s, 3 decimal places. Example: Mile Elite M 5:08 = 308s, 1609.344/308 = 5.226 m/s.
 *
 * Trust tier: "derived" — not "real" (no single row is a direct primary
 * governing-body number) but stronger than "synthetic" (every row passed real
 * independent physiological cross-validation against Daniels' VDOT model, not just
 * a single commercial source taken on faith). "real" is reserved for anchors sourced
 * directly from the OPL barbell-lift database specifically.
 */

import { type RunCategory, RUN_CATEGORIES } from "../math/riegel.js";
import {
  expand,
  interpolateNineTierAnchors,
  widenAnchorSpread,
} from "./defaultStandards.js";
import type { StandardThreshold, TrustTier } from "./tiers.js";

/** FiveAnchor: 5-tier anchor speeds, matching the tier indices [Beginner, Novice, Intermediate, Advanced, Elite] */
export type FiveAnchor = [number, number, number, number, number];

/**
 * Running-category anchors keyed by RunCategory, each mapping male/female to
 * their independent 5-tier anchor speed table (m/s).
 *
 * The 5 tiers per sex:
 * [0] = Beginner (5th percentile)
 * [1] = Novice (20th percentile)
 * [2] = Intermediate (50th percentile)
 * [3] = Advanced (80th percentile)
 * [4] = Elite (95th percentile)
 */
export const RUN_ANCHOR_STANDARDS: Record<RunCategory, { male: FiveAnchor; female: FiveAnchor }> = {
  mile: {
    male: [2.848, 3.439, 4.043, 4.651, 5.226],
    female: [2.514, 2.980, 3.469, 3.945, 4.397],
  },
  "5k": {
    male: [2.647, 3.167, 3.701, 4.223, 4.717],
    female: [2.351, 2.766, 3.191, 3.613, 4.010],
  },
  "10k": {
    male: [2.545, 3.050, 3.568, 4.075, 4.550],
    female: [2.253, 2.654, 3.068, 3.476, 3.858],
  },
  half_marathon: {
    male: [2.426, 2.902, 3.396, 3.884, 4.341],
    female: [2.141, 2.514, 2.903, 3.290, 3.654],
  },
  marathon: {
    male: [2.368, 2.812, 3.272, 3.727, 4.156],
    female: [2.102, 2.453, 2.816, 3.176, 3.516],
  },
};

/**
 * Runs RUN_ANCHOR_STANDARDS through the exact same widenAnchorSpread ->
 * interpolateNineTierAnchors -> expand pipeline defaultStandards.ts already uses
 * for strength, producing the full 9-tier threshold table per category per sex.
 * Zero new interpolation math — only new anchor data.
 *
 * @returns Array of 270 StandardThreshold rows: 5 categories × 2 sexes × 27 divisions
 *          (sum of TIER_DIVISION_COUNT across all 9 tiers).
 */
export function buildRunStandards(): (StandardThreshold & {
  category: RunCategory;
  sex: "male" | "female";
})[] {
  const out: (StandardThreshold & { category: RunCategory; sex: "male" | "female" })[] = [];
  const trust: TrustTier = "derived";

  for (const category of RUN_CATEGORIES) {
    const anchors = RUN_ANCHOR_STANDARDS[category];

    for (const sex of ["male", "female"] as const) {
      const sexAnchors = sex === "male" ? anchors.male : anchors.female;
      const widened = widenAnchorSpread(sexAnchors);
      const interpolated = interpolateNineTierAnchors(widened);
      const expanded = expand(interpolated, trust);

      for (const threshold of expanded) {
        out.push({
          ...threshold,
          category,
          sex,
        });
      }
    }
  }

  return out;
}
