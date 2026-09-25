<script setup lang="ts">
/**
 * A routed page's header: a real `<IonHeader>`/`<IonToolbar>`/`<IonTitle>`, required so it
 * participates in Ionic's own toolbar chrome (desktop border/shadow) and so the
 * `ion-title`/`.base-page-header` global selectors in ionic-theme.css (mobile title show/hide)
 * keep matching real elements. Static title, optional back button, optional `header-actions` slot
 * for trailing buttons. Used by BasePage.vue.
 *
 * Split out of a single BaseHeader.vue that took a `variant: "page" | "wizard"` prop and branched
 * its whole template/props/emits on it — this and WizardHeader.vue shared no DOM, no props beyond
 * the title itself, and no emits (this one emits `back-button-click`, WizardHeader emits `close`),
 * so they were two components glued together by a prop rather than one.
 *
 * Root element class names stay namespaced (`base-page-header*`) for the same reason the merged
 * file's own comment warned about: Vue applies a PARENT component's scoped styles to a CHILD
 * component's root element too. A previous split into this same shape once left RoutineWizard.vue/
 * RouteWizard.vue each carrying their own leftover `.wizard-head`/`.name-input`/`.close-btn` rules
 * from before WizardHeader existed, which leaked onto its root and silently clobbered the
 * safe-area padding-top — that's why the two were merged into one file for a while. Splitting
 * again is safe now because neither wizard file has a colliding local rule left (verified before
 * this split; RoutineWizard.vue has no `<style>` block at all, RouteWizard.vue's uses distinct
 * `.wizard-map`/`.wizard-foot`/`.stats`/`.loop-toggle` names) — but if you ever add a page-header
 * lookalike rule to a caller's own scoped styles, give it a name that can't collide with this
 * file's, not a generic one.
 */
import { IonButtons, IonHeader, IonTitle, IonToolbar } from "@ionic/vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../base/AppIcon.vue";

withDefaults(defineProps<{ title: string; backButton?: boolean }>(), { backButton: false });

const emit = defineEmits<{ "back-button-click": [] }>();
const { t } = useI18n();
</script>

<template>
  <IonHeader class="base-header base-page-header">
    <IonToolbar>
      <IonButtons v-if="backButton" slot="start">
        <button class="base-page-back-btn" :aria-label="t('patterns.pageHeader.backAriaLabel')" @click="emit('back-button-click')">
          <AppIcon name="chevron-left" :size="18" />
        </button>
      </IonButtons>
      <IonTitle>{{ title }}</IonTitle>
      <IonButtons slot="end">
        <slot name="header-actions" />
      </IonButtons>
    </IonToolbar>
  </IonHeader>
</template>

<style scoped>
.base-page-header {
  padding-top: env(safe-area-inset-top, 0px);
}
/* Below 900px, ion-title is already hidden globally (ionic-theme.css) — the toolbar's only job
   there used to be a decorative blurred backdrop App.vue's mobile .top-hud always painted over
   (its translucency/blur was moot, nothing needed to be seen through it). BasePage.vue paints
   this toolbar *above* .top-hud (see its own z-index comment), so that same translucency+blur
   would instead wash out .top-hud's level-ring/streak chip behind it — stripped only at this
   breakpoint, only on this variant's own toolbar, so every other IonToolbar in the app is
   unaffected. */
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
</style>
