<script setup lang="ts">
/**
 * Routine Overview screen (Wave 0-B, task W1 —
 * docs/superpowers/specs/2026-09-05-workout-flow-redesign-design.md §3.2). Reached by tapping a
 * routine card instead of starting immediately (W2 rewires all three start call sites here).
 * Everything shown is already client-side once routineStore.load() has run — no new backend
 * endpoint, see the plan's W1 note. Mannequin muscle summary is a hard requirement per the spec
 * (never a text/tag list) — this copies the exact existing aggregation pattern verbatim from
 * RoutineList.vue/OverviewPage.vue rather than inventing a new one.
 */
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/ui/AppIcon.vue";
import MuscleFigure from "../components/ui/MuscleFigure.vue";
import RoutineWizard from "../components/routine-wizard/RoutineWizard.vue";
import { useRoutineManagement } from "../composables/useRoutineManagement";
import { useStartRoutine } from "../composables/useStartRoutine";
import { aggregateMuscles } from "../lib/muscles";
import { useCatalogStore } from "../stores/catalogStore";
import { useRoutineStore } from "../stores/routineStore";

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const routineStore = useRoutineStore();
const { starting, startRoutine, exerciseName } = useStartRoutine();
const { editingRoutine, showBuilder, editRoutine, onRoutineCreated } = useRoutineManagement(routineStore);

const routineId = computed(() => route.params.id as string);
const routine = computed(() => routineStore.byId(routineId.value));

/** Bug-list fix: no back button previously — this drill-in screen has no nav-bar entry of its
 *  own (forceActiveTo highlights "Workout" instead), so it needs an explicit way back rather
 *  than relying on the app's usual "tap the tab" convention. */
function goBack() {
  router.back();
}

/** Bug-list fix: per-exercise set details collapsed by default to save vertical space, expandable
 *  per row. Keyed by routineExercise id so state doesn't shift if exercises reorder. */
const expandedExercises = reactive<Record<string, boolean>>({});
function toggleExpanded(routineExerciseId: string) {
  expandedExercises[routineExerciseId] = !expandedExercises[routineExerciseId];
}

/** Same aggregation as RoutineList.vue:39-41 / OverviewPage.vue:130-132 — hard requirement per
 *  the design spec: trained muscles are always the mannequin, never a text/tag list. */
const routineMuscles = computed(() =>
  aggregateMuscles((routine.value?.routineExercises ?? []).map((re) => catalog.byId(re.exerciseId)?.muscles ?? [])),
);

const orderedExercises = computed(() => (routine.value?.routineExercises ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex));

function exerciseDisplayName(exerciseId: string, fallbackSlug: string, fallbackName: string | null): string {
  const cat = catalog.byId(exerciseId);
  return cat ? exerciseName(cat.slug, cat.name) : exerciseName(fallbackSlug, fallbackName);
}

/** "4 × 80 kg · 8 Wdh." (spec §3.2) — set count plus the first set's weight/reps as the
 *  representative target, same "first working set as the summary number" idiom ExerciseRail.vue
 *  already uses for its own per-exercise line. */
function setSummary(targetSets: { reps: number; weightKg: number | null }[]): string {
  const first = targetSets[0];
  if (!first) return "";
  const weightPart = first.weightKg != null ? `${first.weightKg} kg · ` : "";
  return `${targetSets.length} × ${weightPart}${first.reps} Wdh.`;
}

/** Expanded-row detail: one line per planned set, e.g. "Satz 2 — 80 kg × 8 Wdh." */
function setLine(targetSet: { reps: number; weightKg: number | null }, index: number): string {
  const weightPart = targetSet.weightKg != null ? `${targetSet.weightKg} kg × ` : "";
  return `Satz ${index + 1} — ${weightPart}${targetSet.reps} Wdh.`;
}

onMounted(() => {
  // Deep-link cold-load safety net: router.ts's beforeEnter already kicks routineStore.load()
  // off before this component mounts, but catalog isn't fetched by that guard (it's shared by
  // every page, not routine-overview-specific) — load it here too so `catalog.byId()` above has
  // data even on a bare cold navigation straight to this URL.
  void catalog.load();
  if (!routineStore.loaded) void routineStore.load();
});

async function jetztStarten() {
  if (!routine.value) return;
  await startRoutine(routine.value);
  // startRoutine()/store.start() itself never navigates (it only flips store.isActive and
  // WorkoutPage re-renders because of that) — this screen's own start button is responsible for
  // getting there. `replace`, not `push`: pressing back from the now-active workout must not
  // land the user back on this now-stale overview (plan W2 navigation note).
  await router.replace("/workout");
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ routine ? routine.name : "Routine" }}</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <div class="routine-overview">
        <!-- Back affordance lives in the page content, not the IonToolbar: on mobile the
             toolbar sits directly underneath App.vue's fixed .top-hud status bar (different
             stacking contexts — a toolbar button there gets visually collided with the
             level-ring/streak chip instead of reliably rendered above them), the exact same
             reason the page title itself was relocated out of the toolbar. This screen has no
             nav-bar entry of its own (forceActiveTo highlights "Workout" instead), so it needs
             an explicit way back rather than relying on the app's usual "tap the tab"
             convention. -->
        <button class="ro-back-btn" aria-label="Zurück" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Zurück</span>
        </button>

        <!-- Not-yet-loaded: routineStore.load() is in flight (kicked off by router.ts's
             beforeEnter on a cold deep-link, or already running from wherever navigation
             originated). Distinguished from "not found" below by routineStore.loaded. -->
        <template v-if="!routineStore.loaded">
          <div class="ro-skel shimmer" aria-hidden="true" />
          <div class="ro-skel shimmer" aria-hidden="true" />
          <div class="ro-skel shimmer" aria-hidden="true" />
        </template>

        <!-- Not-found: routines have loaded but no routine matches this id (bogus/stale deep
             link, e.g. a since-deleted routine). -->
        <div v-else-if="!routine" class="ro-not-found panel">
          <div class="eyebrow">Routine nicht gefunden</div>
          <p>Diese Routine existiert nicht (mehr). Vielleicht wurde sie gelöscht.</p>
          <router-link to="/workout" class="btn-secondary btn-block">Zur Übersicht →</router-link>
        </div>

        <template v-else>
          <div class="ro-header">
            <h2>{{ routine.name }}</h2>
            <span class="ro-count">
              {{ routine.routineExercises.length }} {{ routine.routineExercises.length === 1 ? "Übung" : "Übungen" }}
            </span>
            <button class="ro-edit-btn" aria-label="Routine bearbeiten" @click="editRoutine(routine)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          </div>

          <div class="eyebrow">Trainierte Muskeln</div>
          <MuscleFigure class="ro-muscles" :primary="routineMuscles.primary" :secondary="routineMuscles.secondary" />

          <div class="eyebrow ro-ex-eyebrow">Übungen</div>
          <ul class="ro-ex-list">
            <li v-for="re in orderedExercises" :key="re.id" class="ro-ex-item surface-hybrid">
              <button
                class="ro-ex-row"
                :aria-expanded="!!expandedExercises[re.id]"
                @click="toggleExpanded(re.id)"
              >
                <span class="ro-ex-name">{{ exerciseDisplayName(re.exerciseId, re.exercise.slug, re.exercise.name) }}</span>
                <span class="ro-ex-summary">{{ setSummary(re.targetSets) }}</span>
                <svg
                  class="ro-ex-chevron"
                  :class="{ open: expandedExercises[re.id] }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <ul v-if="expandedExercises[re.id]" class="ro-ex-sets">
                <li v-for="(set, i) in re.targetSets" :key="i">{{ setLine(set, i) }}</li>
              </ul>
            </li>
          </ul>

          <!-- Sticky start button (spec §3.2 explicit requirement) — pinned to the bottom of the
               viewport so it's reachable with zero scroll regardless of exercise count. Same
               sticky-inside-ion-content pattern already proven by PickStep.vue's .continue-bar. -->
          <div class="ro-start-bar">
            <button class="btn-primary btn-lg btn-block" :disabled="starting" @click="jetztStarten">
              <template v-if="starting">Wird gestartet…</template>
              <template v-else><AppIcon name="play" /> Jetzt starten</template>
            </button>
          </div>
        </template>
      </div>
      <RoutineWizard v-if="showBuilder" :routine="editingRoutine" @created="onRoutineCreated" />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.ro-back-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--sp2) var(--sp2) var(--sp2) 0;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 13.5px;
  font-weight: 600;
}
.ro-back-btn svg {
  width: 18px;
  height: 18px;
}
.ro-edit-btn {
  flex: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--dim);
}
.ro-edit-btn svg {
  width: 18px;
  height: 18px;
}
.routine-overview {
  max-width: var(--content-w-narrow);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  /* Clears the sticky start bar so the last exercise row is never hidden behind it. */
  padding-bottom: 88px;
}
.ro-skel {
  height: 64px;
  border-radius: var(--r-lg);
  background-color: var(--surface-2);
}
.ro-not-found {
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.ro-header {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.ro-header h2 {
  flex: 1;
  font-size: 20px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ro-count {
  font-size: 12.5px;
  color: var(--dim);
  flex: none;
}
.ro-muscles {
  align-self: center;
}
.ro-ex-eyebrow {
  margin-top: var(--sp2);
}
.ro-ex-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ro-ex-item {
  border-radius: var(--r-md);
  overflow: hidden;
}
.ro-ex-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  padding: var(--sp3);
  background: none;
  border: none;
  text-align: left;
  color: var(--text);
  font: inherit;
}
.ro-ex-chevron {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--dim);
  transition: transform var(--dur-base) var(--ease-out);
}
.ro-ex-chevron.open {
  transform: rotate(180deg);
}
.ro-ex-sets {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 var(--sp3) var(--sp3);
  font-size: 12px;
  color: var(--dim);
}
.ro-ex-name {
  font-size: 13.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ro-ex-summary {
  font-size: 12px;
  color: var(--dim);
  flex: none;
  white-space: nowrap;
}
.ro-start-bar {
  position: sticky;
  bottom: 0;
  padding: var(--sp3) 0;
  background: linear-gradient(0deg, var(--bg) 60%, transparent);
}
</style>
