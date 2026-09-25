/**
 * Per-tier rank display labels (rank engine v2 — 9-tier ladder). Shared between every place a
 * tier badge renders (RanksPage.vue, RankProgress.vue, FinishSequence.vue) so they can't drift.
 *
 * The glyph/wing-band data that used to live here (TIER_BADGE_PATH, TIER_WING_BAND) was superseded
 * by the "Orbit" emblem redesign — geometry now lives in lib/tierEmblem.ts, colors in
 * lib/tierPalette.ts.
 */
import { t } from "../i18n";

export type RankTier =
  | "initiate" | "apprentice" | "trainee" | "athlete" | "lifter"
  | "advanced" | "elite" | "expert" | "apex";

/** Keys into `tiers.*` (i18n.ts's t()), resolved at the point of use by tierLabel() below so a
 *  locale switch is reflected wherever it's read next. "trainee"/"advanced" resolve to the
 *  everyday German short forms "AZUBI"/"GEÜBT" (see de.yaml's `tiers` section) — the two longest
 *  entries here by a wide margin, and needed to fit next to a tier badge on the Kraft grid's
 *  two-up phone cards (rank-card.css) without wrapping mid-word. */
const TIER_LABEL_KEY: Record<RankTier, string> = {
  initiate: "tiers.initiate",
  apprentice: "tiers.apprentice",
  trainee: "tiers.trainee",
  athlete: "tiers.athlete",
  lifter: "tiers.lifter",
  advanced: "tiers.advanced",
  elite: "tiers.elite",
  expert: "tiers.expert",
  apex: "tiers.apex",
};

/** Falls back to the tier string itself for anything outside RankTier's vocabulary — callers
 *  often cast an untyped `tier` field (API responses, test fixtures) to RankTier, and indexing
 *  the old plain TIER_LABEL_DE record on an unrecognized value silently returned undefined
 *  rather than throwing; t() throws on an undefined key, so this preserves that non-crashing
 *  behavior. */
export function tierLabel(tier: RankTier): string {
  const key = TIER_LABEL_KEY[tier];
  return key ? t(key) : tier;
}

/** Roman numerals I-VI cover the widest tier (Initiate, 6 divisions); narrower tiers only ever
 *  index into the low end of this map (a 2-division tier only ever looks up 2 or 1). */
export const DIVISION_LABEL: Record<number, string> = { 6: "VI", 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I" };
