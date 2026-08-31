<script setup lang="ts">
/**
 * Step 2 — the core rework. One card per selected exercise: thumbnail + name (the "know at a
 * glance what each exercise is" requirement), a drag handle for real reorder, per-set rep rows
 * with large +/- steppers (replaces the old single "3x8" pair + tiny <input type=number>), a
 * superset link toggle between consecutive cards, and remove. "+ Übung hinzufügen" at the
 * bottom returns to the picker without losing the current selection.
 */
import { SET_KIND_BADGE, SET_KIND_LABEL, type SetKind } from "@liftr/shared";
import ExerciseRow from "../exercise/ExerciseRow.vue";
import NumberStepper from "../ui/NumberStepper.vue";
import { useDragReorder } from "../../composables/useDragReorder";
import { useExerciseName } from "../../composables/useExerciseName";
import { useCatalogStore } from "../../stores/catalogStore";
import type { DraftExercise } from "./RoutineWizard.vue";

const props = defineProps<{ entries: [string, DraftExercise][] }>();
const emit = defineEmits<{
  move: [from: number, to: number];
  addSet: [exerciseId: string];
  removeSet: [exerciseId: string, index: number];
  adjustSetReps: [exerciseId: string, index: number, delta: number];
  adjustSetWeight: [exerciseId: string, index: number, delta: number];
  cycleSetKind: [exerciseId: string, index: number];
  adjustRestBetweenSets: [exerciseId: string, delta: number];
  adjustRestAfterExercise: [exerciseId: string, delta: number];
  toggleWeightTracking: [exerciseId: string];
  toggleLink: [exerciseId: string];
  removeExercise: [exerciseId: string];
  addExercise: [];
  continue: [];
}>();

const catalog = useCatalogStore();
const { exerciseName } = useExerciseName();

const { draggingIndex, onPointerDown, styleFor } = useDragReorder((from, to) => emit("move", from, to));

function handleDown(e: PointerEvent, index: number, cardEl: HTMLElement | null) {
  if (!cardEl) return;
  onPointerDown(e, index, props.entries.length, cardEl);
}

function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function kindOf(kind: SetKind | undefined): SetKind {
  return kind ?? "normal";
}
</script>

<template>
  <div class="arrange-step">
    <p class="hint">Ziehe am ≡, um die Reihenfolge zu ändern.</p>

    <div class="cards">
      <div
        v-for="([exerciseId, cfg], i) in entries"
        :key="exerciseId"
        class="card"
        :class="{ dragging: draggingIndex === i }"
        :style="styleFor(i)"
      >
        <div class="card-head">
          <button
            class="drag-handle"
            aria-label="Verschieben"
            @pointerdown="handleDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.card') as HTMLElement)"
          >
            ≡
          </button>
          <ExerciseRow
            :slug="catalog.byId(exerciseId)?.slug ?? ''"
            :equipment="catalog.byId(exerciseId)?.equipment ?? 'bodyweight'"
            :name="exerciseName(catalog.byId(exerciseId)?.slug ?? '')"
          >
            <template #meta>
              <span class="equip">{{ catalog.byId(exerciseId)?.equipment }}</span>
            </template>
          </ExerciseRow>
          <button class="remove-btn" aria-label="Entfernen" @click="emit('removeExercise', exerciseId)">🗑</button>
        </div>

        <div class="set-rows">
          <div v-for="(set, si) in cfg.sets" :key="si" class="set-row">
            <div class="set-label-row">
              <span class="set-label">Satz {{ si + 1 }}</span>
              <!-- Feature: "not possible to set what kind of set this is when creating/editing
                   a routine, not mid workout" — cycles through normal/warmup/failure/dropset,
                   same vocabulary + colors as the live SetKindPicker.vue. -->
              <button
                type="button"
                class="kind-badge"
                :class="`k-${kindOf(set.kind)}`"
                :title="`Satzart: ${SET_KIND_LABEL[kindOf(set.kind)]} — tippen zum Ändern`"
                @click="emit('cycleSetKind', exerciseId, si)"
              >
                {{ SET_KIND_BADGE[kindOf(set.kind)] }}
              </button>
            </div>
            <div class="steppers">
              <NumberStepper
                v-if="set.weightKg !== null"
                size="sm"
                unit="kg"
                label="Gewicht"
                :model-value="set.weightKg"
                @adjust="(d) => emit('adjustSetWeight', exerciseId, si, d)"
              />
              <NumberStepper
                size="sm"
                unit="x"
                label="Wiederholungen"
                :model-value="set.reps"
                @adjust="(d) => emit('adjustSetReps', exerciseId, si, d)"
              />
              <button
                class="set-remove"
                :disabled="cfg.sets.length <= 1"
                aria-label="Satz entfernen"
                @click="emit('removeSet', exerciseId, si)"
              >
                ✕
              </button>
            </div>
          </div>
          <div class="set-actions">
            <button class="add-set-btn" @click="emit('addSet', exerciseId)">+ Satz</button>
            <!-- Always available, not just for bodyweight exercises: a routine created before
                 weight targets existed has weightKg: null on every set regardless of
                 equipment, and this is the only way back to a weight stepper for those. -->
            <button
              v-if="cfg.sets[0]?.weightKg === null"
              class="weight-toggle-btn"
              @click="emit('toggleWeightTracking', exerciseId)"
            >
              {{ catalog.byId(exerciseId)?.isBodyweight ? "+ Zusatzgewicht" : "+ Gewicht" }}
            </button>
            <button v-else class="weight-toggle-btn" @click="emit('toggleWeightTracking', exerciseId)">
              {{ catalog.byId(exerciseId)?.isBodyweight ? "Zusatzgewicht entfernen" : "Gewicht nicht verfolgen" }}
            </button>
          </div>
        </div>

        <!-- Feedback: "adjust the pause, per set and per exercise" — two independent rest
             durations per exercise: between its own sets, and once after its last set (before
             the next exercise starts). Wired through activeWorkoutStore into RestTimer.vue. -->
        <div class="rest-rows">
          <div class="rest-row">
            <span class="rest-label">Pause zwischen Sätzen</span>
            <div class="rest-ctrls">
              <button type="button" aria-label="Weniger Pause zwischen Sätzen" @click="emit('adjustRestBetweenSets', exerciseId, -1)">−</button>
              <span class="tnum">{{ formatRest(cfg.restBetweenSetsSeconds) }}</span>
              <button type="button" aria-label="Mehr Pause zwischen Sätzen" @click="emit('adjustRestBetweenSets', exerciseId, 1)">+</button>
            </div>
          </div>
          <div class="rest-row">
            <span class="rest-label">Pause nach der Übung</span>
            <div class="rest-ctrls">
              <button type="button" aria-label="Weniger Pause nach der Übung" @click="emit('adjustRestAfterExercise', exerciseId, -1)">−</button>
              <span class="tnum">{{ formatRest(cfg.restAfterExerciseSeconds) }}</span>
              <button type="button" aria-label="Mehr Pause nach der Übung" @click="emit('adjustRestAfterExercise', exerciseId, 1)">+</button>
            </div>
          </div>
        </div>

        <div v-if="i < entries.length - 1" class="link-block">
          <button
            class="link-btn"
            :class="{ active: cfg.linkNext }"
            :title="'Superset: kein Pausentimer zwischen dieser und der nächsten Übung — nur nach der ganzen Runde.'"
            @click="emit('toggleLink', exerciseId)"
          >
            {{ cfg.linkNext ? "🔗 Superset aktiv" : "🔗 Als Superset mit nächster Übung" }}
          </button>
          <p v-if="cfg.linkNext" class="link-hint">
            Kein Pausentimer nach dieser Übung — er startet erst nach der nächsten.
          </p>
        </div>
      </div>
    </div>

    <button class="add-exercise-btn" @click="emit('addExercise')">+ Übung hinzufügen</button>

    <button class="btn-primary btn-lg" :disabled="entries.length === 0" @click="emit('continue')">Weiter →</button>
  </div>
</template>

<style scoped>
.arrange-step {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.hint {
  font-size: 12.5px;
  color: var(--dim);
}
.cards {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  position: relative;
}
.card {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  padding: var(--sp4);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  transition: transform 120ms ease;
}
.card.dragging {
  box-shadow: var(--shadow);
  border-color: var(--line-2);
}
.card-head {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.drag-handle {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 16px;
  touch-action: none;
  cursor: grab;
}
.card-head :deep(.exercise-row) {
  flex: 1;
}
.equip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dim);
  text-transform: capitalize;
}
.remove-btn {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--red);
  font-size: 13px;
}
.set-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.set-rows .set-row:not(:last-child) {
  padding-bottom: var(--sp2);
  border-bottom: 1px solid var(--line);
}
.set-actions {
  display: flex;
  gap: var(--sp2);
  flex-wrap: wrap;
  margin-top: 2px;
}
.weight-toggle-btn {
  font-size: 12px;
  color: var(--dim);
  background: var(--surface-3);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 6px 10px;
}
/* Mobile-first: label on its own line, then the stepper row below — two steppers + remove
   side-by-side with a label sharing the same row got cramped on a phone-width card. */
.set-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.set-label-row {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.set-label {
  font-size: 12.5px;
  color: var(--dim);
}
.kind-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 800;
  flex: none;
  background: var(--surface-3);
  color: var(--text);
  border: 1px solid var(--line);
}
.kind-badge.k-warmup {
  background: var(--fire);
  color: var(--k-warmup-text);
  border-color: transparent;
}
.kind-badge.k-normal {
  background: var(--surface-3);
  color: var(--dim);
}
.kind-badge.k-failure {
  background: var(--red);
  color: var(--k-failure-text);
  border-color: transparent;
}
.kind-badge.k-dropset {
  background: var(--plat-3);
  color: var(--k-dropset-text);
  border-color: transparent;
}
.set-row .steppers {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.set-remove {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: none;
  border: none;
  color: var(--faint);
  font-size: 12px;
}
.set-remove:disabled {
  opacity: 0.3;
}
.add-set-btn {
  align-self: flex-start;
  font-size: 12px;
  color: var(--dim);
  background: var(--surface-3);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 6px 10px;
  margin-top: 2px;
}
.rest-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  padding-top: var(--sp2);
  border-top: 1px solid var(--line);
}
.rest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp2);
}
.rest-label {
  font-size: 12.5px;
  color: var(--dim);
}
.rest-ctrls {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  background: var(--surface-3);
  border-radius: var(--r-md);
  padding: 4px;
  flex: none;
}
.rest-ctrls button {
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
}
.rest-ctrls span {
  min-width: 34px;
  text-align: center;
  font-weight: 700;
  font-size: 13px;
}
.link-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.link-btn {
  font-size: 11.5px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
}
.link-hint {
  font-size: 11px;
  color: var(--dim);
  padding: 0 4px;
}
.link-btn.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 700;
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
</style>
