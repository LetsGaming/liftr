<script setup lang="ts">
/**
 * A lightweight, always-reachable "what does this mean?" disclosure — tap-to-reveal, not a
 * hover tooltip (this app has no hover surface) and not gated behind a one-time onboarding
 * modal that can't be reopened. Originated on RanksPage.vue's LP/trust explainer (critique
 * finding: "LP"/"≈" were explained only via `title`); extracted here so OverviewPage's own
 * jargon (Gesamtrang, Division, LP in the Top-Ränge tile — same critique, different screen)
 * gets the identical mechanism instead of a second hand-rolled copy that can drift.
 */
import { ref } from "vue";

defineProps<{ label: string }>();
const open = ref(false);
</script>

<template>
  <button type="button" class="info-toggle" :aria-expanded="open" @click="open = !open">
    {{ label }}
    <span class="info-dot" aria-hidden="true">ⓘ</span>
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
  /* Audit finding: inherited the button UA-default line-height (1.0, below the 1.3 craft
     floor) and a sub-24px tap height — both fixed here with one padding/line-height pair. */
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
  /* Audit finding: no measure constraint at all — live-measured at 332 chars/line inside
     RanksPage's wide content column. Capped to the 45-75ch craft-floor range. */
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
