<script setup lang="ts">
/**
 * Root layout for a "not started" card-list screen — wraps a CardGrid.vue (or its empty state)
 * plus whatever "+ Neue X" / primary CTA buttons follow it. Shared by RoutineList.vue and
 * RouteList.vue so their outer alignment (left-aligned on mobile, centered at the desktop grid
 * breakpoint) and short-list vertical centering can't drift apart the way RouteList's missing
 * wrapper previously let it.
 */
</script>

<template>
  <div class="card-list-screen">
    <slot />
  </div>
</template>
