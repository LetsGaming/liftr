<script setup lang="ts">
/**
 * The "not started" planning surface: saved-routine cards (start, mesocycle reveal,
 * edit/duplicate/delete via the ⋮ menu), the first-timer empty state, and the Quick Start
 * fallback. No props/emits: every dependency below is a Pinia store or a composable that
 * already instantiates its own store references, so this mounts standalone.
 */
import AppIcon from "../ui/AppIcon.vue";
import MuscleFigure from "../ui/MuscleFigure.vue";
import NumberStepper from "../ui/NumberStepper.vue";
import RoutineWizard from "../routine-wizard/RoutineWizard.vue";
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
import { useRouter } from "vue-router";

const catalog = useCatalogStore();
const routineStore = useRoutineStore();
const store = useActiveWorkoutStore();
const { toast } = useToast();
const { starting, quickStart, exerciseName } = useStartRoutine();
const router = useRouter();

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
  /* reorder()'s own `await this.load()` never runs if the Promise.all of PATCH requests inside
     it rejects, so a failed request would leave the UI silently out of sync with the server with
     no user feedback. Surface the failure and force a resync so the list can't stay stale. */
  routineStore.reorder(ids).catch(() => {
    toast("Sortierung konnte nicht gespeichert werden.");
    void routineStore.load();
  });
});

function handleDragDown(e: PointerEvent, index: number, cardEl: HTMLElement | null) {
  if (!cardEl) return;
  onPointerDown(e, index, routineStore.routines.length, cardEl);
}

/** useDragReorder's own doc comment says it's built for "one list, vertical only" — its
 *  translateY math assumes a single itemHeight step per index, with no concept of column-wrap.
 *  .routine-grid switches from single-column to a genuine multi-column grid at the same 900px
 *  breakpoint used below (see the `@media (min-width: 900px)` rule on .routine-grid in <style>),
 *  so dragging across a row boundary at desktop widths would compute the wrong displaced-card
 *  offsets and resolve to the wrong target index. Rather than teaching the shared composable
 *  about column-wrap (it's also used by ArrangeStep.vue's single-column wizard list), gate the
 *  drag handle here: only render/wire it when the grid is single-column. All other card actions
 *  (start, ⋮ menu, mesocycle controls) are unaffected at any width. */
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
    <div class="not-started">
      <div v-if="routineStore.routines.length > 0" class="routine-grid">
        <div
          v-for="(routine, i) in routineStore.routines"
          :key="routine.id"
          class="routine-card surface-hybrid"
          :class="{ dragging: draggingIndex === i }"
          :style="styleFor(i)"
          role="button"
          tabindex="0"
          @click="openOverview(routine.id)"
          @keydown.enter="openOverview(routine.id)"
        >
          <div class="rc-head">
            <!-- Restricted to the single-column (mobile) layout — see canDragReorder above:
                 useDragReorder's vertical-only math would misbehave once the grid wraps into
                 multiple columns at >=900px. @click.stop so grabbing the handle doesn't also
                 fire the card's own navigate-to-overview tap. -->
            <button
              v-if="canDragReorder"
              class="rc-drag-handle"
              aria-label="Verschieben"
              @pointerdown="handleDragDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.routine-card') as HTMLElement)"
              @click.stop
            >
              <AppIcon name="drag-handle" />
            </button>
            <b>{{ routine.name }}</b>
            <span v-if="routine.mesocycle" class="meso-badge">
              Woche {{ routine.mesocycle.currentWeek }}/{{ routine.mesocycle.totalWeeks }} ·
              {{ routine.mesocycle.weekPercents[routine.mesocycle.currentWeek - 1] }}%
            </span>
          </div>
          <!-- Exercise names + aggregated muscle figure — the same data the finish summary
               shows, surfaced here so what a routine trains is visible before starting it. -->
          <div class="rc-preview">
            <ul class="rc-ex-list">
              <li v-for="re in routine.routineExercises.slice(0, 4)" :key="re.id">{{ routineExerciseName(re.exerciseId) }}</li>
              <li v-if="routine.routineExercises.length > 4" class="rc-ex-more">+{{ routine.routineExercises.length - 4 }} weitere</li>
            </ul>
            <MuscleFigure class="rc-muscles" :size="52" v-bind="routineMuscles(routine)" />
          </div>
          <span class="rc-count">{{ routine.routineExercises.length }} {{ routine.routineExercises.length === 1 ? "Übung" : "Übungen" }}</span>

          <!-- The card navigates to the Routine Overview screen on tap (openOverview() above),
               whose sticky "Jetzt starten" button is the quick-start path. @click.stop below so
               the ⋮ menu/edit/duplicate/mesocycle/delete controls don't also trigger it. -->
          <div class="rc-actions" @click.stop>
            <div class="rc-menu-wrap">
              <button class="rc-menu-btn" aria-label="Mehr" @click="toggleMenu(routine.id)"><AppIcon name="more" /></button>
              <div v-if="openMenuId === routine.id" class="rc-menu">
                <button @click="editRoutine(routine); openMenuId = null"><AppIcon name="edit" /> Bearbeiten</button>
                <button @click="duplicateRoutine(routine)">Duplizieren</button>
                <button v-if="routine.mesocycle" @click="routineStore.endMesocycle(routine.id); openMenuId = null">
                  Mesozyklus beenden
                </button>
                <button v-else @click="toggleMesoForm(routine.id); openMenuId = null">+ Mesozyklus</button>
                <button
                  class="danger"
                  :class="{ confirming: deleteConfirm.isArmed(routine.id) }"
                  @click="deleteConfirm.trigger(routine.id)"
                >
                  {{ deleteConfirm.isArmed(routine.id) ? "Wirklich löschen?" : "Löschen" }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="mesoFormRoutineId === routine.id" class="meso-form" @click.stop>
            <NumberStepper size="sm" :model-value="mesoWeeksInput.get(routine.id) ?? 4" @adjust="(d) => adjustMesoWeeks(routine.id, d)" />
            <span>Wochen</span>
            <button class="btn-secondary" @click="startMesocycle(routine.id)">Starten</button>
          </div>
        </div>
      </div>
      <!-- First-timer empty state: same bordered-surface pattern as ErholungszoneCard.vue
           (eyebrow + primary CTA), not a bare sentence. -->
      <div v-else class="routine-empty surface-hybrid">
        <div class="eyebrow routine-empty-eyebrow">Noch keine Routine</div>
        <p class="routine-empty-copy">
          Eine Routine ist dein fester Trainingsplan — welche Übungen, in welcher Reihenfolge, mit welchen Zielen. Sie ist
          der Ausgangspunkt für alles hier: dein Rang wächst pro Übung erst, wenn du sie wiederholt trainierst, und dafür
          braucht es diese feste Struktur. Leg dir eine Routine an, dann kannst du ab dem nächsten Training direkt starten.
        </p>
        <button class="btn-primary btn-block routine-empty-cta" @click="showBuilder = true">+ Neue Routine</button>
      </div>

      <button v-if="routineStore.routines.length > 0" class="btn-secondary" @click="showBuilder = true">+ Neue Routine</button>
      <RoutineWizard v-if="showBuilder" :routine="editingRoutine" @created="onRoutineCreated" />

      <!-- `btn-block` matches this button's width to its siblings (the empty-state card,
           "+ Neue Routine"), both `width: 100%`, inside `.not-started`'s `align-items:
           flex-start` — without it this button would hug the left edge instead of aligning. -->
      <button class="btn-primary btn-lg btn-block" :disabled="starting || quickStartExercises.length === 0" @click="quickStart">
        {{ starting ? "Wird gestartet…" : "Ohne Routine loslegen · die ersten 4 Übungen" }}
      </button>
    </div>
</template>

<style scoped>
.not-started {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
  align-items: flex-start;
  /* With few/no routines, unconstrained content pins at the top of the scroll area, leaving
     primary CTAs (Starten / + Neue Routine) above the thumb-reachable lower half of the screen.
     min-height + centering pulls a short list toward mid-screen; a long routine list simply
     exceeds this min-height and scrolls as normal. */
  min-height: 55vh;
  justify-content: center;
}
/* Zero-routine empty state — same bordered-surface treatment as ErholungszoneCard.vue's
   .erholungszone, not a bare sentence. Width-capped and self-contained like .finished-summary
   so it doesn't stretch edge-to-edge on wide viewports. */
.routine-empty {
  width: 100%;
  max-width: var(--content-w-narrow);
  border-radius: var(--r-xl);
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.routine-empty-eyebrow {
  --eyebrow-color: var(--blue-hi);
}
.routine-empty-copy {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
}
.routine-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sp3);
  width: 100%;
  max-width: var(--content-w-wide);
}
/* Desktop cards run wider and bigger rather than staying conservatively narrow — wider cap,
   fewer/bigger cards per row, roomier gap and padding. */
@media (min-width: 900px) {
  .routine-grid {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--sp5);
    max-width: var(--content-w-xwide);
  }
}
.routine-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  padding: var(--sp4);
  border-radius: var(--r-lg);
  /* Tier-accent border, same fallback idiom as RankDistributionDonut.vue/RankUpCalendar.vue/
     RestTimer.vue — ties this high-frequency screen to the rank spine without misrepresenting
     an unranked routine as an earned moment (no .panel-reward gradient, no muscle-derived color).
     Layered as an `outline` on top of .surface-hybrid's own background/blur/shadow/hairline
     rather than replacing them — falls back to transparent, not --line, since the hairline edge
     already supplies the neutral case. */
  outline: 1px solid var(--tier-accent, transparent);
  outline-offset: -1px;
  position: relative;
  /* Entrance stagger + hover lift — this is the "choose a workout" screen, so it gets the same
     liveliness as the dashboard. Uses --ease-out, not --ease-spring: motion.css reserves the
     overshoot easing for earned moments (rank-up, PR, level-up), and a routine list entrance
     isn't one of those. */
  /* Fill-mode `backwards`, not `both`: a CSS animation's fill state
     takes precedence over the cascade, including inline `style` attributes, for as long as it
     applies. `both` would keep applying pop-in's `to { transform: scale(1) }` forever after the
     animation ends, permanently overriding useDragReorder's inline `transform: translateY(...)`
     on this same element and making drag-reorder visually inert. `backwards` only fills the
     *pre-start* state (opacity:0, scale:0.9) during the stagger delay above — once the animation
     ends it applies nothing, so the element falls through to its own inline/cascade styles
     exactly like the un-animated default (pop-in's `to` state is opacity:1/scale(1), i.e. no
     lasting visual change either way, so this is safe). */
  animation: pop-in var(--dur-base) var(--ease-out) backwards;
  transition:
    box-shadow var(--dur-base) var(--ease-out),
    transform 180ms ease;
}
/* Eased transform for displaced cards while a drag is in progress; the dragged card itself gets
   `transition: none` inline from useDragReorder's styleFor() so it tracks the pointer with no
   lag. */
.routine-card.dragging {
  transition: none;
}
.routine-grid > .routine-card:nth-child(1) {
  animation-delay: 0ms;
}
.routine-grid > .routine-card:nth-child(2) {
  animation-delay: 40ms;
}
.routine-grid > .routine-card:nth-child(3) {
  animation-delay: 80ms;
}
.routine-grid > .routine-card:nth-child(n + 4) {
  animation-delay: 120ms;
}
@media (hover: hover) {
  .routine-card:hover {
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.6);
  }
}
@media (min-width: 900px) {
  .routine-card {
    padding: var(--sp6);
    gap: var(--sp3);
    border-radius: var(--r-xl);
  }
  .rc-head b {
    font-size: 18px;
  }
  .en {
    font-size: 13px;
  }
}
.rc-head {
  display: flex;
  /* `center`, not `baseline`: baseline sits the 44px-tall drag handle's box awkwardly against
     the single-line routine name instead of vertically centering the two, and `center` reads
     correctly whether or not the handle/meso-badge are present. */
  align-items: center;
  justify-content: space-between;
  gap: var(--sp2);
}
.rc-head b {
  font-size: 15.5px;
  /* With the drag handle as first child and no mesocycle badge (the common case),
     `space-between` on .rc-head has only two children to split apart, pushing the name flush to
     the right edge instead of next to the handle. flex:1 makes the name claim the remaining
     space so trailing content (badge, or nothing) sits at the end. */
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* Same visual pattern as ArrangeStep.vue's .drag-handle, sized to the 44px touch-target floor
   used elsewhere on this card (.rc-menu-btn), since this card lives on a primary mobile-first
   screen (unlike the wizard's 32px handle). */
.rc-drag-handle {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 16px;
  touch-action: none;
  cursor: grab;
}
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
.rc-count {
  font-size: 12px;
  color: var(--dim);
}
.meso-badge {
  color: var(--blue-hi);
  font-weight: 700;
  font-size: 11px;
  flex: none;
}
/* The card itself navigates to the Routine Overview screen on tap; only the ⋮ menu lives here,
   so it sits flush right. */
.rc-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp2);
  margin-top: var(--sp2);
}
.rc-menu-wrap {
  position: relative;
  flex: none;
}
.rc-menu-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 16px;
}
.rc-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.rc-menu button {
  padding: 10px 14px;
  text-align: left;
  font-size: 13px;
  color: var(--text);
  background: none;
  border: none;
}
.rc-menu button:hover {
  background: var(--surface-2);
}
.rc-menu button.danger {
  color: var(--red);
}
.rc-menu button.danger.confirming {
  background: var(--red-lo);
  color: var(--text);
  font-weight: 700;
}
.meso-form {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dim);
}
@media (min-width: 900px) {
  .not-started {
    align-items: center;
    width: 100%;
  }
}
</style>
