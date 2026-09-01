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
 *  flat .panel one. Only the dashboard's headline status strip (streak/level/rank) sets it; a
 *  workout/run summary tile stays a plain reference number, not a reward. */
withDefaults(defineProps<{ value: string | number; label: string; reward?: boolean }>(), {
  reward: false,
});
</script>

<template>
  <div class="stat-tile" :class="{ 'panel-reward': reward, panel: !reward }">
    <b class="tnum">{{ value }}</b>
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
.stat-tile span {
  font-size: 11px;
  color: var(--dim);
}
</style>
