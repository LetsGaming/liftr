/**
 * Default anchor standards (plan Phase 2.2). These seed the `standards` table on ingest and
 * are the concrete answer to audit §7's open "rank tiers" / "synthetic-standard method"
 * questions. Tunable without code changes where possible — see OPL_POPULATION_SHIFT and the
 * per-exercise `ratio` in tools/catalog/curated.yaml for the derived/synthetic tiers.
 */
import { DIVISIONS, TIERS, type StandardThreshold } from "./tiers.js";

/**
 * OpenPowerlifting is a competitive population and reads strong (audit §4). Shift percentile
 * mapping down so a recreational lifter's e1RM lands mid-Silver rather than Bronze. Single
 * tunable constant — recalibrate here, not scattered through the codebase.
 */
export const OPL_POPULATION_SHIFT = 0.75;

/** tier -> division -> ratio multiplier, expressed as load_ratio (e1RM / bodyweight). */
type RatioTable = Record<(typeof TIERS)[number], number>;

function expand(slug: string, byTier: RatioTable, trust: StandardThreshold["trust"]): StandardThreshold[] {
  // Each tier's ratio is treated as division III's threshold (the entry point); II and I step
  // up linearly to the next tier's entry point, giving 3 evenly-spaced boundaries per tier.
  const tiers = TIERS.map((t) => byTier[t]);
  const out: StandardThreshold[] = [];
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!;
    const cur = tiers[i]!;
    const next = tiers[i + 1] ?? cur * 1.2; // diamond has no "next" anchor; extrapolate
    const span = next - cur;
    // DIVISIONS is [3, 2, 1] (III -> II -> I), already weakest-to-strongest — iterate as-is so
    // division III gets the tier's entry threshold and division I gets the highest (previously
    // this reversed the array and inverted every tier's division ordering).
    DIVISIONS.forEach((division, di) => {
      out.push({ tier, division, threshold: cur + (span * di) / DIVISIONS.length, trust });
    });
  }
  return out;
}

/** Anchor lifts with real external standards (OPL, shifted; ExRx for OHP/row). Tier A. */
export const ANCHOR_STANDARDS: Record<string, StandardThreshold[]> = {
  "back-squat": expand(
    "back-squat",
    { bronze: 0.75, silver: 1.25, gold: 1.75, platinum: 2.25, diamond: 2.75 },
    "real",
  ),
  "bench-press": expand(
    "bench-press",
    { bronze: 0.5, silver: 0.9, gold: 1.3, platinum: 1.75, diamond: 2.1 },
    "real",
  ),
  deadlift: expand(
    "deadlift",
    { bronze: 1.0, silver: 1.5, gold: 2.1, platinum: 2.6, diamond: 3.1 },
    "real",
  ),
  "overhead-press": expand(
    "overhead-press",
    { bronze: 0.35, silver: 0.55, gold: 0.8, platinum: 1.05, diamond: 1.3 },
    "real",
  ),
  "barbell-row": expand(
    "barbell-row",
    { bronze: 0.5, silver: 0.8, gold: 1.1, platinum: 1.45, diamond: 1.75 },
    "real",
  ),
};

/** Rep-based (bodyweight, metric: 'reps') default norms — audit §7's explicit open question. */
export const REP_STANDARDS: Record<string, StandardThreshold[]> = {
  pushup: [
    { tier: "bronze", division: 3, threshold: 5, trust: "real" },
    { tier: "silver", division: 3, threshold: 15, trust: "real" },
    { tier: "gold", division: 3, threshold: 30, trust: "real" },
    { tier: "platinum", division: 3, threshold: 50, trust: "real" },
    { tier: "diamond", division: 3, threshold: 75, trust: "real" },
  ],
  pullup: [
    { tier: "bronze", division: 3, threshold: 1, trust: "real" },
    { tier: "silver", division: 3, threshold: 5, trust: "real" },
    { tier: "gold", division: 3, threshold: 10, trust: "real" },
    { tier: "platinum", division: 3, threshold: 16, trust: "real" },
    { tier: "diamond", division: 3, threshold: 22, trust: "real" },
  ],
  chinup: [
    { tier: "bronze", division: 3, threshold: 1, trust: "real" },
    { tier: "silver", division: 3, threshold: 6, trust: "real" },
    { tier: "gold", division: 3, threshold: 12, trust: "real" },
    { tier: "platinum", division: 3, threshold: 18, trust: "real" },
    { tier: "diamond", division: 3, threshold: 25, trust: "real" },
  ],
  dip: [
    { tier: "bronze", division: 3, threshold: 3, trust: "real" },
    { tier: "silver", division: 3, threshold: 10, trust: "real" },
    { tier: "gold", division: 3, threshold: 20, trust: "real" },
    { tier: "platinum", division: 3, threshold: 32, trust: "real" },
    { tier: "diamond", division: 3, threshold: 45, trust: "real" },
  ],
};

/**
 * Derive a Tier B/C exercise's thresholds from its anchor's thresholds x ratio (audit §7's
 * "synthetic-standard method"). `trust` downgrades to 'derived' or 'synthetic' regardless of
 * the anchor's own trust — a derived exercise is never more trustworthy than its derivation.
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
 * Sourcing (QUAL-04 — the app's onboarding asks for `sex` and claims it shapes rank calculation;
 * before this it was collected and never read):
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
