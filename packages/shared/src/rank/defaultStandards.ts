/**
 * Default anchor standards. These seed the `standards` table on ingest. Tunable without code
 * changes where possible — see OPL_POPULATION_SHIFT and the per-exercise `ratio` in
 * tools/catalog/curated.yaml for the derived/synthetic tiers.
 */
import { TIER_DIVISION_COUNT, TIERS, type StandardThreshold, type Tier } from "./tiers.js";

/**
 * OpenPowerlifting is a competitive population and reads strong. Shift percentile mapping down
 * so a recreational lifter's e1RM lands mid-Silver rather than Bronze. Single tunable constant —
 * recalibrate here, not scattered through the codebase.
 */
export const OPL_POPULATION_SHIFT = 0.75;

/**
 * The old system had 5 hand-tuned anchor ratios (Bronze..Diamond); the new 9-tier ladder needs 9.
 * Rather than hand-typing 9 new floats per exercise (error-prone, and this project's own
 * precedent — OPL_POPULATION_SHIFT — is "one tunable constant, recalibrate here in code, not
 * scattered data"), the 4 even tiers (Apprentice/Athlete/Advanced/Expert) keep the old 5 numbers
 * exactly, the 3 interior new tiers (Trainee/Lifter/Elite) sit at the geometric mean of their
 * neighbors, and the two ends (Initiate, Apex) extrapolate one step beyond their nearest anchor
 * using that anchor's own ratio to its newly-interpolated neighbor — the same rule in both
 * directions, so the curve is self-consistent rather than treating the two ends differently.
 *
 * Deliberately takes the raw (unwidened) 5-anchor input — `widenAnchorSpread` below is a separate,
 * composable preprocessing step applied at each call site, so this function's own well-tested
 * contract ("the 4 even-indexed tiers exactly equal the old 5 anchors") stays exactly what it was.
 */
export function interpolateNineTierAnchors(
  old5: [number, number, number, number, number],
): Record<Tier, number> {
  const [bronze, silver, gold, platinum] = old5;
  const trainee = Math.sqrt(bronze * silver);
  const lifter = Math.sqrt(silver * gold);
  const elite = Math.sqrt(gold * platinum);
  const initiate = bronze * (bronze / trainee);
  const apex = platinum * (platinum / elite);
  return {
    initiate,
    apprentice: bronze,
    trainee,
    athlete: silver,
    lifter,
    advanced: gold,
    elite,
    expert: platinum,
    apex,
  };
}

/**
 * Widens the gap between each anchor tier and the entry (bronze/apprentice) tier, around that same
 * fixed entry point — the "tier curve reshaping" half of the hammer-curl-reaches-Athlete-on-a-
 * first-set fix (see `TIER_DIVISION_COUNT`'s doc comment for the other half). Bronze itself never
 * moves — it's already a real, sourced entry-level standard — but
 * every tier above it is pushed proportionally further away, on a log scale so the widening
 * compounds smoothly rather than distorting the low tiers vs. the high ones asymmetrically. The
 * higher a tier already sits above bronze, the more real strength this adds to reach it: at
 * `TIER_SPREAD_WIDENING = 1.25`, Athlete (a ~1.67x-of-bronze ratio in a typical anchor) ends up
 * needing roughly 13% more than before, while Expert (a ~3x-of-bronze ratio) ends up needing
 * roughly 32% more — deliberately steeper further up the ladder, matching "climbing should get
 * harder, not just uniformly harder."
 *
 * Applied to the raw 5-anchor tuple BEFORE `interpolateNineTierAnchors`, not after — widening the
 * already-interpolated 9-tier output would also stretch `expand()`'s within-tier division spacing
 * in a way this function isn't trying to control; widening only the 5 real anchor points and then
 * interpolating/expanding as normal keeps those two concerns separate.
 */
export const TIER_SPREAD_WIDENING = 1.25;

export function widenAnchorSpread(
  old5: [number, number, number, number, number],
): [number, number, number, number, number] {
  const [bronze, silver, gold, platinum, diamond] = old5;
  const widen = (v: number) => bronze * Math.pow(v / bronze, TIER_SPREAD_WIDENING);
  return [bronze, widen(silver), widen(gold), widen(platinum), diamond];
}

/** Divide each tier's ratio span into TIER_DIVISION_COUNT[tier] evenly-spaced thresholds. */
function expand(byTier: Record<Tier, number>, trust: StandardThreshold["trust"]): StandardThreshold[] {
  const out: StandardThreshold[] = [];
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!;
    const cur = byTier[tier];
    // apex has no "next" anchor; this fallback only fires if TIER_DIVISION_COUNT.apex is ever
    // raised above 1 (currently apex has exactly 1 division, so `d` never exceeds 0 and this
    // extrapolated `span` doesn't feed any emitted threshold) — defensive, not load-bearing today.
    const next = byTier[TIERS[i + 1]!] ?? cur * 1.15;
    const span = next - cur;
    const divisionCount = TIER_DIVISION_COUNT[tier];
    // division values run divisionCount (weakest) down to 1 (strongest) within the tier
    for (let d = 0; d < divisionCount; d++) {
      out.push({ tier, division: divisionCount - d, threshold: cur + (span * d) / divisionCount, trust });
    }
  }
  return out;
}

/** Anchor lifts with real external standards (OPL, shifted; ExRx for OHP/row). Tier A. Each
 *  5-anchor tuple passes through `widenAnchorSpread` before interpolation — see that function's
 *  doc comment for what it does and why. */
export const ANCHOR_STANDARDS: Record<string, StandardThreshold[]> = {
  "back-squat": expand(interpolateNineTierAnchors(widenAnchorSpread([0.75, 1.25, 1.75, 2.25, 2.75])), "real"),
  "bench-press": expand(interpolateNineTierAnchors(widenAnchorSpread([0.5, 0.9, 1.3, 1.75, 2.1])), "real"),
  deadlift: expand(interpolateNineTierAnchors(widenAnchorSpread([1.0, 1.5, 2.1, 2.6, 3.1])), "real"),
  "overhead-press": expand(interpolateNineTierAnchors(widenAnchorSpread([0.35, 0.55, 0.8, 1.05, 1.3])), "real"),
  "barbell-row": expand(interpolateNineTierAnchors(widenAnchorSpread([0.5, 0.8, 1.1, 1.45, 1.75])), "real"),
};

/** Sibling to interpolateNineTierAnchors: flattens rep-based (single-division-per-tier) tables. */
function expandRepStandard(old5: [number, number, number, number, number]): StandardThreshold[] {
  const ratios = interpolateNineTierAnchors(old5);
  return TIERS.map((tier) => ({
    tier,
    // the anchor ratio is the tier's entry threshold (per expand()'s "cur" semantics), i.e. the
    // weakest division for that tier — TIER_DIVISION_COUNT[tier], not the strongest (1).
    division: TIER_DIVISION_COUNT[tier],
    threshold: Math.round(ratios[tier]),
    trust: "real" as const,
  }));
}

/** Rep-based (bodyweight, metric: 'reps') default norms. Also widened per `widenAnchorSpread`'s
 *  doc comment, for the same "every exercise" reason. */
export const REP_STANDARDS: Record<string, StandardThreshold[]> = {
  pushup: expandRepStandard(widenAnchorSpread([5, 15, 30, 50, 75])),
  pullup: expandRepStandard(widenAnchorSpread([1, 5, 10, 16, 22])),
  chinup: expandRepStandard(widenAnchorSpread([1, 6, 12, 18, 25])),
  dip: expandRepStandard(widenAnchorSpread([3, 10, 20, 32, 45])),
};

/**
 * Derive a Tier B/C exercise's thresholds from its anchor's thresholds x ratio. `trust`
 * downgrades to 'derived' or 'synthetic' regardless of the anchor's own trust — a derived
 * exercise is never more trustworthy than its derivation.
 */
export function deriveStandards(
  anchorThresholds: StandardThreshold[],
  ratio: number,
  trust: "derived" | "synthetic",
): StandardThreshold[] {
  return anchorThresholds.map((t) => ({ ...t, threshold: t.threshold * ratio, trust }));
}

/**
 * Male-to-female relative-strength ratio at a matched percentile of trained/competitive lifters,
 * applied to each anchor lift's ANCHOR_STANDARDS (implicitly male-calibrated — OPL competition
 * data skews heavily male and was never split by sex) to derive FEMALE_ANCHOR_STANDARDS below.
 * Same trust discipline as deriveStandards() above: a number backed by a specific, citable
 * source is "derived", never "real" — only ANCHOR_STANDARDS's own figures keep "real".
 *
 * Sourcing (the app's onboarding asks for `sex` and claims it shapes rank calculation; before
 * this it was collected and never read):
 * - squat/bench/deadlift: a peer-reviewed analysis of 809,986 competition entries from
 *   drug-tested, unequipped powerlifting meets (571,650 male / 238,336 female) — male:female
 *   ratio at the 90th percentile for lifters aged 18-35. Nuttall et al., "Normative data for the
 *   squat, bench press and deadlift exercises in powerlifting", J Sci Med Sport (2024),
 *   https://doi.org/10.1016/j.jsams.2024.06.010 — the same OpenPowerlifting-scale population
 *   ANCHOR_STANDARDS is already calibrated against.
 * - overhead-press: no single large study found; aggregated strength-standards sources
 *   (StrengthLog, Gravitus, 1RMCalculator) converge on ~0.65-0.8xBW (men) vs ~0.4-0.55xBW
 *   (women) at a comparable trained level — real but weaker sourcing, so its thresholds are
 *   capped at "derived" and flagged in NO_SOURCED_RATIO below for visibility.
 * - barbell-row: no dedicated source either direction — reuses the bench-press ratio as the
 *   closest available analogy (another upper-body compound). Marked "synthetic", the same
 *   treatment an un-sourced Tier B/C ratio already gets elsewhere in this file.
 */
export const MALE_FEMALE_RATIO: Record<string, number> = {
  "back-squat": 1.25,
  "bench-press": 1.44,
  deadlift: 1.22,
  "overhead-press": 1.5,
  "barbell-row": 1.44, // no dedicated source — reuses bench-press's ratio, see doc above
};

/** Anchors whose ratio isn't backed by a large, direct study — their derived female thresholds
 *  stay at "synthetic" even though a ratio number exists, per this file's trust discipline. */
const RATIO_NOT_DIRECTLY_SOURCED = new Set(["barbell-row"]);

/** Female-calibrated counterpart to ANCHOR_STANDARDS, derived via MALE_FEMALE_RATIO. An anchor
 *  with no known ratio falls back to the male thresholds unchanged rather than guessing one —
 *  the honest "we don't have this yet" default, not a silent assumption either direction. */
export const FEMALE_ANCHOR_STANDARDS: Record<string, StandardThreshold[]> = Object.fromEntries(
  Object.entries(ANCHOR_STANDARDS).map(([slug, thresholds]) => {
    const ratio = MALE_FEMALE_RATIO[slug];
    if (!ratio) return [slug, thresholds];
    const trust = RATIO_NOT_DIRECTLY_SOURCED.has(slug) ? "synthetic" : "derived";
    return [slug, deriveStandards(thresholds, 1 / ratio, trust)];
  }),
);
