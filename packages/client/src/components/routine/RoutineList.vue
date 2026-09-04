<script setup lang="ts">
/**
 * The "not started" planning-desk surface: saved-routine cards (one-tap start, mesocycle reveal,
 * edit/duplicate/delete via the ⋮ menu), the first-timer empty state, and the Quick Start
 * fallback. Extracted out of WorkoutPage.vue (Workstream C, 2026-09-03) so this workstream's
 * plan/routines file boundary doesn't overlap Workstream A's ownership of the active-workout
 * logging loop in that file — see docs/superpowers/plans/2026-09-03-workstream-c-plan-routines.md
 * Task 5 for the coordination note. Zero props/emits: every dependency below is a Pinia store or
 * a composable that already instantiates its own store references, so this mounts standalone.
 */
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

const catalog = useCatalogStore();
const routineStore = useRoutineStore();
const store = useActiveWorkoutStore();
const { toast } = useToast();
const { starting, startRoutine, quickStart, exerciseName } = useStartRoutine();

const { openMenuId, editingRoutine, showBuilder, deleteConfirm, toggleMenu, editRoutine, duplicateRoutine, onRoutineCreated } =
  useRoutineManagement(routineStore);

const { mesoFormRoutineId, mesoWeeksInput, toggleMesoForm, startMesocycle, adjustMesoWeeks } = useMesocycleControls(store, routineStore);

/** Same aggregation, over a *routine's* planned exercises rather than an active session's —
 *  feeds the routine card's muscle preview so "what does this train" is answerable before
 *  starting, not just after finishing (previously only shown on the finish summary). */
function routineMuscles(routine: Routine) {
  return aggregateMuscles(routine.routineExercises.map((re) => catalog.byId(re.exerciseId)?.muscles ?? []));
}

function routineExerciseName(exerciseId: string): string {
  const ex = catalog.byId(exerciseId);
  return ex ? exerciseName(ex.slug, ex.name) : "";
}

const quickStartExercises = computed(() => catalog.exercises.slice(0, 4));

/** Drag-to-reorder (plan C §3 Phase 3) — same composable/pattern already proven in
 *  ArrangeStep.vue's wizard-step card reordering. Reorders routineStore.routines locally to
 *  compute the new id order, then persists via routineStore.reorder(), which itself reloads
 *  from the server rather than trusting this client-side splice as the final word. */
const { draggingIndex, onPointerDown, styleFor } = useDragReorder((from, to) => {
  const ids = routineStore.routines.map((r) => r.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved!);
  /* Final-review finding (5a): reorder()'s own `await this.load()` never runs if the
     Promise.all of PATCH requests inside it rejects, so a failed request used to leave the UI
     silently disagreeing with the server with no user feedback at all. Surface the failure and
     force a resync from the server so the list can't stay stale. */
  routineStore.reorder(ids).catch(() => {
    toast("Sortierung konnte nicht gespeichert werden.");
    void routineStore.load();
  });
});

function handleDragDown(e: PointerEvent, index: number, cardEl: HTMLElement | null) {
  if (!cardEl) return;
  onPointerDown(e, index, routineStore.routines.length, cardEl);
}

/** Fix-round finding (task 5/6): useDragReorder's own doc comment says it's built for "one
 *  list, vertical only" — its translateY math assumes a single itemHeight step per index, with
 *  no concept of column-wrap. .routine-grid switches from single-column to a genuine multi-column
 *  grid at the same 900px breakpoint used below (see the `@media (min-width: 900px)` rule on
 *  .routine-grid in <style>), so dragging across a row boundary at desktop widths would compute
 *  the wrong displaced-card offsets and resolve to the wrong target index. Rather than teaching
 *  the shared composable about column-wrap (it's also used by ArrangeStep.vue's single-column
 *  wizard list), gate the drag handle here: only render/wire it when the grid is single-column.
 *  All other card actions (start, ⋮ menu, mesocycle controls) are unaffected at any width. */
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
          class="routine-card"
          :class="{ dragging: draggingIndex === i }"
          :style="styleFor(i)"
        >
          <div class="rc-head">
            <!-- Drag handle restricted to the single-column (mobile) layout — see the
                 canDragReorder computed above for why: useDragReorder's vertical-only math would
                 misbehave once the grid wraps into multiple columns at >=900px. -->
            <button
              v-if="canDragReorder"
              class="rc-drag-handle"
              aria-label="Verschieben"
              @pointerdown="handleDragDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.routine-card') as HTMLElement)"
            >
              ≡
            </button>
            <b>{{ routine.name }}</b>
            <span v-if="routine.mesocycle" class="meso-badge">
              Woche {{ routine.mesocycle.currentWeek }}/{{ routine.mesocycle.totalWeeks }} ·
              {{ routine.mesocycle.weekPercents[routine.mesocycle.currentWeek - 1] }}%
            </span>
          </div>
          <!-- Preview (feedback: show what a routine trains before starting it, not just its
               name/count) — exercise names + an aggregated muscle figure, same data the finish
               summary already showed after the fact. -->
          <div class="rc-preview">
            <ul class="rc-ex-list">
              <li v-for="re in routine.routineExercises.slice(0, 4)" :key="re.id">{{ routineExerciseName(re.exerciseId) }}</li>
              <li v-if="routine.routineExercises.length > 4" class="rc-ex-more">+{{ routine.routineExercises.length - 4 }} weitere</li>
            </ul>
            <MuscleFigure class="rc-muscles" :size="52" v-bind="routineMuscles(routine)" />
          </div>
          <span class="rc-count">{{ routine.routineExercises.length }} {{ routine.routineExercises.length === 1 ? "Übung" : "Übungen" }}</span>

          <div class="rc-actions">
            <button class="btn-primary rc-start" :disabled="starting" @click="startRoutine(routine)">
              {{ starting ? "…" : "▶ Starten" }}
            </button>
            <div class="rc-menu-wrap">
              <button class="rc-menu-btn" aria-label="Mehr" @click="toggleMenu(routine.id)">⋮</button>
              <!-- Folded in from a standalone "✎ Bearbeiten" button that used to sit next to
                   Start at equal visual weight (design critique: 5 simultaneous affordances on
                   the screen a returning user sees every session competed with the one action
                   that matters — starting). Same editRoutine() call, just relocated. -->
              <div v-if="openMenuId === routine.id" class="rc-menu">
                <button @click="editRoutine(routine); openMenuId = null">✎ Bearbeiten</button>
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

          <div v-if="mesoFormRoutineId === routine.id" class="meso-form">
            <NumberStepper size="sm" :model-value="mesoWeeksInput.get(routine.id) ?? 4" @adjust="(d) => adjustMesoWeeks(routine.id, d)" />
            <span>Wochen</span>
            <button class="btn-secondary" @click="startMesocycle(routine.id)">Starten</button>
          </div>
        </div>
      </div>
      <!-- First-timer empty state (design critique P1): previously one gray sentence — the
           least-designed screen for the highest-stakes moment, a first-timer's first decision,
           before they can ever reach the rank system this app is built around. Styled after
           ErholungszoneCard.vue's bordered-surface pattern (same .erholungszone-shaped card,
           eyebrow, and primary CTA) so this gets the same visual investment as the app's best
           empty/loading state instead of being an afterthought. -->
      <div v-else class="routine-empty">
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

      <button class="btn-primary btn-lg" :disabled="starting || quickStartExercises.length === 0" @click="quickStart">
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
  /* Audit fix (workplan-v1 §1.10a): with few/no routines, this content was a short island
     pinned at the top of the scroll area, leaving primary CTAs (Starten / + Neue Routine)
     stranded well above the thumb-reachable lower half of the screen. min-height + centering
     pulls a short list toward mid-screen instead; a long routine list simply exceeds this
     min-height and scrolls exactly as before — no change for that case. */
  min-height: 55vh;
  justify-content: center;
}
/* Zero-routine empty state (design critique P1) — same bordered-surface treatment as
   ErholungszoneCard.vue's .erholungszone so this gets equivalent visual weight, not a bare
   sentence. Width-capped and self-contained like .finished-summary so it doesn't stretch
   edge-to-edge on wide viewports. */
.routine-empty {
  width: 100%;
  max-width: var(--content-w-narrow);
  background: var(--surface);
  border: 1px solid var(--line);
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
/* Feedback: "the workout cards should have more width and generally be bigger on desktop,
   don't be afraid to use whitespace" — this overrides an earlier, more conservative call
   (see the .not-started comment below, which reasoned this list should stay narrow and just
   center rather than stretch). Wider cap, fewer/bigger cards per row, roomier gap and padding. */
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
  background: var(--surface-2);
  /* engagement-audit-v4 Phase 2 (routine-card shape pass): tier-accent border, same fallback
     idiom as RankDistributionDonut.vue/RankUpCalendar.vue/RestTimer.vue — ties the
     highest-frequency screen in the app to the rank spine without misrepresenting an unranked
     routine as an earned moment (no .panel-reward gradient, no muscle-derived color — routines
     aren't ranked, so a uniform tier accent is the honest signal here, not a competing one). */
  border: 1px solid var(--tier-accent, var(--line));
  position: relative;
  /* Entrance stagger + hover lift (feedback: the rest of the app was still missing the
     dashboard's liveliness) — this is the actual "choose a workout" screen, so it's worth as
     much life as the dashboard itself. Uses --ease-out, not --ease-spring: the overshoot easing
     is reserved for earned moments (rank-up, PR, level-up) per motion.css's own convention —
     a routine list entrance isn't one of those (see commit 8c0f158 for the same fix elsewhere). */
  /* Fill-mode `backwards`, not `both` (final-review finding): a CSS animation's fill state
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
/* Drag-to-reorder (plan C §3 Phase 3, Task 6) — eased transform for displaced cards while a
   drag is in progress; the dragged card itself gets `transition: none` inline from
   useDragReorder's styleFor() so it tracks the pointer with no lag. */
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
  /* Final-review finding: was `baseline`, which sat the 44px-tall drag handle's box awkwardly
     against the single-line routine name instead of vertically centering the two. `center`
     reads correctly whether or not the handle/meso-badge are present. */
  align-items: center;
  justify-content: space-between;
  gap: var(--sp2);
}
.rc-head b {
  font-size: 15.5px;
  /* Final-review finding: with the drag handle as a new first child and no mesocycle badge
     (the common case), `space-between` had only two children to split apart, pushing the name
     flush to the right edge instead of keeping it next to the handle. flex:1 makes the name
     claim the remaining space so trailing content (badge, or nothing) sits at the end instead. */
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* Drag-to-reorder (plan C §3 Phase 3, Task 6) — same visual pattern as ArrangeStep.vue's
   .drag-handle, sized to the 44px touch-target floor used elsewhere on this card (.rc-menu-btn,
   .rc-start), since this card lives on a primary mobile-first screen (unlike the wizard's
   32px handle). */
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
.rc-actions {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  margin-top: var(--sp2);
}
.rc-start {
  flex: 1;
  min-height: 44px;
  padding: 9px 10px;
  font-size: 13px;
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
