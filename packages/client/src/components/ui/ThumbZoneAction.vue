<script setup lang="ts">
/**
 * Foundation primitive (2026-09-03 Foundation plan, Task 4) — anchors a screen's primary CTA to
 * the lower/thumb-reachable third, closing lens-3's Low-medium finding of primary CTAs stranded
 * in the top half of a tall viewport away from thumb reach (audit/plan-c-new-ui-rebuild.md §3
 * Phase 0, lens-3 §2.4).
 *
 * variant="sticky" (default): `position: sticky; bottom: ...` relative to the element's nearest
 * scrolling ancestor. Every routed page in this app renders as an Ionic <IonPage>, which scrolls
 * its own internal <ion-content> shadow-DOM container (see App.vue's .top-hud comment for the
 * measured detail) — for sticky positioning to work at all, this component must be placed INSIDE
 * that scrolling container, not as a sibling/ancestor of it. `bottom` reads
 * --bottom-chrome-h (App.vue, Task 2) so the stuck action clears the fixed mobile tab bar instead
 * of sitting underneath it; falls back to 0px on the >=900px desktop layout, where the tab bar is
 * replaced by the sidebar and doesn't need bottom clearance.
 *
 * variant="inline": no fixed/sticky positioning at all — just `margin-top: auto`, which only has
 * an effect when the caller's own immediate wrapper is `display: flex; flex-direction: column`.
 * Use this for a short, non-scrolling screen (an empty state, a single-screen confirmation) where
 * the action should settle at the bottom of the available space rather than float above scrolled
 * content.
 */
withDefaults(defineProps<{ variant?: "sticky" | "inline" }>(), { variant: "sticky" });
</script>

<template>
  <div class="thumb-zone-action" :class="variant">
    <slot />
  </div>
</template>

<style scoped>
.thumb-zone-action.inline {
  margin-top: auto;
}
.thumb-zone-action.sticky {
  position: sticky;
  bottom: calc(var(--bottom-chrome-h, 0px) + var(--sp3));
  z-index: 1;
}
</style>
