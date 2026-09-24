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
import AppIcon from "../base/AppIcon.vue";
import NumberStepper from "../patterns/NumberStepper.vue";
import Chip from "../base/Chip.vue";
import Button from "../base/Button.vue";
import IconButton from "../patterns/IconButton.vue";
import { useDragReorder } from "../../composables/useDragReorder";
import { useExerciseName } from "../../composables/useExerciseName";
import { formatClock } from "../../lib/format";
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

function kindOf(kind: SetKind | undefined): SetKind {
  return kind ?? "normal";
}

const KIND_CHIP_VARIANT: Record<SetKind, "neutral" | "fire" | "danger" | "accent"> = {
  normal: "neutral",
  warmup: "fire",
  failure: "danger",
  dropset: "accent",
};
</script>

<template>
  <div class="arrange-step">
    <p class="hint">Ziehe am Griff, um die Reihenfolge zu ändern.</p>

    <div class="cards">
      <div
        v-for="([exerciseId, cfg], i) in entries"
        :key="exerciseId"
        class="card surface-hybrid"
        :class="{ dragging: draggingIndex === i }"
        :style="styleFor(i)"
      >
        <div class="card-head">
          <button
            class="drag-handle-btn wizard-drag-handle"
            aria-label="Verschieben"
            @pointerdown="handleDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.card') as HTMLElement)"
          >
            <AppIcon name="drag-handle" />
          </button>
          <ExerciseRow
            :slug="catalog.byId(exerciseId)?.slug ?? ''"
            :equipment="catalog.byId(exerciseId)?.equipment ?? 'bodyweight'"
            :name="exerciseName(catalog.byId(exerciseId)?.slug ?? '', catalog.byId(exerciseId)?.name)"
          >
            <template #meta>
              <span class="equip">{{ catalog.byId(exerciseId)?.equipment }}</span>
            </template>
          </ExerciseRow>
          <IconButton icon="trash" label="Entfernen" size="sm" variant="danger" class="remove-btn" @click="emit('removeExercise', exerciseId)" />
        </div>

        <div class="set-rows">
          <div v-for="(set, si) in cfg.sets" :key="si" class="set-row">
            <div class="set-label-row">
              <span class="set-label">Satz {{ si + 1 }}</span>
              <Chip
                as="button"
                size="sm"
                class="kind-badge"
                :variant="KIND_CHIP_VARIANT[kindOf(set.kind)]"
                :title="`Satzart: ${SET_KIND_LABEL[kindOf(set.kind)]} — tippen zum Ändern`"
                @click="emit('cycleSetKind', exerciseId, si)"
              >
                {{ SET_KIND_BADGE[kindOf(set.kind)] }}
              </Chip>
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
                <AppIcon name="close" />
              </button>
            </div>
          </div>
          <div class="set-actions">
            <button class="add-set-btn" @click="emit('addSet', exerciseId)">+ Satz</button>
            <button
              v-if="cfg.sets[0]?.weightKg === null"
              class="weight-toggle-btn"
              @click="emit('toggleWeightTracking', exerciseId)"
            >
              {{ catalog.byId(exerciseId)?.isBodyweight ? "+ Zusatzgewicht" : "+ Gewicht" }}
            </button>
            <button v-else class="weight-toggle-btn" @click="emit('toggleWeightTracking', exerciseId)">
              {{ catalog.byId(exerciseId)?.isBodyweight ? "Zusatzgewicht entfernen" : "Ohne Gewicht loggen" }}
            </button>
          </div>
        </div>

        <div class="rest-rows">
          <div class="rest-row">
            <span class="rest-label">Pause zwischen Sätzen</span>
            <div class="rest-ctrls">
              <button type="button" aria-label="Weniger Pause zwischen Sätzen" @click="emit('adjustRestBetweenSets', exerciseId, -1)">−</button>
              <span class="tnum">{{ formatClock(cfg.restBetweenSetsSeconds) }}</span>
              <button type="button" aria-label="Mehr Pause zwischen Sätzen" @click="emit('adjustRestBetweenSets', exerciseId, 1)">+</button>
            </div>
          </div>
          <div class="rest-row">
            <span class="rest-label">Pause nach der Übung</span>
            <div class="rest-ctrls">
              <button type="button" aria-label="Weniger Pause nach der Übung" @click="emit('adjustRestAfterExercise', exerciseId, -1)">−</button>
              <span class="tnum">{{ formatClock(cfg.restAfterExerciseSeconds) }}</span>
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
            <AppIcon name="link" /> {{ cfg.linkNext ? "Superset aktiv" : "Als Superset mit nächster Übung" }}
          </button>
          <p v-if="cfg.linkNext" class="link-hint">
            Kein Pausentimer nach dieser Übung — er startet erst nach der nächsten.
          </p>
        </div>
      </div>
    </div>

    <button class="add-exercise-btn" @click="emit('addExercise')">+ Übung hinzufügen</button>

    <Button size="lg" :disabled="entries.length === 0" @click="emit('continue')">Weiter →</Button>
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
  transition: transform 120ms ease;
}
.card.dragging {
  box-shadow: var(--shadow);
  outline: 1px solid var(--line-2);
  outline-offset: -1px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
/* This wizard step isn't the primary mobile-first screen the shared drag-handle-btn's 44px
   touch-target floor is sized for (styles/list-card.css) — shrink it here to 32px. */
.wizard-drag-handle {
  --drag-handle-size: 32px;
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
