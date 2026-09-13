<script setup lang="ts">
/**
 * Grid wrapper for a list of ListCard.vue items — RoutineList.vue's routine cards and
 * RouteList.vue's route cards both render their v-for'd ListCard instances inside this, so the
 * two grids share one column/gap/breakpoint recipe (styles/list-card.css's `.card-grid`) instead
 * of each declaring its own and drifting apart.
 */
</script>

<template>
  <div class="card-grid">
    <slot />
  </div>
</template>
