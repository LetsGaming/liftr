<script setup lang="ts">
/** Step 3 — quick summary + save, plus (engagement-audit-v4 Phase 1) three additive glance-checks
 *  that make this worth actually looking at instead of a rubber-stamp: does the routine cover the
 *  muscles you asked for, did the generator swap in a substitute because you lack equipment, and
 *  does one exercise carry a lopsided share of the routine's sets. None of them block Save — they
 *  inform, they don't gate (audit's explicit "no compliance-theater" constraint). Name stays
 *  editable via the wizard's persistent header field. */
import { computed, toRef } from "vue";
import { useExerciseName } from "../../composables/useExerciseName";
import { useCatalogStore } from "../../stores/catalogStore";
import { useRoutineReviewChecks, type CoverageState } from "../../composables/useRoutineReviewChecks";
import { equipmentRequirementLabelDe } from "../../lib/equipmentIcons";
import ExerciseRow from "../exercise/ExerciseRow.vue";
import type { DraftExercise } from "./RoutineWizard.vue";

const props = defineProps<{
  name: string;
  entries: [string, DraftExercise][];
  totalSets: number;
  saving: boolean;
  canSave: boolean;
  isEditing: boolean;
  /** Muscle slugs the user asked "Übungen vorschlagen" for — empty for a fully manual routine,
   *  which skips the coverage check entirely (nothing to compare the routine against). */
  requestedMuscleSlugs: string[];
  /** Keyed by exerciseId; absent for manually-picked exercises. */
  suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean; missingEquipment?: string[] }>;
}>();
const emit = defineEmits<{ back: []; save: [] }>();

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
  <div class="review-step">
    <div class="summary">
      <b>{{ name || "Unbenannte Routine" }}</b>
      <span>{{ entries.length }} {{ entries.length === 1 ? "Übung" : "Übungen" }} · {{ totalSets }} Sätze</span>
    </div>

    <div v-if="coverage" class="coverage">
      <span class="eyebrow" style="--eyebrow-color: var(--blue-hi)">Muskelabdeckung</span>
      <div class="coverage-chips">
        <span v-for="c in coverage" :key="c.slug" class="coverage-chip" :class="`cov-${c.state}`">
          {{ c.label }} · {{ COVERAGE_LABEL[c.state] }}
        </span>
      </div>
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
        <p v-if="isSubstitute(exerciseId)" class="ex-note">{{ substituteReason(exerciseId) }}</p>
        <p v-if="isLopsided(cfg.sets.length)" class="ex-note">
          Deutlich mehr Sätze als der Rest der Routine — passt das so?
        </p>
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
.ex-note {
  margin-top: 4px;
  padding-left: 4px;
  font-size: 11.5px;
  color: var(--dim);
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
