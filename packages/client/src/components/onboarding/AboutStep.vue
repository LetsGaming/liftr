<script setup lang="ts">
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();
</script>

<template>
  <div class="step">
    <h2>Über dich</h2>
    <p class="step-hint">Alles optional — wird für die Rang-Berechnung (Gewicht / Körpergewicht) verwendet.</p>

    <section class="field">
      <label>Geschlecht</label>
      <div class="chip-row">
        <button class="chip" :class="{ active: draft.sex === 'male' }" @click="draft.sex = 'male'">Männlich</button>
        <button class="chip" :class="{ active: draft.sex === 'female' }" @click="draft.sex = 'female'">Weiblich</button>
      </div>
    </section>

    <section class="field">
      <label>Geburtsjahr</label>
      <input v-model="draft.birthYearInput" type="text" inputmode="numeric" placeholder="z.B. 1995" />
    </section>

    <section class="field">
      <label>Aktuelles Körpergewicht</label>
      <div class="weight-row">
        <input v-model="draft.weightInput" type="text" inputmode="decimal" placeholder="z.B. 72,5" />
        <span class="unit">kg</span>
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
.field input {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 16px;
}
.weight-row {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.weight-row input {
  flex: 1;
}
.unit {
  color: var(--faint);
  font-size: 13px;
}
.chip-row {
  display: flex;
  gap: var(--sp2);
}
.chip {
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 14px;
  font-weight: 600;
}
.chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
</style>
