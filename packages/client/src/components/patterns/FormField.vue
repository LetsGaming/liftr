<script setup lang="ts">
defineProps<{ label: string; hint?: string; error?: string; labelFor?: string }>();
</script>

<template>
  <div class="form-field">
    <label :for="labelFor" class="form-field-label">{{ label }}</label>
    <slot />
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="hint || $slots.hint" class="hint">
      <slot name="hint">{{ hint }}</slot>
    </p>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field-label {
  font-size: 12.5px;
  color: var(--dim);
  font-weight: 700;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--faint);
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
