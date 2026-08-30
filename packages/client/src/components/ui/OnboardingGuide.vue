<script setup lang="ts">
/**
 * Setup wizard ("a setup guide that asks the user basic questions... use these stats across the
 * platform"). Shown once, from App.vue, when settingsStore.needsOnboarding is true (profile
 * fetched and confirmed null). Rebuilt as a real multi-step wizard (feedback: "update the
 * setup/intro/interview page to be a wizard and more engaging to use") — one focused question
 * per screen instead of the original flat scrolling form, following the same shell shape as
 * RoutineWizard.vue: SheetModal with a custom #header carrying a step indicator, one `step`
 * index, thin step components mutating a shared reactive draft (OnboardingDraft.ts).
 *
 * Steps: welcome -> about -> experience -> frequency -> equipment -> [plates, conditional on a
 * barbell-family pick] -> done. The plates step only appears once there's something to load a
 * bar with — asking a bodyweight-only user to enumerate plates they don't own would be noise.
 */
import { computed, provide, ref } from "vue";
import { useSettingsStore } from "../../stores/settingsStore";
import AboutStep from "../onboarding/AboutStep.vue";
import DoneStep from "../onboarding/DoneStep.vue";
import EquipmentStep from "../onboarding/EquipmentStep.vue";
import ExperienceStep from "../onboarding/ExperienceStep.vue";
import FrequencyStep from "../onboarding/FrequencyStep.vue";
import { createOnboardingDraft, needsPlatesStep, ONBOARDING_DRAFT_KEY, parsedBirthYear, parsedWeightKg } from "../onboarding/OnboardingDraft";
import PlatesStep from "../onboarding/PlatesStep.vue";
import WelcomeStep from "../onboarding/WelcomeStep.vue";
import SheetModal from "./SheetModal.vue";

const emit = defineEmits<{ close: [] }>();
const settingsStore = useSettingsStore();
const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);

const draft = createOnboardingDraft();
provide(ONBOARDING_DRAFT_KEY, draft);

type StepKey = "welcome" | "about" | "experience" | "frequency" | "equipment" | "plates" | "done";
const STEP_LABEL: Record<StepKey, string> = {
  welcome: "Start",
  about: "Über dich",
  experience: "Erfahrung",
  frequency: "Häufigkeit",
  equipment: "Equipment",
  plates: "Scheiben",
  done: "Fertig",
};

const steps = computed<StepKey[]>(() => {
  const base: StepKey[] = ["welcome", "about", "experience", "frequency", "equipment"];
  if (needsPlatesStep(draft)) base.push("plates");
  base.push("done");
  return base;
});

const stepIndex = ref(0);
const currentStep = computed(() => steps.value[stepIndex.value] ?? "welcome");
const progressPct = computed(() => Math.round(((stepIndex.value + 1) / steps.value.length) * 100));
const isFirst = computed(() => stepIndex.value === 0);
const isLast = computed(() => stepIndex.value === steps.value.length - 1);

/** Light validation, not a hard gate everywhere — the original form let every field be skipped
 *  (sex/birth year/weight are all optional server-side), so only steps with a genuinely
 *  meaningless "empty" state block continuing. */
const canContinue = computed(() => {
  if (currentStep.value === "experience") return draft.experienceLevel !== null;
  if (currentStep.value === "equipment") return draft.equipment.size > 0;
  return true;
});

const direction = ref<"forward" | "back">("forward");
const saving = ref(false);

function goNext() {
  if (!canContinue.value) return;
  if (isLast.value) {
    void finish();
    return;
  }
  direction.value = "forward";
  // Recompute against the *current* steps list before advancing — inserting/removing "plates"
  // as equipment changes must not leave stepIndex pointing at the wrong entry.
  const list = steps.value;
  const idx = list.indexOf(currentStep.value);
  stepIndex.value = Math.min(list.length - 1, idx + 1);
}
function goBack() {
  if (isFirst.value) return;
  direction.value = "back";
  stepIndex.value -= 1;
}

async function finish() {
  if (saving.value) return;
  saving.value = true;
  try {
    const weightKg = parsedWeightKg(draft);
    const birthYear = parsedBirthYear(draft);
    await settingsStore.saveProfile({
      ...(draft.sex ? { sex: draft.sex } : {}),
      ...(birthYear ? { birthYear } : {}),
      ...(draft.experienceLevel ? { experienceLevel: draft.experienceLevel } : {}),
      workoutsPerWeek: draft.workoutsPerWeek,
      ...(weightKg ? { currentWeightKg: weightKg } : {}),
    });
    await settingsStore.saveEquipment([...draft.equipment]);

    const plateEntries = [...draft.plates.entries()].filter(([, count]) => count > 0).map(([weightKg2, count]) => ({ weightKg: weightKg2, count }));
    if (needsPlatesStep(draft) && plateEntries.length > 0) {
      const barWeights = Object.fromEntries(draft.barWeightsKg.entries());
      await settingsStore.saveGymSetup({ barWeights, plates: plateEntries });
    }

    sheetRef.value?.dismiss();
  } finally {
    saving.value = false;
  }
}

// Skip still marks onboarding as "seen" (an empty-but-non-null profile) — otherwise a user who
// dismisses this would get it shoved back in front of them on every single app open.
async function skip() {
  if (saving.value) return;
  saving.value = true;
  try {
    await settingsStore.saveProfile({});
    sheetRef.value?.dismiss();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SheetModal ref="sheetRef" :sheet="false" :backdrop-dismiss="false" background="var(--bg)" @close="emit('close')">
    <template #header>
      <header class="wizard-head">
        <div class="head-row">
          <span class="step-label">{{ STEP_LABEL[currentStep] }} · {{ stepIndex + 1 }}/{{ steps.length }}</span>
          <button class="skip-btn" :disabled="saving" @click="skip">Später</button>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
        </div>
      </header>
    </template>

    <div class="wizard-body">
      <Transition :name="direction === 'forward' ? 'slide-fwd' : 'slide-back'" mode="out-in">
        <WelcomeStep v-if="currentStep === 'welcome'" key="welcome" />
        <AboutStep v-else-if="currentStep === 'about'" key="about" />
        <ExperienceStep v-else-if="currentStep === 'experience'" key="experience" />
        <FrequencyStep v-else-if="currentStep === 'frequency'" key="frequency" />
        <EquipmentStep v-else-if="currentStep === 'equipment'" key="equipment" />
        <PlatesStep v-else-if="currentStep === 'plates'" key="plates" />
        <DoneStep v-else key="done" />
      </Transition>
    </div>

    <div class="wizard-actions">
      <button v-if="!isFirst" class="btn-secondary" :disabled="saving" @click="goBack">← Zurück</button>
      <button class="btn-primary btn-lg" :disabled="saving || !canContinue" @click="goNext">
        {{ saving ? "Wird gespeichert…" : isLast ? "Los geht's" : "Weiter →" }}
      </button>
    </div>
  </SheetModal>
</template>

<style scoped>
.wizard-head {
  flex: none;
  padding: var(--sp4);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.step-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
}
.skip-btn {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--faint);
  background: none;
  border: none;
  padding: 4px 6px;
}
.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--blue), var(--blue-hi));
  transition: width var(--dur-base) var(--ease-out);
}
.wizard-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp5) var(--sp4);
}
.wizard-actions {
  flex: none;
  display: flex;
  gap: var(--sp2);
  padding: var(--sp3) var(--sp4);
  border-top: 1px solid var(--line);
}
.wizard-actions .btn-secondary {
  flex: none;
}
.wizard-actions .btn-primary {
  flex: 1;
}

/* Horizontal slide, direction-aware — forward advances left, back retreats right, matching the
   physical "step forward/back through a sequence" mental model instead of a flat crossfade. */
.slide-fwd-enter-active,
.slide-fwd-leave-active,
.slide-back-enter-active,
.slide-back-leave-active {
  transition: transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out);
}
.slide-fwd-enter-from {
  transform: translateX(24px);
  opacity: 0;
}
.slide-fwd-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}
.slide-back-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}
.slide-back-leave-to {
  transform: translateX(24px);
  opacity: 0;
}
</style>
