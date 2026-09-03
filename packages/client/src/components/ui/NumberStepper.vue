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
import { ref } from "vue";

const props = withDefaults(
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
const emit = defineEmits<{ adjust: [delta: 1 | -1]; set: [value: number] }>();

/**
 * Long-press repeat (critique finding: ±1-per-tap only, so going from a 20kg default to 100kg
 * is ~64 taps at a 1.25kg step). Holding a button fires the same 'adjust' delta the caller
 * already handles — no new event, no change to step size or clamping, both owned by the caller
 * (activeWorkoutStore's adjustCurrentSet) exactly as before. A normal tap is unaffected: the
 * hold timer only starts accelerated repetition after `holdDelayMs`, and holdFired suppresses
 * the click handler's own emit so a completed hold never double-fires on release.
 */
const holdDelayMs = 400;
const holdFired = ref(false);
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let repeatTimer: ReturnType<typeof setInterval> | null = null;

function clearHold() {
  if (holdTimer != null) clearTimeout(holdTimer);
  if (repeatTimer != null) clearInterval(repeatTimer);
  holdTimer = null;
  repeatTimer = null;
}

function startHold(delta: 1 | -1) {
  clearHold();
  holdFired.value = false;
  holdTimer = setTimeout(() => {
    holdFired.value = true;
    let intervalMs = 150;
    let ticks = 0;
    const tick = () => {
      emit("adjust", delta);
      ticks++;
      // Accelerates from 150ms down to a 60ms floor after ~1.2s of holding, so a long hold
      // covers a large range without the repeat feeling uncontrollable at the start.
      if (ticks === 8 && intervalMs > 60) {
        intervalMs = 60;
        if (repeatTimer != null) clearInterval(repeatTimer);
        repeatTimer = setInterval(tick, intervalMs);
      }
    };
    if (repeatTimer != null) clearInterval(repeatTimer);
    repeatTimer = setInterval(tick, intervalMs);
  }, holdDelayMs);
}

function onClick(delta: 1 | -1) {
  if (holdFired.value) {
    // The hold sequence already emitted every delta for this press; the browser's own
    // click-after-pointerup would otherwise add one extra, unrequested step.
    holdFired.value = false;
    return;
  }
  emit("adjust", delta);
}

/** Direct numeric entry (critique finding, same root cause as long-press) — tapping the big
 *  number itself (lg size only; the compact sm stepper has no room for this) opens a plain
 *  numeric input. Emits the caller's existing clamping path is NOT bypassed: the caller (e.g.
 *  SetEntry.vue) is expected to route this through the same validation adjustCurrentSet uses
 *  for deltas, not write the raw value straight to state. */
const editing = ref(false);
const editValue = ref("");
function startEdit() {
  if (props.size !== "lg") return;
  editValue.value = String(props.modelValue);
  editing.value = true;
}
function commitEdit() {
  editing.value = false;
  const parsed = Number(editValue.value.replace(",", "."));
  if (Number.isFinite(parsed)) emit("set", parsed);
}
</script>

<template>
  <div class="stepper" :class="size">
    <div v-if="label && size === 'lg'" class="eyebrow">{{ label }}</div>
    <input
      v-if="size === 'lg' && editing"
      :value="editValue"
      type="number"
      inputmode="decimal"
      class="num-input tnum"
      autofocus
      @focus="($event.target as HTMLInputElement).select()"
      @input="editValue = ($event.target as HTMLInputElement).value"
      @blur="commitEdit"
      @keydown.enter="commitEdit"
      @keydown.escape="editing = false"
    />
    <button
      v-else-if="size === 'lg'"
      type="button"
      class="num tnum num-edit"
      :class="{ emphasize }"
      :aria-label="`${label ?? 'Wert'} bearbeiten, aktuell ${modelValue}${unit ? ' ' + unit : ''}`"
      @click="startEdit"
    >
      {{ modelValue }}<small v-if="unit"> {{ unit }}</small>
    </button>
    <div class="ctrls">
      <button
        type="button"
        :aria-label="`Weniger${label ? ' ' + label : ''}`"
        @pointerdown="startHold(-1)"
        @pointerup="clearHold"
        @pointerleave="clearHold"
        @pointercancel="clearHold"
        @click="onClick(-1)"
      >
        −
      </button>
      <span v-if="size === 'sm'" class="tnum">{{ modelValue }}<small v-if="unit">{{ unit }}</small></span>
      <button
        type="button"
        :aria-label="`Mehr${label ? ' ' + label : ''}`"
        @pointerdown="startHold(1)"
        @pointerup="clearHold"
        @pointerleave="clearHold"
        @pointercancel="clearHold"
        @click="onClick(1)"
      >
        +
      </button>
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
/* .num-edit is the same number, just as a <button> (direct-entry affordance) — background
   transparent so it stays visually identical to the old plain <div> until touched. */
.num-edit {
  background: none;
  border: none;
  color: var(--text);
  padding: 4px 8px;
  border-radius: var(--r-sm);
}
.num-edit:active {
  background: var(--surface-3);
}
.num-input {
  width: 100%;
  font-size: 34px;
  font-weight: 800;
  margin-top: 8px;
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  color: var(--text);
  text-align: center;
  padding: 2px 8px;
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
     (mesocycle-weeks +/-), so there's room without crowding. Now reads --touch-target-min
     (Foundation Task 1, 2026-09-03 plan) instead of the bare literal. */
  width: var(--touch-target-min);
  height: var(--touch-target-min);
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
