<script setup lang="ts">
/**
 * A full-bleed wizard sheet's header: a plain custom `<header>`, styled to this app's own tokens
 * rather than Ionic's toolbar defaults — an editable title input, a close button (with an
 * optional "confirm discard" state), and an optional step indicator row. Used by
 * RoutineWizard.vue/RouteWizard.vue inside SheetModal's `#header` slot, which renders whatever
 * it's given as a plain flex child (see SheetModal.vue) — no Ionic toolbar wrapper wanted there.
 *
 * `titlePlaceholder` is required, not defaulted: this file carries zero domain vocabulary (ADR
 * 0012's rule for `patterns/`), so it can't fall back to a routine- or route-shaped placeholder
 * string — every caller names its own noun ("Name der Routine", "Name der Strecke").
 *
 * Split out of a single BaseHeader.vue that took a `variant: "page" | "wizard"` prop — see
 * PageHeader.vue's doc comment for the full rationale, including why the CSS-scoping gotcha that
 * originally caused these two to be merged no longer applies.
 */
import { useI18n } from "vue-i18n";
import AppIcon from "../base/AppIcon.vue";

const { t } = useI18n();

defineProps<{
  titlePlaceholder: string;
  isConfirmingClose?: boolean;
  steps?: Array<{ key: string; label: string }>;
  activeStepKey?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const title = defineModel<string>("title", { default: "" });
</script>

<template>
  <header class="base-header base-header-wizard">
    <div class="base-header-top">
      <input
        v-model="title"
        class="base-header-name-input"
        type="text"
        :placeholder="titlePlaceholder"
        :aria-label="titlePlaceholder"
      />
      <button
        class="btn-close base-header-close-btn"
        :class="{ confirming: isConfirmingClose }"
        :aria-label="t('patterns.wizardHeader.closeAriaLabel')"
        @click="emit('close')"
      >
        <template v-if="isConfirmingClose">{{ t("patterns.wizardHeader.confirmDiscard") }}</template>
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
