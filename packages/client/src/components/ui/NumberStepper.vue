<script setup lang="ts">
/**
 * A −/+ control adjusting a number, in the two sizes the app actually uses: `lg` (SetEntry's
 * big card stepper — number on top, a row of two large buttons below) and `sm` (the routine
 * wizard's compact inline stepper — button/number/button in one row, also used for the
 * mesocycle-weeks input, which used to be a raw `<input type="number">` — a stepper is more
 * touch-friendly for a quick ±1 than triggering the OS numeric keyboard). Previously these
 * were two independently hand-rolled markup/CSS trees with inconsistent minus glyphs ("–" in
 * SetEntry vs "−" in ArrangeStep) — unified on "−" here.
 *
 * Emits the delta (±1), not the new value — the caller owns clamping/rounding/step-size (e.g.
 * SetEntry's 1.25kg weight step vs. a plain ±1 rep step), since that varies per use.
 *
 * Named `NumberStepper` (not `Stepper`) per the project's multi-word-component-name convention
 * — avoids colliding with the current/future HTML `<stepper>`-shaped custom elements.
 */
withDefaults(
  defineProps<{
    modelValue: number;
    unit?: string;
    size?: "lg" | "sm";
    label?: string;
    /** Colors the number to flag "this needs your attention" — used for the reps stepper while
     *  it's still at its unset starting value (feedback: reps must always be actively entered,
     *  never silently defaulted). */
    emphasize?: boolean;
  }>(),
  { size: "sm" },
);
const emit = defineEmits<{ adjust: [delta: 1 | -1] }>();
</script>

<template>
  <div class="stepper" :class="size">
    <div v-if="label && size === 'lg'" class="eyebrow">{{ label }}</div>
    <div v-if="size === 'lg'" class="num tnum" :class="{ emphasize }">{{ modelValue }}<small v-if="unit"> {{ unit }}</small></div>
    <div class="ctrls">
      <button type="button" :aria-label="`Weniger${label ? ' ' + label : ''}`" @click="emit('adjust', -1)">−</button>
      <span v-if="size === 'sm'" class="tnum">{{ modelValue }}<small v-if="unit">{{ unit }}</small></span>
      <button type="button" :aria-label="`Mehr${label ? ' ' + label : ''}`" @click="emit('adjust', 1)">+</button>
    </div>
    <!-- lg-only extra content below the controls (SetEntry's plate-calculator reveal) -->
    <slot />
  </div>
</template>

<style scoped>
.stepper.lg {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--sp4);
  text-align: center;
}
.stepper.lg .num {
  font-size: 34px;
  font-weight: 800;
  margin-top: 8px;
}
.stepper.lg .num small {
  font-size: 15px;
  color: var(--faint);
  font-weight: 600;
}
.stepper.lg .num.emphasize {
  color: var(--fire-hi);
  transition: color var(--dur-base) var(--ease-out);
}
.stepper.lg .ctrls {
  display: flex;
  gap: var(--sp2);
  margin-top: var(--sp3);
}
.stepper.lg .ctrls button {
  flex: 1;
  font-size: 22px;
  font-weight: 800;
  padding: 10px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  color: var(--text);
  transition: transform var(--dur-fast) var(--ease-out);
}
.stepper.lg .ctrls button:active {
  transform: scale(0.94);
}

.stepper.sm .ctrls {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  background: var(--surface-3);
  border-radius: var(--r-md);
  padding: 4px;
}
.stepper.sm .ctrls button {
  /* Bumped 32px -> 44px (audit: touch-target floor, WCAG 2.5.5) — only ever used two-up
     (mesocycle-weeks +/-), so there's room without crowding. */
  width: 44px;
  height: 44px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
  transition: transform var(--dur-fast) var(--ease-out);
}
.stepper.sm .ctrls button:active {
  transform: scale(0.9);
}
.stepper.sm .ctrls span {
  min-width: 28px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
}
.stepper.sm .ctrls span small {
  font-size: 10px;
  font-weight: 600;
  color: var(--faint);
  margin-left: 1px;
}
</style>
