<script setup lang="ts">
/**
 * RPE capture (Task 4, workstream A — plan §"RPE capture: new UI, off the primary tap path").
 * Explicitly speculative per workplan-v1.md §4 — no prior pattern to anchor this on, so kept as
 * small and reversible as possible: a single sheet, a row of tappable numbers, no required state.
 *
 * A row of 10 discrete tap targets, not a slider — a slider adds drag-precision friction to
 * something meant to be a 1-tap afterthought, and matches this app's existing preference for
 * discrete tap targets over continuous controls (e.g. NumberStepper) over the whole active-
 * workout screen.
 *
 * Global Constraint 4: this component only ever writes into store.currentSet.rpe (via
 * setCurrentSetRpe() in the caller), which rides along in the next logCurrentSet() sync payload —
 * it never blocks or gates "Satz speichern", and closing without picking is a silent no-op, not a
 * dismissed-warning state.
 *
 * Picking a number closes this sheet via sheetRef.dismiss(), not by having the caller flip its
 * own v-if straight away — see SheetModal.vue's header comment for why that crashes
 * ("Cannot read properties of null (reading 'insertBefore')"). The caller's own state teardown
 * (its `showRpeCapture = false`) happens off `@close`, which only fires after Ionic's real
 * dismiss animation/teardown finishes.
 */
import { ref } from "vue";
import SheetModal from "../ui/SheetModal.vue";

defineProps<{ currentRpe: number | null }>();
const emit = defineEmits<{ pick: [rpe: number]; close: [] }>();

const OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);

function pick(n: number) {
  emit("pick", n);
  sheetRef.value?.dismiss();
}
</script>

<template>
  <SheetModal ref="sheetRef" title="RPE" height="35%" @close="emit('close')">
    <p class="rpe-hint">Wie anstrengend war der Satz? (1 = sehr leicht, 10 = maximal)</p>
    <div class="rpe-row">
      <button
        v-for="n in OPTIONS"
        :key="n"
        class="rpe-opt"
        :class="{ active: currentRpe === n }"
        @click="pick(n)"
      >
        {{ n }}
      </button>
    </div>
  </SheetModal>
</template>

<style scoped>
.rpe-hint {
  font-size: 12.5px;
  color: var(--dim);
  margin-bottom: var(--sp3);
}
.rpe-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
}
.rpe-opt {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
  display: grid;
  place-items: center;
  flex: none;
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.rpe-opt:active {
  transform: scale(0.9);
}
.rpe-opt.active {
  background: var(--blue-lo);
  border-color: var(--blue-hi);
  color: var(--on-blue-lo);
}
</style>
