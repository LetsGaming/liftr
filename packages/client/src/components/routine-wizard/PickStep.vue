<script setup lang="ts">
/** Step 1 (and the "+ Übung hinzufügen" return trip from step 2): pick exercises either by hand
 *  via the shared ExerciseList in select mode, or — feature: "quickly create new routines based
 *  on past experience and a selection of muscle groups" — by picking target muscle groups and
 *  letting the server suggest a fitting exercise list with recommended sets/reps/weight. Both
 *  paths land in the same place: the wizard's `selected` draft, reviewable/editable on the next
 *  step, never saved directly from here. */
import { computed, ref } from "vue";
import { MUSCLE_LABEL_DE, MUSCLE_SLUGS } from "../../lib/muscles";
import ExerciseList from "../exercise/ExerciseList.vue";
import MuscleFigure from "../ui/MuscleFigure.vue";

const props = withDefaults(defineProps<{ selectedIds: Set<string>; suggesting?: boolean }>(), { suggesting: false });
const emit = defineEmits<{ toggle: [exerciseId: string]; continue: []; suggest: [muscleSlugs: string[]] }>();

const count = computed(() => props.selectedIds.size);

const mode = ref<"manual" | "muscles">("manual");
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
    <div class="mode-toggle">
      <button :class="{ active: mode === 'manual' }" @click="mode = 'manual'">Manuell wählen</button>
      <button :class="{ active: mode === 'muscles' }" @click="mode = 'muscles'">Nach Muskelgruppe</button>
    </div>

    <ExerciseList v-if="mode === 'manual'" mode="select" :selected-ids="selectedIds" @toggle="emit('toggle', $event.id)" />

    <div v-else class="muscle-suggest">
      <p class="hint">Welche Muskelgruppen willst du trainieren? Passende Übungen inkl. Satz-/Wiederholungs-/Gewichtsvorschlag werden anhand deiner bisherigen Trainingsdaten zusammengestellt.</p>
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
      <button class="continue-btn" :disabled="count === 0" @click="emit('continue')">
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
.continue-btn {
  width: 100%;
  padding: 14px 20px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--blue-hi), var(--blue));
  color: #fff;
  border: none;
  font-weight: 800;
  font-size: 15px;
}
.continue-btn:disabled {
  background: var(--surface-3);
  color: var(--faint);
}
.mode-toggle {
  display: flex;
  gap: var(--sp2);
  background: var(--surface-2);
  border-radius: var(--r-md);
  padding: 4px;
}
.mode-toggle button {
  flex: 1;
  padding: 10px;
  border-radius: var(--r-sm);
  background: none;
  border: none;
  color: var(--dim);
  font-size: 13px;
  font-weight: 700;
}
.mode-toggle button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
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
