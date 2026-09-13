<script setup lang="ts">
/**
 * Shared chrome for a "drill-in screen" reached by tapping a card instead of starting
 * immediately (RoutineOverviewPage.vue, RouteOverviewPage.vue) — no nav-bar entry of its own, so
 * it needs an explicit back affordance, a not-yet-loaded skeleton, a not-found fallback, a title
 * row, and a sticky start bar pinned to the bottom of the viewport. Extracted here instead of
 * being copied verbatim between the two pages a second time.
 */
import { useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";

defineProps<{
  title: string;
  loading: boolean;
  notFound: boolean;
  /** Number of skeleton rows to show while `loading`. */
  skeletonCount?: number;
}>();

const router = useRouter();

/** This drill-in screen has no nav-bar entry of its own, so it needs an explicit way back rather
 *  than relying on the app's usual "tap the tab" convention. */
function goBack() {
  router.back();
}
</script>

<template>
  <div class="drill-in">
    <!-- Back affordance lives in the page content, not the IonToolbar: on mobile the toolbar sits
         directly underneath App.vue's fixed .top-hud status bar (different stacking contexts — a
         toolbar button there gets visually collided with the level-ring/streak chip instead of
         reliably rendered above them), the exact same reason the page title itself was relocated
         out of the toolbar. -->
    <button class="ro-back-btn" aria-label="Zurück" @click="goBack">
      <AppIcon name="chevron-left" :size="18" />
      <span>Zurück</span>
    </button>

    <template v-if="loading">
      <div v-for="i in skeletonCount ?? 2" :key="i" class="ro-skel shimmer" aria-hidden="true" />
    </template>

    <div v-else-if="notFound" class="ro-not-found panel">
      <slot name="not-found" />
    </div>

    <template v-else>
      <div class="ro-header">
        <h2>{{ title }}</h2>
        <slot name="header-extra" />
      </div>

      <slot />

      <!-- Sticky start bar pinned to the bottom of the viewport so it's reachable with zero
           scroll regardless of content height. -->
      <div class="ro-start-bar">
        <slot name="start-bar" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.ro-back-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--sp2) var(--sp2) var(--sp2) 0;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 13.5px;
  font-weight: 600;
}
.ro-back-btn svg {
  width: 18px;
  height: 18px;
}
.drill-in {
  max-width: var(--content-w-narrow);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  /* Clears the sticky start bar so the last content row is never hidden behind it. */
  padding-bottom: 88px;
}
.ro-skel {
  height: 64px;
  border-radius: var(--r-lg);
  background-color: var(--surface-2);
}
.ro-not-found {
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.ro-header {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.ro-header h2 {
  flex: 1;
  font-size: 20px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ro-start-bar {
  position: sticky;
  bottom: 0;
  padding: var(--sp3) 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  background: linear-gradient(0deg, var(--bg) 60%, transparent);
}
</style>
