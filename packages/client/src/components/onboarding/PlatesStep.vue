<script setup lang="ts">
/** Feature: "specify which weight plates you have (e.g. 4x1kg, 2x5kg, 4x2kg)... showing the user
 *  how to load the barbell to achieve the desired weight." Fixed common plate sizes rather than
 *  a free-form add/remove list — faster to fill in on a phone, and covers what actually ships in
 *  a home-gym plate set; @liftr/shared's calculatePlatesFromInventory only needs the counts. */
import { BAR_TYPES, DEFAULT_BAR_WEIGHTS_KG, useOnboardingDraft, type BarType } from "./OnboardingDraft";

const draft = useOnboardingDraft();

const BAR_LABEL_DE: Record<BarType, string> = { barbell: "Langhantel", "ez-bar": "SZ-Stange", "trap-bar": "Trap-Bar" };
const ownedBarTypes = BAR_TYPES.filter((t) => draft.equipment.has(t));

function barWeight(type: BarType): number {
  return draft.barWeightsKg.get(type) ?? DEFAULT_BAR_WEIGHTS_KG[type];
}
function adjustBarWeight(type: BarType, delta: number) {
  draft.barWeightsKg.set(type, Math.min(50, Math.max(5, barWeight(type) + delta)));
}

const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 1];

function countFor(weightKg: number): number {
  return draft.plates.get(weightKg) ?? 0;
}
function adjust(weightKg: number, delta: number) {
  const next = Math.max(0, countFor(weightKg) + delta);
  if (next === 0) draft.plates.delete(weightKg);
  else draft.plates.set(weightKg, next);
}
</script>

<template>
  <div class="step">
    <h2>Scheiben &amp; Stange</h2>
    <p class="step-hint">
      Optional, aber macht die Scheiben-Anzeige beim Training exakt: nur was du wirklich hast, wird zum Beladen
      vorgeschlagen. Ohne Angabe wird von einem Standard-Satz ausgegangen.
    </p>

    <!-- Feedback: "a barbell usually has a different weight than a dumbbell [bar]" — one row
         per bar-family item the user actually owns, not one generic "Stangengewicht". -->
    <section class="field">
      <label>Stangengewicht</label>
      <div class="plate-rows">
        <div v-for="type in ownedBarTypes" :key="type" class="plate-row">
          <span class="plate-size">{{ BAR_LABEL_DE[type] }}</span>
          <div class="plate-stepper">
            <button type="button" :aria-label="`Weniger ${BAR_LABEL_DE[type]}`" @click="adjustBarWeight(type, -1)">−</button>
            <span class="tnum">{{ barWeight(type) }} <small>kg</small></span>
            <button type="button" :aria-label="`Mehr ${BAR_LABEL_DE[type]}`" @click="adjustBarWeight(type, 1)">+</button>
          </div>
        </div>
      </div>
    </section>

    <section class="field">
      <label>Scheiben pro Größe</label>
      <div class="plate-rows">
        <div v-for="size in PLATE_SIZES_KG" :key="size" class="plate-row">
          <span class="plate-size tnum">{{ size }} kg</span>
          <div class="plate-stepper">
            <button type="button" :aria-label="`Weniger ${size}kg`" @click="adjust(size, -1)">−</button>
            <span class="tnum">{{ countFor(size) }}</span>
            <button type="button" :aria-label="`Mehr ${size}kg`" @click="adjust(size, 1)">+</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: var(--sp5);
}
.step h2 {
  font-size: 20px;
}
.step-hint {
  font-size: 12.5px;
  color: var(--faint);
  line-height: 1.5;
  margin-top: -8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.field label {
  font-size: 13px;
  font-weight: 700;
}
.plate-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.plate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.plate-size {
  font-size: 14px;
  font-weight: 700;
}
.plate-stepper {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  background: var(--surface-3);
  border-radius: var(--r-md);
  padding: 4px;
}
.plate-stepper button {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}
.plate-stepper span {
  min-width: 22px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
}
.plate-stepper span small {
  font-size: 10px;
  color: var(--faint);
  font-weight: 600;
  margin-left: 1px;
}
</style>
