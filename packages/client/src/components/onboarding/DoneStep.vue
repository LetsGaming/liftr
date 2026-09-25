<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../base/AppIcon.vue";
import { needsPlatesStep, useOnboardingDraft } from "./OnboardingDraft";

const { t } = useI18n();
const draft = useOnboardingDraft();

const equipmentCount = computed(() => draft.equipment.size);
const hasPlates = computed(() => needsPlatesStep(draft) && [...draft.plates.values()].some((c) => c > 0));
</script>

<template>
  <div class="done">
    <div class="hero-badge"><AppIcon name="check" :size="40" /></div>
    <h2>{{ t("onboarding.doneStep.title") }}</h2>
    <p>{{ t("onboarding.doneStep.subtitle") }}</p>
    <ul class="unlocks">
      <li class="surface-hybrid"><AppIcon name="target" /> {{ t("onboarding.doneStep.unlockWeight") }}</li>
      <li class="surface-hybrid"><AppIcon name="dumbbell" /> {{ t("onboarding.doneStep.unlockExercises", { n: equipmentCount }) }}</li>
      <li v-if="hasPlates" class="surface-hybrid"><AppIcon name="scale" /> {{ t("onboarding.doneStep.unlockPlates") }}</li>
      <li class="surface-hybrid"><AppIcon name="trophy" /> {{ t("onboarding.doneStep.unlockRank") }}</li>
    </ul>
  </div>
</template>

<style scoped>
.done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--sp3);
  padding: var(--sp6) var(--sp2) var(--sp4);
}
.hero-badge {
  font-size: 40px;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--success);
  color: #04220f;
  font-weight: 900;
  margin-bottom: var(--sp2);
}
.done h2 {
  font-size: 24px;
}
.done p {
  font-size: 14px;
  color: var(--dim);
}
.unlocks {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  text-align: left;
  width: 100%;
  margin-top: var(--sp2);
}
/* .surface-hybrid (tokens.css), applied in the template alongside this class, supplies the
   translucent panel fill and border; this rule only supplies layout (padding/radius/type), same
   split as ProfilePage.vue's .card. */
.unlocks li {
  padding: var(--sp3);
  border-radius: var(--r-md);
  font-size: 13px;
  line-height: 1.4;
}
</style>
