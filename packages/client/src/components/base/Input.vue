<script setup lang="ts">
/**
 * `inheritAttrs: false` + explicit `v-bind="$attrs"` on the real `<input>` (not the wrapper div)
 * is load-bearing: it's what lets a migrated call site keep its own semantic class
 * (`.search-input`, `.profile-input`, …) as a fallthrough class on the element tokens.css's
 * existing selectors actually target, instead of it landing on this component's wrapper.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string | number>();

withDefaults(
  defineProps<{
    type?: "text" | "number" | "search" | "password";
    surface?: "flat" | "hybrid";
    size?: "md" | "lg";
    invalid?: boolean;
  }>(),
  { type: "text", surface: "flat", size: "md", invalid: false },
);
</script>

<template>
  <div class="input-wrap" :class="[`input-wrap-${surface}`, { invalid }]">
    <input v-bind="$attrs" v-model="model" :type="type" class="input-el" :class="[`input-${size}`]" />
    <span v-if="$slots.trailing" class="input-trailing"><slot name="trailing" /></span>
  </div>
</template>

<style scoped>
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-el {
  width: 100%;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  color: var(--text);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.input-md {
  padding: 10px 12px;
  font-size: 14px;
}
.input-lg {
  padding: 12px 14px;
  font-size: 16px;
}
/* The app's own accent gradient, not the browser default outline, announces "you're editing
   this field" — same recipe every hand-rolled text input on this page family already used. */
.input-el:focus-visible {
  outline: none;
  border-color: var(--nebula-m);
  box-shadow: 0 0 0 3px var(--nebula-glow);
}
.input-wrap.invalid .input-el {
  border-color: var(--danger);
}
.input-trailing {
  position: absolute;
  right: 12px;
  color: var(--dim);
  font-size: 13px;
  pointer-events: none;
}

/* "surface-hybrid" treatment (tokens.css's own `.surface-hybrid`/`.panel` recipe: blurred
   translucent fill + gradient-hairline edge), reapplied here via a wrapper div rather than
   tokens.css's utility classes directly on the input: a pseudo-element's `::after` (which paints
   the hairline ring) never renders on a replaced form control like `<input>` in any browser, so
   the wrapper carries the surface + `::after` ring and the input itself becomes a transparent,
   borderless layer on top of it. */
.input-wrap-hybrid {
  border-radius: var(--r-md);
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  box-shadow: var(--surface-hybrid-shadow);
}
.input-wrap-hybrid::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--surface-hybrid-edge-grad);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
.input-wrap-hybrid .input-el {
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
}
</style>
