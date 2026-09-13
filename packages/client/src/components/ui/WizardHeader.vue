<script setup lang="ts">
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
  <header class="wizard-head">
    <div class="wizard-head-top">
      <input
        v-model="title"
        class="name-input"
        type="text"
        :placeholder="titlePlaceholder ?? 'Name der Routine'"
        :aria-label="titlePlaceholder ?? 'Name der Routine'"
      />
      <button
        class="btn-close close-btn"
        :class="{ confirming: isConfirmingClose }"
        aria-label="Schließen"
        @click="emit('close')"
      >
        <template v-if="isConfirmingClose">Verwerfen?</template>
        <AppIcon v-else name="close" />
      </button>
    </div>
    <div v-if="steps && steps.length > 0" class="steps">
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
.wizard-head {
  flex: none;
  padding: var(--sp3) var(--sp4);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  background: var(--bg);
}

.wizard-head-top {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}

.name-input {
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

.close-btn {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.close-btn.confirming {
  width: auto;
  padding: 0 12px;
  border-radius: var(--r-md);
  background: var(--danger-lo);
  border-color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}

.steps {
  display: flex;
  gap: var(--sp3);
  font-size: 11px;
  font-weight: 700;
  color: var(--faint);
}

.steps .active {
  color: var(--blue-hi);
}
</style>