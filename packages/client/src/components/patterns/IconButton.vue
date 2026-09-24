<script setup lang="ts">
/**
 * Thin wrapper around tokens.css's `.btn-icon`/`.btn-close`/`.btn-icon.danger`/`.btn-icon.confirming`
 * rules (there is no `--danger` token in this palette — `.danger`/`.confirming` key off `--red`/
 * `--red-lo` directly, see tokens.css's own comment) plus a chromeless `ghost` variant and a small
 * `sm` size, neither of which exists in tokens.css yet. `confirming` must be driven by the caller's
 * own `useConfirmTap` state — this component never owns a confirm timer itself.
 */
import { useSlots, onMounted } from "vue";
import AppIcon, { type AppIconName } from "../base/AppIcon.vue";

const props = withDefaults(
  defineProps<{
    icon?: AppIconName;
    label: string;
    variant?: "default" | "close" | "danger" | "confirming" | "ghost";
    size?: "md" | "sm";
    iconSize?: number;
  }>(),
  { variant: "default", size: "md" },
);

const slots = useSlots();
if (import.meta.env.DEV) {
  onMounted(() => {
    if (!props.icon && !slots.default) {
      console.warn('[IconButton] needs either an "icon" prop or default slot content — it would render empty otherwise.');
    }
  });
}
</script>

<template>
  <button
    type="button"
    :class="[
      variant === 'close' ? 'btn-close' : variant === 'ghost' ? 'icon-btn-ghost' : 'btn-icon',
      { danger: variant === 'danger', confirming: variant === 'confirming', 'icon-btn-sm': size === 'sm' },
    ]"
    :aria-label="label"
  >
    <slot><AppIcon v-if="icon" :name="icon" :size="iconSize" /></slot>
  </button>
</template>

<style scoped>
.icon-btn-ghost {
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  background: transparent;
  border: none;
  color: var(--dim);
  flex: none;
  display: grid;
  place-items: center;
  transition: transform var(--dur-fast) var(--ease-out);
}
.icon-btn-ghost:active {
  transform: scale(0.9);
}
.icon-btn-sm {
  width: 32px;
  height: 32px;
}
</style>
