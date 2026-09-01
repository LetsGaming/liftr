/**
 * Per-tier rank badge glyphs and display labels (rank engine v2 — 9-tier ladder). Shared between
 * every place a tier badge renders (RanksPage.vue, RankProgress.vue, FinishSequence.vue) so they
 * can't drift. All paths are 24x24 viewBox, single <path>, simple recognizable silhouettes.
 */
export type RankTier =
  | "initiate" | "apprentice" | "trainee" | "athlete" | "lifter"
  | "advanced" | "elite" | "expert" | "apex";

export const TIER_BADGE_PATH: Record<RankTier, string> = {
  // single dot — just starting
  initiate: "M12 9a3 3 0 110 6 3 3 0 010-6z",
  // single star — entry tier, same star the old "bronze" used
  apprentice: "M12 3l2 4 4 .5-3 3 .8 4L12 16l-3.8 2.5.8-4-3-3 4-.5z",
  // two chevrons stacked — building momentum
  trainee: "M12 4l7 6-1.4 1.4L12 6.8 6.4 11.4 5 10zM12 12l7 6-1.4 1.4L12 14.8l-5.6 4.6L5 18z",
  // shield — solidity, same shield the old "silver" used
  athlete: "M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5z",
  // flexed-arm arc — visibly active
  lifter: "M4 20c0-6 3-9 8-9M4 20h4M8 4c4 0 6 3 6 6 0 2-1 3-2 4l4 6-3 1-4-6",
  // medal on a ribbon — same medal the old "gold" used
  advanced: "M12 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM9.3 10.5L6 21l6-3.2 6 3.2-3.3-10.5",
  // cut gem — same gem the old "platinum" used
  elite: "M12 2 3 9l9 13 9-13z",
  // laurel-ish double arc — recognized skill
  expert: "M12 4c-3 2-4 6-3 10M12 4c3 2 4 6 3 10M12 4v14",
  // crown — same crown the old "diamond" used, single top milestone
  apex: "M4 18h16l-1.2-8.5-3.8 3.8-3-6.3-3 6.3-3.8-3.8z",
};

export const TIER_LABEL_DE: Record<RankTier, string> = {
  initiate: "ANFÄNGER",
  apprentice: "LEHRLING",
  trainee: "AUSZUBILDENDER",
  athlete: "SPORTLER",
  lifter: "HEBER",
  advanced: "FORTGESCHRITTEN",
  elite: "ELITE",
  expert: "EXPERTE",
  apex: "APEX",
};

/** Roman numerals I-VI cover the widest tier (Initiate, 6 divisions); narrower tiers only ever
 *  index into the low end of this map (a 2-division tier only ever looks up 2 or 1). */
export const DIVISION_LABEL: Record<number, string> = { 6: "VI", 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I" };
