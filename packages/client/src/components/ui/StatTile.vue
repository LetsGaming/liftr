<script setup lang="ts">
/**
 * A bordered surface card showing one big value + a small label underneath. Was hand-rolled
 * four times (OverviewPage's .status-tile, WorkoutDetail's .stat, WorkoutPage's
 * finished-summary .stat — byte-identical to WorkoutDetail's — and RunsPage's .stat, which
 * inverted the value/label order) with drifted radius/gap/font-size each time. One canonical
 * look here; place several inside a CSS grid (`display:grid; grid-template-columns: repeat(N,
 * 1fr)`) in the parent to get a stat row — this component only owns one tile.
 */
defineProps<{ value: string | number; label: string }>();
</script>

<template>
  <div class="stat-tile">
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
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}
.stat-tile b {
  font-size: 17px;
}
.stat-tile span {
  font-size: 11px;
  color: var(--dim);
}
</style>
