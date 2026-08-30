/**
 * Per-tier rank badge glyphs (readability pass, round 3: the badge previously used the same
 * star path for all 5 tiers — the only thing distinguishing bronze from diamond was the
 * gradient color behind it). Shared between every place a tier badge renders (RanksPage.vue,
 * RankProgress.vue, FinishSequence.vue) so they can't drift.
 *
 * All paths are 24x24 viewBox, single <path>, simple recognizable silhouettes — not pixel-
 * perfect icon-set glyphs, just visually distinct shapes per tier.
 */
export type RankTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export const TIER_BADGE_PATH: Record<RankTier, string> = {
  // single star — entry tier
  bronze: "M12 3l2 4 4 .5-3 3 .8 4L12 16l-3.8 2.5.8-4-3-3 4-.5z",
  // shield — protection/solidity
  silver: "M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5z",
  // medal on a ribbon — the reward tier
  gold: "M12 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM9.3 10.5L6 21l6-3.2 6 3.2-3.3-10.5",
  // cut gem — rarer material
  platinum: "M12 2 3 9l9 13 9-13z",
  // crown — top tier
  diamond: "M4 18h16l-1.2-8.5-3.8 3.8-3-6.3-3 6.3-3.8-3.8z",
};

/** German tier/division display labels — was hand-copied in WorkoutPage.vue, OverviewPage.vue,
 *  RankProgress.vue, and FinishSequence.vue (4 independent copies, all of which had to agree).
 *  One source of truth (engineering-principles.md: "never duplicate a value across a boundary"). */
export const TIER_LABEL_DE: Record<RankTier, string> = {
  bronze: "BRONZE",
  silver: "SILBER",
  gold: "GOLD",
  platinum: "PLATIN",
  diamond: "DIAMANT",
};

export const DIVISION_LABEL: Record<number, string> = { 3: "III", 2: "II", 1: "I" };
