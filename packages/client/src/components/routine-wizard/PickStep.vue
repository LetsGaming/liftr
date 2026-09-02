<script setup lang="ts">
/** Step 1 (and the "+ Übung hinzufügen" return trip from step 2): pick exercises either by hand
 *  via the shared ExerciseList in select mode, or — feature: "quickly create new routines based
 *  on past experience and a selection of muscle groups" — by picking target muscle groups and
 *  letting the server suggest a fitting exercise list with recommended sets/reps/weight. Both
 *  paths land in the same place: the wizard's `selected` draft, reviewable/editable on the next
 *  step, never saved directly from here.
 *
 *  `mode` used to be an internal toggle here — engagement-audit-v4 Phase 1 moved that choice up
 *  to PathChooser.vue's step-0 screen, so by the time this component renders the choice is
 *  already made (the "+ Übung hinzufügen" re-entry from Arrange always forces "manual" — adding
 *  one more exercise mid-build is never a re-run of the muscle-group suggester). */
import { computed, ref } from "vue";
import { MUSCLE_LABEL_DE, MUSCLE_SLUGS } from "../../lib/muscles";
import ExerciseList from "../exercise/ExerciseList.vue";
import MuscleFigure from "../ui/MuscleFigure.vue";

const props = withDefaults(defineProps<{ selectedIds: Set<string>; suggesting?: boolean; mode: "manual" | "muscles" }>(), { suggesting: false });
const emit = defineEmits<{ toggle: [exerciseId: string]; continue: []; suggest: [muscleSlugs: string[]] }>();

const count = computed(() => props.selectedIds.size);

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
  <div class="pick-step">
    <ExerciseList v-if="mode === 'manual'" mode="select" :selected-ids="selectedIds" @toggle="emit('toggle', $event.id)" />

    <div v-else class="muscle-suggest">
      <p class="hint">Welche Muskelgruppen willst du trainieren? Liftr stellt passende Übungen zusammen — mit Sätzen, Wiederholungen und Gewichten, die zu dem passen, was du bisher geschafft hast.</p>
      <MuscleFigure class="muscle-preview" :primary="pickedMusclesArray" :size="120" />
      <div class="muscle-chips">
        <button
          v-for="slug in MUSCLE_SLUGS"
          :key="slug"
          class="muscle-chip"
          :class="{ active: pickedMuscles.has(slug) }"
          @click="toggleMuscle(slug)"
        >
          {{ MUSCLE_LABEL_DE[slug] ?? slug }}
        </button>
      </div>
      <button class="btn-primary btn-lg btn-block" :disabled="pickedMuscles.size === 0 || suggesting" @click="requestSuggestions">
        {{ suggesting ? "Wird zusammengestellt…" : `Übungen vorschlagen (${pickedMuscles.size} Muskelgruppen)` }}
      </button>
    </div>

    <div v-if="mode === 'manual'" class="continue-bar">
      <button class="btn-primary btn-lg btn-block" :disabled="count === 0" @click="emit('continue')">
        {{ count === 0 ? "Übungen auswählen" : `${count} ausgewählt · Weiter →` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pick-step {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
  padding-bottom: 72px; /* clears the sticky bar */
}
.continue-bar {
  position: sticky;
  bottom: 0;
  padding: var(--sp3) 0;
  background: linear-gradient(0deg, var(--bg) 60%, transparent);
}
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
.muscle-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
}
.muscle-chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
</style>
