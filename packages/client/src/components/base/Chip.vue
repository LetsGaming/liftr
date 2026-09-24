<script setup lang="ts">
/**
 * Canonical pill shape for chip/badge/pill patterns — variant and size change color and spacing,
 * never the base geometry, so every consumer stays visually identical regardless of what it's
 * labeling. `tier` reads its fill from a `--tier-accent` custom property set by the caller (tier
 * color is data-driven, not a fixed palette entry) rather than hardcoding one tier's color here.
 */
withDefaults(
  defineProps<{
    variant?: "neutral" | "accent" | "fire" | "danger" | "success" | "tier";
    size?: "sm" | "md";
    active?: boolean;
    as?: "span" | "button" | "li";
  }>(),
  { variant: "neutral", size: "md", active: false, as: "span" },
);
</script>

<template>
  <component
    :is="as"
    class="chip"
    :class="[`chip-${variant}`, `chip-${size}`, { active }]"
    :type="as === 'button' ? 'button' : undefined"
  >
    <span v-if="$slots.leading" class="chip-leading"><slot name="leading" /></span>
    <slot />
  </component>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--r-full);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}
button.chip {
  cursor: pointer;
}
.chip-sm {
  padding: 4px 10px;
  font-size: 11px;
}
.chip-md {
  padding: 7px 12px;
  font-size: 12px;
}
.chip-accent {
  border-color: var(--nebula-m);
  color: var(--text);
}
.chip-fire {
  border-color: var(--warning);
  color: var(--warning-hi);
}
.chip-danger {
  border-color: var(--danger);
  color: var(--danger);
}
.chip-success {
  border-color: var(--success);
  color: var(--success);
}
.chip-tier {
  border-color: var(--tier-accent, var(--line));
  color: var(--dim);
}
.chip.active {
  font-weight: 800;
  color: var(--text);
}
.chip-tier.active {
  background: var(--tier-accent, var(--nebula-1));
  color: var(--text);
}
</style>
