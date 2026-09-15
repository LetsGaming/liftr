<script setup lang="ts">
/**
 * The hex medal — `.badge`/`.t-<tier>` (tokens.css) around the tier's SVG glyph. Pulled out of
 * RankProgress.vue so the Ränge grid cards (RankLifterSection.vue/RankRunnerSection.vue) can put
 * it in ListCard's own #badge slot instead of nesting the whole RankProgress readout there.
 */
import { TIER_BADGE_PATH, type RankTier } from "../../lib/tierIcons";

defineProps<{ tier: string }>();
</script>

<template>
  <span class="badge" :class="`t-${tier}`">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="TIER_BADGE_PATH[tier as RankTier]" /></svg>
  </span>
</template>
