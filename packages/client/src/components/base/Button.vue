<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

/**
 * Thin wrapper around tokens.css's own `.btn-primary`/`.btn-secondary`/`.btn-block` rules — this
 * component owns which class combination applies, tokens.css keeps owning the actual recipe.
 */
const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary";
    size?: "md" | "lg";
    block?: boolean;
    as?: "button" | "a" | "router-link";
    to?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  { variant: "primary", size: "md", block: false, as: "button", type: "button", disabled: false },
);

const tag = computed(() => (props.as === "router-link" ? RouterLink : props.as));

/** Only the attribute keys the current `as` actually uses — binding an unused one (e.g. `href`)
 *  as an explicit `undefined` still merges that key into the rendered root's attrs and wipes out
 *  RouterLink's own computed `href`, even though the value itself is empty. */
const linkAttrs = computed(() => {
  if (props.as === "router-link") return { to: props.to };
  if (props.as === "a") return { href: props.to };
  return { type: props.type, disabled: props.disabled };
});
</script>

<template>
  <component
    :is="tag"
    v-bind="linkAttrs"
    :class="[variant === 'primary' ? 'btn-primary' : 'btn-secondary', { 'btn-lg': size === 'lg', 'btn-block': block }]"
    :aria-disabled="as !== 'button' && disabled ? 'true' : undefined"
  >
    <span v-if="$slots.leading" class="btn-leading"><slot name="leading" /></span>
    <slot />
    <span v-if="$slots.trailing" class="btn-trailing"><slot name="trailing" /></span>
  </component>
</template>

<style scoped>
.btn-leading,
.btn-trailing {
  display: inline-flex;
  align-items: center;
}
[aria-disabled="true"] {
  pointer-events: none;
  opacity: 0.6;
}
</style>
