<script setup lang="ts">
/**
 * Mirrors Input.vue's flat recipe and fallthrough-attrs contract (see that component's own doc
 * comment) — a `<select>` has no replaced-element `::after` problem, so there's no `surface`
 * variant to mirror.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string | number>();

withDefaults(defineProps<{ size?: "md" | "lg"; invalid?: boolean }>(), { size: "md", invalid: false });
</script>

<template>
  <div class="select-wrap" :class="{ invalid }">
    <select v-bind="$attrs" v-model="model" class="select-el" :class="[`select-${size}`]">
      <slot />
    </select>
  </div>
</template>

<style scoped>
.select-wrap {
  display: flex;
  align-items: center;
}
.select-el {
  width: 100%;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  color: var(--text);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.select-md {
  padding: 10px 12px;
  font-size: 14px;
}
.select-lg {
  padding: 12px 14px;
  font-size: 16px;
}
.select-el:focus-visible {
  outline: none;
  border-color: var(--nebula-m);
  box-shadow: 0 0 0 3px var(--nebula-glow);
}
.select-wrap.invalid .select-el {
  border-color: var(--danger);
}
</style>
