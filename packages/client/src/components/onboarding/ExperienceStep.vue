<script setup lang="ts">
import type { ExperienceLevel } from "../../stores/settingsStore";
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();

const options: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Anfänger", hint: "Noch nie oder erst seit kurzem trainiert" },
  { value: "intermediate", label: "Fortgeschritten", hint: "Trainiere seit einer Weile, ohne festen Plan" },
  { value: "advanced", label: "Erfahren", hint: "Folge bereits einem strukturierten Trainingsplan" },
];
</script>

<template>
  <div class="step">
    <h2>Trainingserfahrung</h2>
    <p class="step-hint">Legt fest, mit welchen Gewichten Liftr startet, solange du eine Übung noch nie gemacht hast.</p>

    <div class="option-list">
      <button
        v-for="opt in options"
        :key="opt.value"
        class="option-row"
        :class="{ active: draft.experienceLevel === opt.value }"
        @click="draft.experienceLevel = opt.value"
      >
        <b>{{ opt.label }}</b>
        <span>{{ opt.hint }}</span>
      </button>
    </div>
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
.option-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.option-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: var(--sp4);
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  text-align: left;
}
.option-row b {
  font-size: 15px;
}
.option-row span {
  font-size: 12.5px;
  color: var(--faint);
}
.option-row.active {
  background: var(--blue-lo);
  border-color: var(--blue);
}
.option-row.active b {
  color: var(--on-blue-lo);
}
</style>
