<script setup lang="ts">
/**
 * The hex medal — `.badge`/`.t-<tier>` (tokens.css) around the tier's SVG glyph, wrapped in
 * `.badge-wrap` for the side wings (also tokens.css — `.badge` itself has no pseudo-elements left
 * free, both are already the bevel rim and extrusion plate, so wings live one level up). Pulled
 * out of RankProgress.vue so the Ränge grid cards (RankLifterSection.vue/RankRunnerSection.vue)
 * can put it in ListCard's own #badge slot instead of nesting the whole RankProgress readout there.
 */
import { TIER_BADGE_PATH, TIER_WING_BAND, type RankTier } from "../../lib/tierIcons";

defineProps<{ tier: string }>();
</script>

<template>
  <span class="badge-wrap" :class="[`t-${tier}`, `w${TIER_WING_BAND[tier as RankTier]}`]">
    <span class="badge">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="TIER_BADGE_PATH[tier as RankTier]" /></svg>
    </span>
  </span>
</template>
