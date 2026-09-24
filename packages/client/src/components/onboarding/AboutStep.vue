<script setup lang="ts">
import Chip from "../base/Chip.vue";
import Input from "../base/Input.vue";
import FormField from "../patterns/FormField.vue";
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();
</script>

<template>
  <div class="step">
    <h2>Über dich</h2>
    <p class="step-hint">Alles optional — wird für die Rang-Berechnung (Gewicht / Körpergewicht) verwendet.</p>

    <FormField label="Geschlecht">
      <div class="chip-row">
        <Chip as="button" class="chip" variant="accent" :active="draft.sex === 'male'" @click="draft.sex = 'male'">Männlich</Chip>
        <Chip as="button" class="chip" variant="accent" :active="draft.sex === 'female'" @click="draft.sex = 'female'">Weiblich</Chip>
      </div>
    </FormField>

    <FormField label="Geburtsjahr">
      <Input v-model="draft.birthYearInput" type="text" inputmode="numeric" placeholder="z.B. 1995" surface="hybrid" />
    </FormField>

    <FormField label="Aktuelles Körpergewicht">
      <Input v-model="draft.weightInput" type="text" inputmode="decimal" placeholder="z.B. 72,5" surface="hybrid">
        <template #trailing>kg</template>
      </Input>
    </FormField>
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
.chip-row {
  display: flex;
  gap: var(--sp2);
}
</style>
