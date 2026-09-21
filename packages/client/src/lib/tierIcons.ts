/**
 * Per-tier rank display labels (rank engine v2 — 9-tier ladder). Shared between every place a
 * tier badge renders (RanksPage.vue, RankProgress.vue, FinishSequence.vue) so they can't drift.
 *
 * The glyph/wing-band data that used to live here (TIER_BADGE_PATH, TIER_WING_BAND) was superseded
 * by the "Orbit" emblem redesign — geometry now lives in lib/tierEmblem.ts, colors in
 * lib/tierPalette.ts.
 */
export type RankTier =
  | "initiate" | "apprentice" | "trainee" | "athlete" | "lifter"
  | "advanced" | "elite" | "expert" | "apex";

/** "trainee"/"advanced" use "AZUBI"/"GEÜBT" — the everyday German short forms of
 *  "Auszubildender"/"Fortgeschritten" — rather than the full words: at 14-15 characters those
 *  were the two longest entries here by a wide margin, and didn't fit next to a tier badge on
 *  the Kraft grid's two-up phone cards (rank-card.css) without wrapping mid-word. */
export const TIER_LABEL_DE: Record<RankTier, string> = {
  initiate: "ANFÄNGER",
  apprentice: "LEHRLING",
  trainee: "AZUBI",
  athlete: "SPORTLER",
  lifter: "HEBER",
  advanced: "GEÜBT",
  elite: "ELITE",
  expert: "EXPERTE",
  apex: "APEX",
};

/** Roman numerals I-VI cover the widest tier (Initiate, 6 divisions); narrower tiers only ever
 *  index into the low end of this map (a 2-division tier only ever looks up 2 or 1). */
export const DIVISION_LABEL: Record<number, string> = { 6: "VI", 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I" };
