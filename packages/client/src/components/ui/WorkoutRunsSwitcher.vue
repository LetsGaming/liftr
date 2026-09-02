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
    <RouterLink to="/workout" class="wr-pill" :class="{ 'wr-active': active === 'workout' }" style="--wr-color: var(--blue)">
      Workout
    </RouterLink>
    <RouterLink to="/runs" class="wr-pill" :class="{ 'wr-active': active === 'runs' }" style="--wr-color: var(--fire)">
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
  background: var(--wr-color);
  color: var(--bg);
}
</style>
