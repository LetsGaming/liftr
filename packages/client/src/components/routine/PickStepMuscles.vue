<script setup lang="ts">
/** Step 1's muscle-suggest path: pick target muscle groups and let the server suggest a fitting
 *  exercise list with recommended sets/reps/weight, based on past training history. Picks land in
 *  the wizard's `selected` draft, reviewable/editable on the next step.
 *
 *  Split out of a single PickStep.vue that took a `mode: "manual" | "muscles"` prop and branched
 *  its whole template/state on it — see PickStepManual.vue's doc comment for the full rationale.
 *  This one has no continue button; picking suggestions moves the wizard on by itself. */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { muscleLabel, MUSCLE_SLUGS } from "../../lib/muscles";
import MuscleFigure from "../exercise/MuscleFigure.vue";
import Chip from "../base/Chip.vue";
import Button from "../base/Button.vue";

const props = withDefaults(defineProps<{ suggesting?: boolean }>(), { suggesting: false });
const emit = defineEmits<{ suggest: [muscleSlugs: string[]] }>();

const { t } = useI18n();
const pickedMuscles = ref<Set<string>>(new Set());
const pickedMusclesArray = computed(() => [...pickedMuscles.value]);

function toggleMuscle(slug: string) {
  if (pickedMuscles.value.has(slug)) pickedMuscles.value.delete(slug);
  else pickedMuscles.value.add(slug);
}

function requestSuggestions() {
  if (pickedMuscles.value.size === 0 || props.suggesting) return;
  emit("suggest", [...pickedMuscles.value]);
}
</script>

<template>
  <div class="muscle-suggest">
    <p class="hint">{{ t("routine.pickStepMuscles.hint") }}</p>
    <MuscleFigure class="muscle-preview" :primary="pickedMusclesArray" :size="120" />
    <div class="muscle-chips">
      <Chip
        v-for="slug in MUSCLE_SLUGS"
        :key="slug"
        as="button"
        class="muscle-chip"
        :active="pickedMuscles.has(slug)"
        @click="toggleMuscle(slug)"
      >
        {{ muscleLabel(slug) }}
      </Chip>
    </div>
    <Button size="lg" block :disabled="pickedMuscles.size === 0 || suggesting" @click="requestSuggestions">
      {{ suggesting ? t("routine.pickStepMuscles.assembling") : t("routine.pickStepMuscles.suggest", { n: pickedMuscles.size }) }}
    </Button>
  </div>
</template>

<style scoped>
.muscle-suggest {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.muscle-suggest .hint {
  font-size: 12.5px;
  color: var(--dim);
}
.muscle-preview {
  padding: var(--sp3) 0;
}
.muscle-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
}
</style>
