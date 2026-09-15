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
  /** Opt-in: the default slot fills the remaining viewport height instead of flowing/scrolling
   *  with the page (see .drill-in.fill-height below). For a screen whose main content is an
   *  interactive map — dragging to scroll the page would instead pan the map, trapping the
   *  gesture — not for a normal content list, which should keep scrolling normally (the default
   *  RoutineOverviewPage.vue relies on). The caller must also disable its own IonContent's
   *  scroll (`:scroll-y="false"`) for this to actually stop the page from scrolling underneath.
   *  Also folds the standalone back-button row into the title row (see .ro-header-combined) —
   *  every row not spent on chrome is a row the map below gets instead, which matters more here
   *  than on a normal scrolling drill-in. */
  fillHeight?: boolean;
}>();

const router = useRouter();

/** This drill-in screen has no nav-bar entry of its own, so it needs an explicit way back rather
 *  than relying on the app's usual "tap the tab" convention. */
function goBack() {
  router.back();
}
</script>

<template>
  <div class="drill-in" :class="{ 'fill-height': fillHeight }">
    <!-- fillHeight screens (an interactive map is the main content) fold the back button into
         the title row below instead of giving it a row of its own — see .ro-header-combined
         below for why that height matters more here than on a normal scrolling drill-in. Loading
         and not-found have no title yet to combine it with, so it stays standalone in both
         modes for those two states. -->
    <button v-if="!fillHeight || loading || notFound" class="ro-back-btn" aria-label="Zurück" @click="goBack">
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
      <div class="ro-header" :class="{ 'ro-header-combined': fillHeight }">
        <button v-if="fillHeight" class="ro-back-btn-inline" aria-label="Zurück" @click="goBack">
          <AppIcon name="chevron-left" :size="18" />
        </button>
        <h2>{{ title }}</h2>
        <slot name="header-extra" />
      </div>

      <div v-if="fillHeight" class="ro-fill-slot">
        <slot />
      </div>
      <slot v-else />
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
/* Opt-in (see the fillHeight prop doc above): fills the page instead of flowing/scrolling with
   it — the caller's IonContent must also have scroll disabled for this to matter. */
.drill-in.fill-height {
  height: 100%;
  padding-bottom: 0;
}
.ro-fill-slot {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
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
/* fillHeight only: folds the standalone back-button row into this one, buying back roughly a
   full row of height for the map below — RouteOverviewPage.vue's map is the whole reason this
   mode exists, so every row not spent on it is a row the map doesn't get. */
.ro-header-combined {
  margin-top: var(--sp1);
}
.ro-back-btn-inline {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  margin-left: calc(var(--sp2) * -1);
  background: none;
  border: none;
  color: var(--dim);
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
