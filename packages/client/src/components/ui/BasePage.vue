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
.base-page-header {
  padding-top: env(safe-area-inset-top, 0px);
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
