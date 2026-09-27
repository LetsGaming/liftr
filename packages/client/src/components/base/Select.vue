<script setup lang="ts">
/**
 * Mirrors Input.vue's flat recipe and fallthrough-attrs contract (see that component's own doc
 * comment): a `<select>` has no replaced-element `::after` problem, so there's no `surface`
 * variant to mirror.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string | number>();

withDefaults(defineProps<{ size?: "sm" | "md" | "lg"; invalid?: boolean }>(), { size: "md", invalid: false });
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
/* Mirrors tokens.css's .rank-tier-select (the equivalent raw <select>, used where a plain
   <select> is written by hand instead of this component): a secondary in-page filter (e.g.
   OverviewPage's activity filter) needs to sit at the same height, background, and border
   treatment as the "Alle"/"Beides" pill next to it (tokens.css's .tab-pill-sm), not this
   component's own default look. Every property .select-el sets above is re-declared here
   (not just padding/font-size): a class passed in from outside this component (as OverviewPage
   does) can't out-specificity this component's own scoped rules, so overriding from outside
   would silently lose to .select-el's background/border/radius. */
.select-sm {
  /* Vertical padding is smaller than .tab-pill-sm's own 6px: a native <select>'s closed-state
     box doesn't respect `line-height` the way a plain element does (confirmed empirically: Chromium
     keeps its own internal line box for the value text), so matching this pill's rendered height
     needs less padding here, not the same padding, to land at the same total height. */
  padding: 3px 10px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border-color: var(--line);
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
