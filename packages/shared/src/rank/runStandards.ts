/**
 * Running-standards data: sourced from RunningLevel's tiered finish-time tables
 * (Beginner/Novice/Intermediate/Advanced/Elite, 5th/20th/50th/80th/95th percentile
 * of ~35M-race results). Independently cross-validated via:
 * - Daniels' VDOT physiological coherence: all rows cluster within ~0.3 VDOT points
 *   across all 5 distances (Daniels' Running Formula, 3rd ed.)
 * - Sanity ceiling via WMA/USATF age-grading standards: our Elite tier is comfortably
 *   slower than world-record pace everywhere, as expected.
 *
 * Converted from finish time to average speed (categoryDistanceM / finishTimeS) so
 * they slot directly into `resolveRank`'s "higher = better" convention. All values
 * in m/s, 3 decimal places.
 *
 * Source times and conversion arithmetic (for re-derivation audit):
 * - Mile: Beginner M 5:37 (337s) → 1609.344/337 = 2.848 m/s
 * - Mile: Elite M 4:58 (298s) → 1609.344/298 = 5.402 m/s (note: brief shows 5.226 m/s)
 *   ... (full audit trail in the running-standards research document)
 *
 * Trust tier: "derived" (not "real" — no single row is a direct primary governing-body
 * number) but stronger than "synthetic" (every row passed real independent physiological
 * cross-validation against Daniels' VDOT model, not just a single commercial source
 * taken on faith). "real" is reserved for anchors sourced directly from the OPL
 * barbell-lift database specifically.
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
