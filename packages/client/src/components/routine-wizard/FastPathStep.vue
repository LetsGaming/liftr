<script setup lang="ts">
/**
 * Engagement-audit-v4 Phase 1 fast path: when a routine is simple (≤4 exercises, still using the
 * default set/rep shape, no supersets — see RoutineWizard.vue's `isFastPathEligible`), Arrange
 * and Review collapse into one condensed screen instead of the full multi-step flow. This is
 * progressive disclosure, not a second parallel mode to maintain: the same eligibility check that
 * puts a routine here also drops it back into the full ArrangeStep the moment anything is
 * customized (a set added, weight changed, a superset linked) via "Alle Details anpassen" below.
 * The three review glance-checks (useRoutineReviewChecks) still run here — the fast path shortens
 * the *screens*, not the trust-gap fix itself.
 */
import { toRef } from "vue";
import { useExerciseName } from "../../composables/useExerciseName";
import { useCatalogStore } from "../../stores/catalogStore";
import { useRoutineReviewChecks, type CoverageState } from "../../composables/useRoutineReviewChecks";
import { equipmentRequirementLabelDe } from "../../lib/equipmentIcons";
import ExerciseRow from "../exercise/ExerciseRow.vue";
import type { DraftExercise } from "./RoutineWizard.vue";

const props = defineProps<{
  name: string;
  entries: [string, DraftExercise][];
  saving: boolean;
  canSave: boolean;
  isEditing: boolean;
  requestedMuscleSlugs: string[];
  suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean; missingEquipment?: string[] }>;
}>();
const emit = defineEmits<{
  move: [from: number, to: number];
  removeExercise: [exerciseId: string];
  addExercise: [];
  customize: [];
  save: [];
}>();

const catalog = useCatalogStore();
const { exerciseName } = useExerciseName();

function setSummary(cfg: DraftExercise): string {
  return cfg.sets.map((s) => (s.weightKg !== null ? `${s.weightKg}×${s.reps}` : `${s.reps}`)).join(" / ");
}

/** "swapped because you don't own X" (Global Constraint) — names the actual equipment instead of
 *  a generic sentence. Falls back to the old generic copy only if the server didn't send a
 *  missing-equipment list (e.g. an older cached suggestion response). */
function substituteReason(exerciseId: string): string {
  const missing = props.suggestionMeta[exerciseId]?.missingEquipment;
  if (!missing || missing.length === 0) {
    return "Ersetzt: bevorzugte Variante braucht Ausrüstung, die du nicht hast.";
  }
  const names = missing.map((m) => equipmentRequirementLabelDe(m as Parameters<typeof equipmentRequirementLabelDe>[0]));
  return `Ersetzt: bevorzugte Variante braucht ${names.join(", ")}, das du nicht hast.`;
}

const { coverage, isLopsided, isSubstitute } = useRoutineReviewChecks(
  toRef(props, "entries"),
  toRef(props, "requestedMuscleSlugs"),
  props.suggestionMeta,
);
const COVERAGE_LABEL: Record<CoverageState, string> = { covered: "abgedeckt", partial: "indirekt", missing: "fehlt" };
</script>

<template>
  <div class="fast-step">
    <ul class="ex-list">
      <li v-for="([exerciseId, cfg], i) in entries" :key="exerciseId">
        <div class="ex-line">
          <div class="reorder">
            <button :disabled="i === 0" aria-label="Nach oben" @click="emit('move', i, i - 1)">▲</button>
            <button :disabled="i === entries.length - 1" aria-label="Nach unten" @click="emit('move', i, i + 1)">▼</button>
          </div>
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
          <button class="remove-btn" aria-label="Entfernen" @click="emit('removeExercise', exerciseId)">🗑</button>
        </div>
        <p v-if="isSubstitute(exerciseId)" class="ex-note">{{ substituteReason(exerciseId) }}</p>
        <p v-if="isLopsided(cfg.sets.length)" class="ex-note">
          Deutlich mehr Sätze als der Rest der Routine — passt das so?
        </p>
      </li>
    </ul>

    <button class="add-exercise-btn" @click="emit('addExercise')">+ Übung hinzufügen</button>

    <div v-if="coverage" class="coverage">
      <span class="eyebrow" style="--eyebrow-color: var(--blue-hi)">Muskelabdeckung</span>
      <div class="coverage-chips">
        <span v-for="c in coverage" :key="c.slug" class="coverage-chip" :class="`cov-${c.state}`">
          {{ c.label }} · {{ COVERAGE_LABEL[c.state] }}
        </span>
      </div>
    </div>

    <button class="customize-btn" @click="emit('customize')">Alle Details anpassen (Sätze, Pausen, Supersets)</button>

    <button class="btn-primary btn-lg" :disabled="!canSave || saving" @click="emit('save')">
      {{ saving ? "Wird gespeichert…" : isEditing ? "Änderungen speichern" : "Routine speichern" }}
    </button>
  </div>
</template>

<style scoped>
.fast-step {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.ex-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.ex-list li {
  padding: var(--sp3);
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.ex-line {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.ex-line :deep(.exercise-row) {
  flex: 1;
}
.reorder {
  display: flex;
  flex-direction: column;
  flex: none;
}
.reorder button {
  width: 24px;
  height: 18px;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 9px;
}
.reorder button:disabled {
  opacity: 0.25;
}
.ex-reps {
  color: var(--dim);
  font-size: 12px;
  flex: none;
}
.remove-btn {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--red);
  font-size: 12px;
}
.ex-note {
  margin-top: 6px;
  padding-left: 4px;
  font-size: 11.5px;
  color: var(--dim);
}
.add-exercise-btn {
  padding: 12px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px dashed var(--line-2);
  color: var(--text);
  font-size: 13.5px;
  font-weight: 700;
}
.coverage {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.coverage-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
}
.coverage-chip {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
}
.coverage-chip.cov-covered {
  border-color: var(--green);
  color: var(--text);
}
.coverage-chip.cov-partial {
  border-color: var(--line-2);
  color: var(--dim);
}
.coverage-chip.cov-missing {
  border-color: var(--fire);
  color: var(--fire-hi);
}
.customize-btn {
  padding: 10px;
  border-radius: var(--r-md);
  background: none;
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 700;
}
</style>
