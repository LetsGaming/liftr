<script setup lang="ts">
/**
 * Shared pinned header for full-bleed screens (SheetModal's `sheet: false` flows — the routine
 * and route wizards, and anything else that needs a title/close bar instead of scrolling content
 * under the notch/status bar on Android — see .base-header's own comment below).
 *
 * Root element class name is deliberately namespaced (`base-header*`, not a generic name like
 * `wizard-head`) — Vue applies a PARENT component's scoped styles to a CHILD component's root
 * element too (by design, so a parent can adjust a child's outer layout). A previous version of
 * this component was named WizardHeader and used generic class names; RoutineWizard.vue and
 * RouteWizard.vue each still carried their own leftover `.wizard-head`/`.name-input`/`.close-btn`
 * rules from before this component existed, and those leaked onto this component's root element
 * and silently clobbered the safe-area padding-top below with a plain `padding: ...` shorthand —
 * a real bug (the header sat under the notch despite this file's own CSS being "correct"). Give
 * this component's root classes a name distinctive enough that no caller's own leftover styles
 * are likely to collide with them again.
 */
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  titlePlaceholder?: string;
  isConfirmingClose?: boolean;
  steps?: Array<{ key: string; label: string }>;
  activeStepKey?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const title = defineModel<string>("title", { default: "" });
</script>

<template>
  <header class="base-header">
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
.base-header {
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
