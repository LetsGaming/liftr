<script setup lang="ts">
/**
 * Reusable boxed, equal-width pill sub-tab switcher. WorkoutPage.vue/RunsPage.vue's Workout↔Läufe
 * switcher (two real routes, RouterLink pills) and RanksPage.vue's Kraft↔Lauf switcher (two views
 * of one route, local-state buttons) were the same pill strip hand-duplicated twice with the same
 * CSS recipe. One tab renders as a RouterLink when it carries a `to`, otherwise as a plain button
 * that emits `update:modelValue` — so the same component covers both call shapes.
 *
 * Deliberately not the same shape as tokens.css's `.tablist-pills` (role="tablist" sub-level
 * pills, e.g. ExerciseInfoPanel.vue) — that one is visually distinct on purpose (see tokens.css's
 * own comment); this component only unifies the boxed/equal-width switcher pattern.
 */
import { RouterLink } from "vue-router";

export interface TabSwitcherTab {
  id: string;
  label: string;
  /** Route path — render this tab as a RouterLink instead of a local-toggle button. */
  to?: string;
}

defineProps<{ tabs: TabSwitcherTab[]; modelValue: string; navLabel: string }>();
defineEmits<{ "update:modelValue": [id: string] }>();
</script>

<template>
  <nav class="switcher" :aria-label="navLabel">
    <template v-for="tab in tabs" :key="tab.id">
      <RouterLink v-if="tab.to" :to="tab.to" class="switcher-pill" :class="{ active: tab.id === modelValue }">
        {{ tab.label }}
      </RouterLink>
      <button
        v-else
        type="button"
        class="switcher-pill"
        :class="{ active: tab.id === modelValue }"
        @click="$emit('update:modelValue', tab.id)"
      >
        {{ tab.label }}
      </button>
    </template>
  </nav>
</template>

<style scoped>
.switcher {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  margin-bottom: 16px;
}
.switcher-pill {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 44px meets the WCAG 2.5.5 / Apple HIG touch-target floor. Kept as min-height, not a fixed
     height, so the pill still grows for larger text settings instead of clipping. */
  min-height: 44px;
  min-width: 96px;
  text-align: center;
  padding: 8px 14px;
  border-radius: var(--r-sm);
  background: var(--surface-1);
  color: var(--dim);
  text-decoration: none;
  font-weight: 700;
  font-size: 13.5px;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.switcher-pill.active {
  /* One fixed "active" color, not destination-dependent — see git history for the previous
     --blue/--fire split this replaced. --blue is the app's established primary/interactive
     accent. */
  background: var(--blue);
  color: var(--bg);
}
</style>
