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
 * Owns the app's one `env(safe-area-inset-top, 0px)` rule for routed pages. Safe alongside
 * capacitor.config.ts's `adjustMarginsForEdgeToEdge: 'force'` (Android-only): that setting
 * reserves the notch/status-bar band as a real WebView margin, which shrinks the WebView's own
 * viewport so it no longer extends under the notch — inside that adjusted viewport
 * `env(safe-area-inset-top)` itself resolves back to 0, making this rule a no-op there. It only
 * does real work on iOS/web, where no such margin exists and the WebView still draws under the
 * notch. The same reasoning already applies to every modal duplicating this exact rule
 * (SheetModal.vue, BaseHeader.vue, etc.) without a reported double-inset issue.
 */
import { IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    title: string;
    backButton?: boolean;
    variant?: "page" | "drawer";
  }>(),
  {
    backButton: false,
    variant: "page",
  },
);

const router = useRouter();
function goBack() {
  router.back();
}
</script>

<template>
  <IonPage :class="{ 'base-page-drawer': variant === 'drawer' }">
    <IonHeader class="base-page-header">
      <IonToolbar>
        <IonButtons v-if="backButton" slot="start">
          <button class="base-page-back-btn" aria-label="Zurück" @click="goBack">
            <AppIcon name="chevron-left" :size="18" />
          </button>
        </IonButtons>
        <IonTitle>{{ title }}</IonTitle>
        <IonButtons slot="end">
          <slot name="header-actions" />
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <slot />
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Ionic's own IonPage CSS sets `z-index: 0` (with `position: absolute`) on `.ion-page` — a
   non-auto z-index on a positioned element creates a stacking context, so every routed page is
   already its own isolated stacking context at level 0, sealed off from its own descendants'
   z-index values. App.vue's mobile-only .top-hud (level ring/streak chip) is a `position: fixed`
   overlay at z-index: 5 in the *same* parent stacking context .ion-page itself sits in — so a
   z-index on the header alone (still trapped inside .ion-page's z:0 context) could never win
   against it; only raising .ion-page's own level does. Content never actually collides with
   .top-hud's band regardless (the header reserves that space in normal flow, IonContent starts
   below it), so this only changes which one paints in front where they already overlap: the
   header's real controls (backButton, header-actions). */
.ion-page {
  z-index: 6;
}
.base-page-header {
  padding-top: env(safe-area-inset-top, 0px);
}
/* Below 900px, ion-title is already hidden globally (ionic-theme.css) — the toolbar's only job
   there used to be a decorative blurred backdrop .top-hud always painted over (its
   translucency/blur was moot, nothing needed to be seen through it). Now that this toolbar
   paints *above* .top-hud (the z-index rule above), that same translucency+blur would instead
   wash out .top-hud's level-ring/streak chip behind it — stripped only at this breakpoint, only
   on this component's own toolbar, so every other IonToolbar in the app is unaffected. */
@media (max-width: 899px) {
  .base-page-header ion-toolbar {
    --background: transparent;
    --border-color: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .base-page-header ion-toolbar::after {
    content: none;
  }
}
.base-page-back-btn {
  display: grid;
  place-items: center;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  background: none;
  border: none;
  color: var(--dim);
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
