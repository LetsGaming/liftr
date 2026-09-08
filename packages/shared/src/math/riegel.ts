/**
 * Riegel race-time equivalence (1977): predicts equivalent performance times across
 * different running distances using a power-law relationship. Our implementation uses
 * two exponents based on deep validation against Daniels' VDOT tables: 1.08 for
 * Mile (crosses the VO2max/anaerobic boundary where decay is faster) and 1.06 for
 * all other categories (aerobic-endurance-dominated). The exponent is selected based
 * on the TARGET distance category, not the source, since we always normalize onto one
 * of 5 fixed category distances (nearest-category bucketing).
 */

export const RUN_CATEGORIES = ["mile", "5k", "10k", "half_marathon", "marathon"] as const;
export type RunCategory = (typeof RUN_CATEGORIES)[number];

export const RUN_CATEGORY_DISTANCE_M: Record<RunCategory, number> = {
  mile: 1609.344,
  "5k": 5000,
  "10k": 10000,
  half_marathon: 21097.5,
  marathon: 42195,
};

const RIEGEL_EXPONENT_MILE = 1.08;
const RIEGEL_EXPONENT_DEFAULT = 1.06;

/**
 * Selects the Riegel exponent based on the target distance category.
 * Mile uses 1.08 (crosses VO2max/anaerobic boundary), all others use 1.06.
 */
function riegelExponentForCategory(category: RunCategory): number {
  return category === "mile" ? RIEGEL_EXPONENT_MILE : RIEGEL_EXPONENT_DEFAULT;
}

/**
 * Riegel's race-time-prediction formula: given a known performance at distance d1,
 * predicts the equivalent time at distance d2, using the exponent appropriate for
 * the target category. Used to normalize an off-distance run onto its nearest fixed
 * category's exact distance before ranking it.
 *
 * @param d1M - Known distance in meters
 * @param t1S - Known time in seconds
 * @param d2M - Target distance in meters
 * @param targetCategory - The run category we're predicting to (determines the exponent)
 * @returns Predicted time in seconds at the target distance
 */
export function riegelPredictedTimeS(
  d1M: number,
  t1S: number,
  d2M: number,
  targetCategory: RunCategory,
): number {
  const exponent = riegelExponentForCategory(targetCategory);
  return t1S * Math.pow(d2M / d1M, exponent);
}

/**
 * Finds the nearest run category by absolute distance difference.
 * The five category distances are spread geometrically enough (1.6/5/10/21/42 km)
 * that simple nearest-neighbor works without more complex heuristics.
 *
 * @param distanceM - Distance in meters
 * @returns The nearest run category
 */
export function nearestRunCategory(distanceM: number): RunCategory {
  let nearestCategory: RunCategory = RUN_CATEGORIES[0];
  let minDifference = Math.abs(distanceM - RUN_CATEGORY_DISTANCE_M[nearestCategory]);

  for (const category of RUN_CATEGORIES) {
    const categoryDistance = RUN_CATEGORY_DISTANCE_M[category];
    const difference = Math.abs(distanceM - categoryDistance);
    if (difference < minDifference) {
      minDifference = difference;
      nearestCategory = category;
    }
  }

  return nearestCategory;
}

/**
 * The rank-comparable value for a finished run: Riegel-adjusts (distanceM, durationS)
 * onto the nearest category's exact distance (using that category's own exponent) and
 * returns the category plus the resulting average speed in m/s. "Higher is better," so
 * it plugs directly into rank comparison with no inversion.
 *
 * @param distanceM - Actual distance run in meters
 * @param durationS - Actual duration in seconds
 * @returns Object with the assigned category and the Riegel-adjusted speed in m/s
 */
export function runRankValue(
  distanceM: number,
  durationS: number,
): { category: RunCategory; speedMps: number } {
  const category = nearestRunCategory(distanceM);
  const categoryDistanceM = RUN_CATEGORY_DISTANCE_M[category];

  // Predict the time this run would take at the category's exact distance
  const equivalentTimeS = riegelPredictedTimeS(distanceM, durationS, categoryDistanceM, category);

  // Speed at the category distance (m/s)
  const speedMps = categoryDistanceM / equivalentTimeS;

  return { category, speedMps };
}
