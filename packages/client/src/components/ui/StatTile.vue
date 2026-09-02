<script setup lang="ts">
/**
 * A bordered surface card showing one big value + a small label underneath. Was hand-rolled
 * four times (OverviewPage's .status-tile, WorkoutDetail's .stat, WorkoutPage's
 * finished-summary .stat — byte-identical to WorkoutDetail's — and RunsPage's .stat, which
 * inverted the value/label order) with drifted radius/gap/font-size each time. One canonical
 * look here; place several inside a CSS grid (`display:grid; grid-template-columns: repeat(N,
 * 1fr)`) in the parent to get a stat row — this component only owns one tile.
 */
/** `reward` (critique finding: every container in the app — a stat, a warning, a form panel —
 *  shared one identical flat recipe, so nothing but proximity told a plain summary tile apart
 *  from an earned one) opts a tile into the tier-tinted .panel-reward treatment instead of the
 *  flat .panel one. Only the dashboard's overall-rank tile sets it now — see `accent` below for
 *  why streak/level don't.
 *
 *  `accent` (engagement-audit-v4 Phase 2B critique fix): `.panel-reward` has no tier scope of its
 *  own — it resolves --b1/--b2/--b3 from whatever `.t-<tier>` ancestor is nearest, which in
 *  practice is always the single overall-rank tier App.vue puts on `.app-shell`. Streak and Level
 *  are different progression axes from rank, so painting them with `reward` made all three
 *  dashboard tiles render the identical color — a first-timer had no visual cue that "1 Tage
 *  Serie" and "LEHRLING I" meant different things. `accent` gives a tile its own fixed color
 *  instead, reusing the exact conventions already established for these two axes elsewhere
 *  (App.vue's .streak-chip text is --fire-hi; .level-chip's xp-amount and the XP/level .rankbar's
 *  documented fallback are --blue-hi) rather than inventing new colors. */
withDefaults(defineProps<{ value: string | number; label: string; reward?: boolean; accent?: "fire" | "blue" }>(), {
  reward: false,
});
</script>

<template>
  <div class="stat-tile" :class="{ 'panel-reward': reward, panel: !reward }">
    <b class="tnum" :class="accent && `accent-${accent}`">{{ value }}</b>
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp3);
}
.stat-tile b {
  font-size: 17px;
}
.stat-tile b.accent-fire {
  color: var(--fire-hi);
}
.stat-tile b.accent-blue {
  color: var(--blue-hi);
}
.stat-tile span {
  font-size: 11px;
  color: var(--dim);
}
</style>
