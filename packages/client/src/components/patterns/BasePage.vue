<script setup lang="ts">
/**
 * Shared shell for every routed page — replaces the hand-copied
 * IonPage > IonHeader > IonToolbar > IonTitle + IonContent skeleton every page used to write on
 * its own (see ionic-theme.css's ion-toolbar comment).
 *
 * `variant: 'drawer'` reuses SheetModal.vue's own `desktopVariant="drawer"` CSS values (right-
 * aligned, fixed width, left border, square corners, ≥900px only) for a routed page that plays
 * the same "reference panel beside the page behind it" role a modal drawer used to.
 *
 * `subheader` slot: optional, sits between the toolbar and the scrolling `IonContent` as a
 * normal (non-scrolling) flex child of `IonPage` — a tab strip or similar control belt that must
 * stay visible while the page content scrolls beneath it, without needing `position: sticky`
 * inside the scroll container. Omit it and nothing renders here at all.
 *
 * `scrollY: false` disables IonContent's own scroll gesture — for a page whose default-slot
 * content is a fill-height interactive map (RouteOverviewPage.vue): without this, dragging the
 * map can be captured by the page's own scroll gesture recognizer instead of the map's, even
 * though the map's flex layout already fills the viewport and has nothing to scroll to.
 *
 * Owns the app's one `env(safe-area-inset-top, 0px)` rule for routed pages. Safe alongside
 * capacitor.config.ts's `adjustMarginsForEdgeToEdge: 'force'` (Android-only): that setting
 * reserves the notch/status-bar band as a real WebView margin, which shrinks the WebView's own
 * viewport so it no longer extends under the notch — inside that adjusted viewport
 * `env(safe-area-inset-top)` itself resolves back to 0, making this rule a no-op there. It only
 * does real work on iOS/web, where no such margin exists and the WebView still draws under the
 * notch. The same reasoning already applies to every modal duplicating this exact rule
 * (SheetModal.vue, BaseHeader.vue, etc.) without a reported double-inset issue.
 */
import { IonContent, IonPage } from "@ionic/vue";
import { useRouter } from "vue-router";
import BaseHeader from "./BaseHeader.vue";

withDefaults(
  defineProps<{
    title: string;
    backButton?: boolean;
    variant?: "page" | "drawer";
    scrollY?: boolean;
  }>(),
  {
    backButton: false,
    variant: "page",
    scrollY: true,
  },
);

const router = useRouter();
function goBack() {
  router.back();
}
</script>

<template>
  <IonPage :class="{ 'base-page-drawer': variant === 'drawer' }">
    <BaseHeader :title="title" :back-button="backButton" @back-button-click="goBack">
      <template #header-actions><slot name="header-actions" /></template>
    </BaseHeader>
    <div v-if="$slots.subheader" class="base-page-subheader">
      <slot name="subheader" />
    </div>
    <IonContent class="ion-padding" :scroll-y="scrollY">
      <slot />
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Ionic's own IonPage CSS forces `.ion-page` into its own stacking context two ways at once:
   `position: absolute` + `z-index: 0`, AND `contain: layout size style` — the latter alone
   already creates a stacking context regardless of z-index (per spec, `contain: layout`/
   `content`/`paint`/`strict` isolates an element the same way `isolation: isolate` does). That
   second one matters: it means a descendant's z-index (e.g. giving `.base-page-header` its own
   z-index, or even overriding `.ion-page`'s own z-index to `auto` to try to remove *that*
   stacking context) can never let the header escape and out-rank a sibling of `.ion-page` — the
   `contain` alone keeps it sealed in regardless. Confirmed by testing exactly that: with
   `.ion-page { z-index: auto }` and the header elevated instead, `elementFromPoint` at the back
   button's own coordinates still hit App.vue's mobile-only .top-hud (level-ring/streak chip,
   `position: fixed`, `z-index: 5`) sitting in front of it, not the button.

   So the only place this can be fixed is by moving `.ion-page`'s own (necessarily whole-page)
   stacking level *and* keeping every other fixed overlay it needs to stay under, under it too.
   `.ion-page` here is raised to 6, clearing .top-hud (5) so the header's real controls
   (backButton, header-actions) become reachable — but .top-hud isn't the only fixed overlay in
   that same .app-shell-level context: App.vue's mobile tab bar (.bottom-chrome) is also a
   sibling, at z-index: 1. Since .ion-page's whole subtree (including IonContent's full-height
   scroll container, which spatially spans the tab bar's band too, not just the header's) now
   sits at 6, it would also clear bottom-chrome's 1, breaking tab-bar tap-through — so
   .bottom-chrome's own z-index is bumped in App.vue (see its comment there) to stay above
   whatever `.ion-page` is set to here, keeping the tab bar itself in front regardless. */
.ion-page {
  z-index: 6;
}
/* Non-scrolling flex sibling of ion-content (not `position: sticky` inside it) — see the
   `subheader` slot's own doc comment above. Horizontal padding matches ion-content's own
   `.ion-padding` (16px == --sp4) so subheader content lines up with the page content below it. */
.base-page-subheader {
  padding: 0 var(--sp4) var(--sp3);
}
/* Lifted from SheetModal.vue's `.sheet-modal.drawer-modal::part(content)` desktop rule — same
   right-aligned/fixed-width/left-border/square-corner treatment, applied to the page's own
   already-absolute (inset: 0) IonPage box instead of a modal's shadow-DOM part. */
@media (min-width: 900px) {
  .base-page-drawer {
    left: auto;
    width: min(480px, 100%);
    border-left: 1px solid var(--line-2);
  }
}
</style>
