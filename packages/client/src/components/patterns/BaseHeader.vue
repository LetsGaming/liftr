<script setup lang="ts">
/**
 * Shared base for every screen header in the app. Two variants, chosen by `variant`, because a
 * routed page's header and a full-bleed wizard's header are genuinely different DOM, not just
 * different props on the same markup:
 *   - "page" (default): a real `<IonHeader>`/`<IonToolbar>`/`<IonTitle>` — required so this
 *     header participates in Ionic's own toolbar chrome (desktop border/shadow) and so the
 *     `ion-title`/`.base-page-header` global selectors in ionic-theme.css (mobile title
 *     show/hide) keep matching real elements. Static title, optional back button, optional
 *     `header-actions` slot for trailing buttons. Used by BasePage.vue.
 *   - "wizard": a plain custom `<header>`, styled to this app's own tokens rather than Ionic's
 *     toolbar defaults — an editable title input, a close button (with an optional "confirm
 *     discard" state), and an optional step indicator row. Used by RoutineWizard.vue/
 *     RouteWizard.vue inside SheetModal's `#header` slot, which renders whatever it's given as a
 *     plain flex child (see SheetModal.vue) — no Ionic toolbar wrapper wanted there.
 *
 * Root element class names are deliberately namespaced (`base-header*`, not something generic
 * like `wizard-head`) — Vue applies a PARENT component's scoped styles to a CHILD component's
 * root element too (by design, so a parent can adjust a child's outer layout). A previous version
 * of the wizard variant was its own component (WizardHeader) with generic class names, and
 * RoutineWizard.vue/RouteWizard.vue each still carried their own leftover
 * `.wizard-head`/`.name-input`/`.close-btn` rules from before that component existed; those
 * leaked onto its root element and silently clobbered the safe-area padding-top below with a
 * plain `padding: ...` shorthand — a real bug (the header sat under the notch despite this file's
 * own CSS being "correct"). Keep these class names distinctive enough that no caller's own
 * leftover styles are likely to collide with them again.
 */
import { IonButtons, IonHeader, IonTitle, IonToolbar } from "@ionic/vue";
import AppIcon from "../base/AppIcon.vue";

withDefaults(
  defineProps<{
    variant?: "page" | "wizard";
    backButton?: boolean;
    titlePlaceholder?: string;
    isConfirmingClose?: boolean;
    steps?: Array<{ key: string; label: string }>;
    activeStepKey?: string;
  }>(),
  {
    variant: "page",
    backButton: false,
  },
);

const emit = defineEmits<{
  close: [];
  "back-button-click": [];
}>();

const title = defineModel<string>("title", { default: "" });
</script>

<template>
  <IonHeader v-if="variant === 'page'" class="base-header base-page-header">
    <IonToolbar>
      <IonButtons v-if="backButton" slot="start">
        <button class="base-page-back-btn" aria-label="Zurück" @click="emit('back-button-click')">
          <AppIcon name="chevron-left" :size="18" />
        </button>
      </IonButtons>
      <IonTitle>{{ title }}</IonTitle>
      <IonButtons slot="end">
        <slot name="header-actions" />
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <header v-else class="base-header base-header-wizard">
    <div class="base-header-top">
      <input
        v-model="title"
        class="base-header-name-input"
        type="text"
        :placeholder="titlePlaceholder ?? 'Name der Routine'"
        :aria-label="titlePlaceholder ?? 'Name der Routine'"
      />
      <button
        class="btn-close base-header-close-btn"
        :class="{ confirming: isConfirmingClose }"
        aria-label="Schließen"
        @click="emit('close')"
      >
        <template v-if="isConfirmingClose">Verwerfen?</template>
        <AppIcon v-else name="close" />
      </button>
    </div>
    <div v-if="steps && steps.length > 0" class="base-header-steps">
      <span
        v-for="step in steps"
        :key="step.key"
        :class="{ active: step.key === activeStepKey }"
      >
        {{ step.label }}
      </span>
    </div>
  </header>
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

.base-header-wizard {
  flex: none;
  padding: var(--sp3) var(--sp4);
  /* Full-bleed modal header (see SheetModal.vue) — without this, the title input and close
     button sit under the notch/status bar on Android. See this file's header comment for why a
     caller must never redeclare `.base-header`/its descendants in its own <style scoped> block. */
  padding-top: calc(var(--sp3) + env(safe-area-inset-top, 0px));
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  background: var(--bg);
}

.base-header-top {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}

.base-header-name-input {
  flex: 1;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}

.base-header-close-btn {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.base-header-close-btn.confirming {
  width: auto;
  padding: 0 12px;
  border-radius: var(--r-md);
  background: var(--danger-lo);
  border-color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}

.base-header-steps {
  display: flex;
  gap: var(--sp3);
  font-size: 11px;
  font-weight: 700;
  color: var(--faint);
}

.base-header-steps .active {
  color: var(--blue-hi);
}
</style>
