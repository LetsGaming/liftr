<script setup lang="ts">
/**
 * The "not started" planning surface: saved-routine cards (start, mesocycle reveal,
 * edit/duplicate/delete via the ⋮ menu), the first-timer empty state, and the Quick Start
 * fallback. No props/emits: every dependency below is a Pinia store or a composable that
 * already instantiates its own store references, so this mounts standalone.
 */
import AppIcon from "../base/AppIcon.vue";
import CardGrid from "../patterns/CardGrid.vue";
import CardListScreen from "../patterns/CardListScreen.vue";
import EmptyStateCard from "../patterns/EmptyStateCard.vue";
import ListCard from "../patterns/ListCard.vue";
import MuscleFigure from "../exercise/MuscleFigure.vue";
import NumberStepper from "../patterns/NumberStepper.vue";
import RoutineWizard from "./RoutineWizard.vue";
import Chip from "../base/Chip.vue";
import Button from "../base/Button.vue";
import IconButton from "../patterns/IconButton.vue";
import { useCatalogStore } from "../../stores/catalogStore";
import { useRoutineStore, type Routine } from "../../stores/routineStore";
import { useMesocycleControls } from "../../composables/useMesocycleControls";
import { useRoutineManagement } from "../../composables/useRoutineManagement";
import { useStartRoutine } from "../../composables/useStartRoutine";
import { useActiveWorkoutStore } from "../../stores/activeWorkoutStore";
import { useDragReorder } from "../../composables/useDragReorder";
import { useToast } from "../../composables/useToast";
import { aggregateMuscles } from "../../lib/muscles";
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

const { t } = useI18n();
const catalog = useCatalogStore();
const routineStore = useRoutineStore();
const store = useActiveWorkoutStore();
const { toast } = useToast();
const { starting, startRoutine, quickStart, exerciseName } = useStartRoutine();
const router = useRouter();

/** Mirrors RoutineOverviewPage.vue's jetztStarten(): startRoutine() itself never navigates, so
 *  the card's own "Starten" button is responsible for getting to the workout screen once the
 *  routine is actually active. `replace`, not `push` — see that page's own comment on why. */
async function startFromCard(routine: Routine) {
  await startRoutine(routine);
  await router.replace("/workout");
}

/** Tapping a routine card opens the Routine Overview screen instead of starting the routine
 *  immediately — that screen's own sticky "Jetzt starten" button is the quick-start path, so
 *  this card doesn't need its own inline shortcut. */
function openOverview(routineId: string) {
  void router.push(`/routines/${routineId}`);
}

const { openMenuId, editingRoutine, showBuilder, deleteConfirm, toggleMenu, editRoutine, duplicateRoutine, onRoutineCreated } =
  useRoutineManagement(routineStore);

const { mesoFormRoutineId, mesoWeeksInput, toggleMesoForm, startMesocycle, adjustMesoWeeks } = useMesocycleControls(store, routineStore);

/** Aggregates muscles across a routine's planned exercises (mirrors the same aggregation used
 *  for an active session) so the card can show what a routine trains before starting it. */
function routineMuscles(routine: Routine) {
  return aggregateMuscles(routine.routineExercises.map((re) => catalog.byId(re.exerciseId)?.muscles ?? []));
}

function routineExerciseName(exerciseId: string): string {
  const ex = catalog.byId(exerciseId);
  return ex ? exerciseName(ex.slug, ex.name) : "";
}

const quickStartExercises = computed(() => catalog.exercises.slice(0, 4));

/** Drag-to-reorder, using the same composable as ArrangeStep.vue's wizard-step reordering.
 *  Reorders routineStore.routines locally to compute the new id order, then persists via
 *  routineStore.reorder(), which reloads from the server rather than trusting this client-side
 *  splice as the final word. */
const { draggingIndex, onPointerDown, styleFor } = useDragReorder((from, to) => {
  const ids = routineStore.routines.map((r) => r.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved!);
  /* reorder()'s own reload never runs if its PATCH requests reject, which would leave the UI
     silently out of sync. Surface the failure and force a resync so the list can't stay stale. */
  routineStore.reorder(ids).catch(() => {
    toast(t("routine.routineList.reorderFailed"));
    void routineStore.load();
  });
});

function handleDragDown(e: PointerEvent, index: number, cardEl: HTMLElement | null) {
  if (!cardEl) return;
  onPointerDown(e, index, routineStore.routines.length, cardEl);
}

/** useDragReorder is built for "one list, vertical only" — its translateY math assumes one
 *  itemHeight step per index, with no concept of column-wrap. .card-grid switches to a
 *  multi-column grid at the same 900px breakpoint used below, so dragging across a row boundary
 *  at desktop widths would resolve to the wrong target index. Rather than teaching the shared
 *  composable about column-wrap (it's also used by ArrangeStep.vue's single-column list), gate
 *  the drag handle here: only render/wire it when the grid is single-column. */
const dragReorderBreakpoint = "(min-width: 900px)";
const isDesktopGrid = ref(typeof window !== "undefined" ? window.matchMedia(dragReorderBreakpoint).matches : false);
let dragBreakpointMql: MediaQueryList | null = null;
if (typeof window !== "undefined") {
  dragBreakpointMql = window.matchMedia(dragReorderBreakpoint);
  const syncIsDesktopGrid = (e: MediaQueryListEvent | MediaQueryList) => {
    isDesktopGrid.value = e.matches;
  };
  dragBreakpointMql.addEventListener("change", syncIsDesktopGrid);
  onBeforeUnmount(() => dragBreakpointMql?.removeEventListener("change", syncIsDesktopGrid));
}
const canDragReorder = computed(() => !isDesktopGrid.value);
</script>

<template>
    <CardListScreen>
      <CardGrid v-if="routineStore.routines.length > 0">
        <ListCard
          v-for="(routine, i) in routineStore.routines"
          :key="routine.id"
          :dragging="draggingIndex === i"
          :drag-style="styleFor(i)"
          :title="routine.name"
          @open="openOverview(routine.id)"
        >
          <template v-if="canDragReorder" #drag-handle>
            <button
              class="drag-handle-btn"
              :aria-label="t('routine.routineList.moveAriaLabel')"
              @pointerdown="handleDragDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.card') as HTMLElement)"
              @click.stop
            >
              <AppIcon name="drag-handle" />
            </button>
          </template>
          <template v-if="routine.mesocycle" #badge>
            <Chip variant="accent" size="sm" class="meso-badge">
              {{
                t("routine.routineList.mesocycleBadge", {
                  week: routine.mesocycle.currentWeek,
                  total: routine.mesocycle.totalWeeks,
                  percent: routine.mesocycle.weekPercents[routine.mesocycle.currentWeek - 1],
                })
              }}
            </Chip>
          </template>
          <template #menu>
            <IconButton icon="more" :label="t('routine.routineList.moreAriaLabel')" @click="toggleMenu(routine.id)" />
            <div v-if="openMenuId === routine.id" class="card-menu">
              <button @click="editRoutine(routine); openMenuId = null"><AppIcon name="edit" /> {{ t("routine.routineList.edit") }}</button>
              <button @click="duplicateRoutine(routine)">{{ t("routine.routineList.duplicate") }}</button>
              <button v-if="routine.mesocycle" @click="routineStore.endMesocycle(routine.id); openMenuId = null">
                {{ t("routine.routineList.endMesocycle") }}
              </button>
              <button v-else @click="toggleMesoForm(routine.id); openMenuId = null">{{ t("routine.routineList.addMesocycle") }}</button>
              <button
                class="danger"
                :class="{ confirming: deleteConfirm.isArmed(routine.id) }"
                @click="deleteConfirm.trigger(routine.id)"
              >
                {{ deleteConfirm.isArmed(routine.id) ? t("routine.routineList.deleteConfirm") : t("routine.routineList.delete") }}
              </button>
            </div>
          </template>

          <div class="rc-preview">
            <ul class="rc-ex-list">
              <li v-for="re in routine.routineExercises.slice(0, 4)" :key="re.id">{{ routineExerciseName(re.exerciseId) }}</li>
              <li v-if="routine.routineExercises.length > 4" class="rc-ex-more">{{ t("routine.routineList.moreExercises", { n: routine.routineExercises.length - 4 }) }}</li>
            </ul>
            <MuscleFigure class="rc-muscles" :size="52" v-bind="routineMuscles(routine)" />
          </div>

          <template #meta>{{ t("common.exerciseCount", routine.routineExercises.length) }}</template>

          <template #actions>
            <Button variant="secondary" :disabled="starting" @click="startFromCard(routine)">{{ t("routine.routineList.start") }}</Button>
          </template>

          <template v-if="mesoFormRoutineId === routine.id" #footer>
            <div class="meso-form" @click.stop>
              <NumberStepper size="sm" :model-value="mesoWeeksInput.get(routine.id) ?? 4" @adjust="(d) => adjustMesoWeeks(routine.id, d)" />
              <span>{{ t("routine.routineList.mesoWeeksLabel") }}</span>
              <Button variant="secondary" @click="startMesocycle(routine.id)">{{ t("routine.routineList.start") }}</Button>
            </div>
          </template>
        </ListCard>
      </CardGrid>
      <EmptyStateCard v-else :eyebrow="t('routine.routineList.emptyState.eyebrow')">
        {{ t("routine.routineList.emptyState.body") }}
        <template #action>
          <Button block @click="showBuilder = true">{{ t("routine.routineList.addRoutine") }}</Button>
        </template>
      </EmptyStateCard>

      <Button v-if="routineStore.routines.length > 0" variant="secondary" @click="showBuilder = true">{{ t("routine.routineList.addRoutine") }}</Button>
      <RoutineWizard v-if="showBuilder" :routine="editingRoutine" @created="onRoutineCreated" />

      <Button size="lg" block :disabled="starting || quickStartExercises.length === 0" @click="quickStart">
        {{ starting ? t("routine.routineList.quickStart.starting") : t("routine.routineList.quickStart.cta") }}
      </Button>
    </CardListScreen>
</template>

<style scoped>
.rc-preview {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.rc-ex-list {
  flex: 1;
  min-width: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--dim);
}
.rc-ex-list li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-ex-more {
  color: var(--faint);
  font-style: italic;
}
.rc-muscles {
  flex: none;
}
.meso-form {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dim);
}
</style>
