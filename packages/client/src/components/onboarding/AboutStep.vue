<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Chip from "../base/Chip.vue";
import Input from "../base/Input.vue";
import FormField from "../patterns/FormField.vue";
import { useOnboardingDraft } from "./OnboardingDraft";

const { t } = useI18n();
const draft = useOnboardingDraft();
</script>

<template>
  <div class="step">
    <h2>{{ t("onboarding.aboutStep.title") }}</h2>
    <p class="step-hint">{{ t("onboarding.aboutStep.hint") }}</p>

    <FormField :label="t('profile.trainingProfile.sex.label')">
      <div class="chip-row">
        <Chip as="button" class="chip" variant="accent" :active="draft.sex === 'male'" @click="draft.sex = 'male'">{{ t("profile.trainingProfile.sex.male") }}</Chip>
        <Chip as="button" class="chip" variant="accent" :active="draft.sex === 'female'" @click="draft.sex = 'female'">{{ t("profile.trainingProfile.sex.female") }}</Chip>
      </div>
    </FormField>

    <FormField :label="t('profile.trainingProfile.birthYear.label')">
      <Input v-model="draft.birthYearInput" type="text" inputmode="numeric" :placeholder="t('profile.trainingProfile.birthYear.placeholder')" surface="hybrid" />
    </FormField>

    <FormField :label="t('onboarding.aboutStep.weightLabel')">
      <Input v-model="draft.weightInput" type="text" inputmode="decimal" :placeholder="t('profile.bodyweight.placeholder')" surface="hybrid">
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
