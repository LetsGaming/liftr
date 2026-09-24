<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppIcon from "../base/AppIcon.vue";

const props = withDefaults(
  defineProps<{
    as?: "div" | "button" | "li" | "router-link";
    to?: string;
    interactive?: boolean;
    chevron?: boolean;
    dense?: boolean;
  }>(),
  // `interactive: undefined` is load-bearing: Vue casts an un-declared Boolean prop's absence to
  // `false` rather than `undefined`, which would defeat the `??` fallback below on every call
  // site that doesn't pass `interactive` explicitly.
  { as: "div", interactive: undefined },
);

const tag = computed(() => (props.as === "router-link" ? RouterLink : props.as));
const isInteractive = computed(() => props.interactive ?? (props.as === "button" || props.as === "router-link"));

/** Only the attrs the current `as` actually uses — see base/Button.vue's own doc comment for why
 *  binding an unused one as an explicit `undefined` is unsafe on a RouterLink target. */
const tagAttrs = computed(() => {
  if (props.as === "router-link") return { to: props.to };
  if (props.as === "button") return { type: "button" as const };
  return {};
});
</script>

<template>
  <component :is="tag" v-bind="tagAttrs" class="list-row" :class="{ 'list-row-interactive': isInteractive, 'list-row-dense': dense }">
    <span v-if="$slots.leading" class="list-row-leading"><slot name="leading" /></span>
    <div class="list-row-main"><slot /></div>
    <slot name="trailing" />
    <AppIcon v-if="chevron" name="chevron-left" class="list-row-chevron" />
  </component>
</template>

<style scoped>
.list-row {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  width: 100%;
  min-width: 0;
}
.list-row-dense {
  gap: var(--sp2);
}
.list-row-leading {
  display: inline-flex;
  flex: none;
}
/* The flex+min-width:0 contract TruncatingLabel's own doc comment requires from its ancestor. */
.list-row-main {
  flex: 1;
  min-width: 0;
}
.list-row-interactive {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  background: none;
  border: none;
  text-align: inherit;
  font: inherit;
}
.list-row-chevron {
  flex: none;
  color: var(--faint);
  /* AppIcon only ships a left-pointing chevron path (see CollapsibleCard.vue's identical
     rotation for the same reason) — rotated to read as a right-pointing disclosure. */
  transform: rotate(180deg);
}
</style>
