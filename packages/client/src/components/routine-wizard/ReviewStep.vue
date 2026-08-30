<script setup lang="ts">
/** Step 3 — quick summary + save. Name stays editable via the wizard's persistent header field. */
import { useExerciseName } from "../../composables/useExerciseName";
import { useCatalogStore } from "../../stores/catalogStore";
import ExerciseRow from "../exercise/ExerciseRow.vue";
import type { DraftExercise } from "./RoutineWizard.vue";

defineProps<{
  name: string;
  entries: [string, DraftExercise][];
  totalSets: number;
  saving: boolean;
  canSave: boolean;
  isEditing: boolean;
}>();
const emit = defineEmits<{ back: []; save: [] }>();

const catalog = useCatalogStore();
const { exerciseName } = useExerciseName();

function setSummary(cfg: DraftExercise): string {
  return cfg.sets.map((s) => (s.weightKg !== null ? `${s.weightKg}×${s.reps}` : `${s.reps}`)).join(" / ");
}
</script>

<template>
  <div class="review-step">
    <div class="summary">
      <b>{{ name || "Unbenannte Routine" }}</b>
      <span>{{ entries.length }} {{ entries.length === 1 ? "Übung" : "Übungen" }} · {{ totalSets }} Sätze</span>
    </div>

    <ul class="ex-summary">
      <li v-for="[exerciseId, cfg] in entries" :key="exerciseId">
        <ExerciseRow
          visual="icon"
          :size="16"
          :slug="catalog.byId(exerciseId)?.slug ?? ''"
          :equipment="catalog.byId(exerciseId)?.equipment ?? 'bodyweight'"
          :name="exerciseName(catalog.byId(exerciseId)?.slug ?? '')"
        >
          <template #trailing>
            <span class="ex-reps tnum">{{ setSummary(cfg) }}</span>
          </template>
        </ExerciseRow>
      </li>
    </ul>

    <div class="actions">
      <button class="btn-secondary review-back" @click="emit('back')">← Zurück</button>
      <button class="btn-primary review-save" :disabled="!canSave || saving" @click="emit('save')">
        {{ saving ? "Wird gespeichert…" : isEditing ? "Änderungen speichern" : "Routine speichern" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.review-step {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.summary {
  padding: var(--sp4);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.summary b {
  font-size: 18px;
}
.summary span {
  font-size: 12.5px;
  color: var(--dim);
}
.ex-summary {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ex-summary li {
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  font-size: 13px;
}
.ex-summary :deep(.equipment-icon) {
  color: var(--blue-hi);
}
.ex-reps {
  color: var(--dim);
  font-size: 12px;
  flex: none;
}
.actions {
  display: flex;
  gap: var(--sp2);
}
.review-back {
  flex: none;
}
.review-save {
  flex: 1;
}
</style>
