<script setup lang="ts">
/**
 * A lightweight, always-reachable "what does this mean?" disclosure — tap-to-reveal, not a
 * hover tooltip (this app has no hover surface) and not gated behind a one-time onboarding
 * modal that can't be reopened. Used for jargon like LP/≈/Gesamtrang/Division on both
 * RanksPage.vue and OverviewPage.vue instead of a `title` attribute (not discoverable) or a
 * second hand-rolled explainer that could drift between the two screens.
 */
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";

defineProps<{ label: string }>();
const open = ref(false);
</script>

<template>
  <button type="button" class="info-toggle" :aria-expanded="open" @click="open = !open">
    {{ label }}
    <span class="info-dot" aria-hidden="true"><AppIcon name="info" /></span>
  </button>
  <p v-if="open" class="info-body pop-in">
    <slot />
  </p>
</template>

<style scoped>
.info-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Buttons default to line-height: 1 and a tap height under 24px; this padding/line-height
     pair fixes both. */
  padding: 4px 0;
  line-height: 1.4;
  text-align: left;
  background: none;
  border: none;
  font-size: inherit;
  font-family: inherit;
  color: var(--dim);
}
.info-dot {
  color: var(--blue-hi);
  flex: none;
}
.info-body {
  /* Without a max-width this ran to ~332 chars/line inside RanksPage's wide content column;
     capped to the 45-75ch readable range. */
  max-width: 60ch;
  margin-top: var(--sp2);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--dim);
}
.info-body :deep(b) {
  color: var(--text);
}
</style>
