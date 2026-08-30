/**
 * Plate calculator (plan Phase 6.2): target weight -> plates per side, greedy from largest
 * to smallest. Pure function so the client can show the breakdown instantly on every stepper
 * tap with no server round-trip.
 */
export const DEFAULT_BAR_WEIGHT_KG = 20;
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface PlateBreakdown {
  barWeightKg: number;
  /** One side, heaviest first. Mirror it for the other side. */
  perSide: number[];
  /** What the greedy selection actually loads (may differ from the target if it isn't reachable). */
  achievedWeightKg: number;
  exact: boolean;
}

const EPS = 1e-6;

export function calculatePlates(
  targetWeightKg: number,
  barWeightKg: number = DEFAULT_BAR_WEIGHT_KG,
  availablePlatesKg: number[] = DEFAULT_PLATES_KG,
): PlateBreakdown {
  let remaining = Math.max(0, (targetWeightKg - barWeightKg) / 2);
  const sorted = [...availablePlatesKg].sort((a, b) => b - a);
  const perSide: number[] = [];
  for (const plate of sorted) {
    while (remaining + EPS >= plate) {
      perSide.push(plate);
      remaining -= plate;
    }
  }
  const achievedWeightKg = barWeightKg + perSide.reduce((a, b) => a + b, 0) * 2;
  return { barWeightKg, perSide, achievedWeightKg, exact: Math.abs(achievedWeightKg - targetWeightKg) < EPS };
}

/** One plate size the user owns, e.g. `{ weightKg: 2.5, count: 4 }` — "I have four 2.5kg
 *  plates". `count` is the physical plate count (both sides combined), not pairs. */
export interface PlateInventory {
  weightKg: number;
  count: number;
}

/** Integer scale for the knapsack DP below — plate weights are always a multiple of 0.01kg in
 *  practice (0.25kg increments, sometimes 1kg/2kg for smaller home-gym plates); scaling to
 *  hundredths avoids floating-point drift in the sum comparisons the DP relies on. */
const SCALE = 100;

/**
 * Inventory-aware version of calculatePlates (feature: "specify which weight plates you have...
 * showing the user how to load the barbell"). Unlike the unlimited-supply greedy algorithm
 * above, a bounded plate count breaks pure greedy — owning 4x1.25kg but no 2.5kg plate means the
 * greedy pick of "always take the biggest plate that fits" can strand weight the smaller plates
 * could have covered. This runs a 0/1 subset-sum DP over each physical plate *pair* (plates load
 * symmetrically, so only whole pairs are usable — floor(count / 2) pairs per size), maximizing
 * the achieved weight first and, among ties, minimizing how many plates get loaded (matches
 * calculatePlates' own preference for fewer, bigger plates over many small ones).
 */
export function calculatePlatesFromInventory(targetWeightKg: number, barWeightKg: number, inventory: PlateInventory[]): PlateBreakdown {
  const remaining = Math.max(0, (targetWeightKg - barWeightKg) / 2);
  const targetUnits = Math.round(remaining * SCALE);

  // Expand to one entry per available pair, largest plate size first so equal-sum ties below
  // naturally prefer bigger plates (processed — and therefore chosen — first).
  const pairs = [...inventory]
    .sort((a, b) => b.weightKg - a.weightKg)
    .flatMap((p) => Array.from({ length: Math.floor(p.count / 2) }, () => Math.round(p.weightKg * SCALE)))
    .filter((units) => units > 0 && units <= targetUnits);

  // dp[s] = fewest plates (per side) needed to reach sum s, if reachable.
  const dp = new Array<number>(targetUnits + 1).fill(Infinity);
  const parent = new Array<number>(targetUnits + 1).fill(-1); // plate units used to arrive at s
  dp[0] = 0;

  // `s` and `s - units` are always within [0, targetUnits] by the loop bounds above — non-null
  // assertions are safe here, not a real possibility of undefined.
  for (const units of pairs) {
    for (let s = targetUnits; s >= units; s--) {
      if (dp[s - units]! + 1 < dp[s]!) {
        dp[s] = dp[s - units]! + 1;
        parent[s] = units;
      }
    }
  }

  let bestSum = 0;
  for (let s = targetUnits; s >= 0; s--) {
    if (dp[s]! < Infinity) {
      bestSum = s;
      break;
    }
  }

  const perSide: number[] = [];
  let cursor = bestSum;
  while (cursor > 0 && parent[cursor]! !== -1) {
    const units = parent[cursor]!;
    perSide.push(units / SCALE);
    cursor -= units;
  }
  perSide.sort((a, b) => b - a);

  const achievedWeightKg = barWeightKg + perSide.reduce((a, b) => a + b, 0) * 2;
  return { barWeightKg, perSide, achievedWeightKg, exact: Math.abs(achievedWeightKg - targetWeightKg) < EPS };
}
