<script setup lang="ts">
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();

function adjust(delta: number) {
  draft.workoutsPerWeek = Math.min(14, Math.max(1, draft.workoutsPerWeek + delta));
}
</script>

<template>
  <div class="step">
    <h2>Workouts pro Woche</h2>
    <p class="step-hint">Wie oft planst du realistisch zu trainieren? Fließt in die Trainingsvorschläge ein.</p>

    <div class="stepper-card">
      <div class="stepper-row">
        <button type="button" aria-label="Weniger" @click="adjust(-1)">−</button>
        <span class="tnum">{{ draft.workoutsPerWeek }}</span>
        <button type="button" aria-label="Mehr" @click="adjust(1)">+</button>
      </div>
      <span class="stepper-label">{{ draft.workoutsPerWeek === 1 ? "Workout" : "Workouts" }} / Woche</span>
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
.stepper-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp6) 0;
}
.stepper-row {
  display: flex;
  align-items: center;
  gap: var(--sp4);
  background: var(--surface-3);
  border-radius: var(--r-lg);
  padding: 8px;
}
.stepper-row button {
  width: 52px;
  height: 52px;
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 24px;
  font-weight: 700;
}
.stepper-row span {
  min-width: 48px;
  text-align: center;
  font-weight: 800;
  font-size: 32px;
}
.stepper-label {
  font-size: 13px;
  color: var(--dim);
  font-weight: 600;
}
</style>
