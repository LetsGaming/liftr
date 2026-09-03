<script setup lang="ts">
/**
 * Phase 2 (engagement-audit-v3): Workout and Läufe merged into one bottom-nav tab (App.vue's
 * navItems dropped /runs, 6 -> 5 items — the actual mobile-width fix, see the audit doc's
 * Decisions-already-made #3). Both routes and both page components stay exactly as they were —
 * merging their two independent state machines was explicitly ruled the riskier option — so the
 * only new surface is this small in-page switcher, dropped at the top of both WorkoutPage.vue and
 * RunsPage.vue, that navigates between /workout and /runs. `active` tells it which of the two
 * pages it's rendering inside so it doesn't need route-matching logic duplicated in both places.
 */
import { RouterLink } from "vue-router";

defineProps<{ active: "workout" | "runs" }>();
</script>

<template>
  <nav class="wr-switcher" aria-label="Workout oder Läufe">
    <RouterLink to="/workout" class="wr-pill" :class="{ 'wr-active': active === 'workout' }">
      Workout
    </RouterLink>
    <RouterLink to="/runs" class="wr-pill" :class="{ 'wr-active': active === 'runs' }">
      Läufe
    </RouterLink>
  </nav>
</template>

<style scoped>
.wr-switcher {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  margin-bottom: var(--sp4);
}
.wr-pill {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  /* min-height (audit: touch-target floor, WCAG 2.5.5 / Apple HIG 44pt) — was ~38px via padding
     alone, below the 44px floor the app already holds itself to elsewhere (.btn-close, the "Mehr"
     kebab). Kept as min-height, not a fixed height, so the pill still grows for larger text
     settings instead of clipping. */
  min-height: 44px;
  text-align: center;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  color: var(--dim);
  text-decoration: none;
  font-weight: 700;
  font-size: 13.5px;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.wr-active {
  /* Standardized to one fixed "active" color (audit decision, workplan-v1 §1.8) — previously
     borrowed --blue when Workout was selected and --fire when Läufe was selected, i.e. this one
     component's "active" state used two different meanings of "selected" depending on which
     destination was picked. --blue is the app's already-established primary/interactive accent. */
  background: var(--blue);
  color: var(--bg);
}
</style>
