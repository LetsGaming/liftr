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
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import MuscleFigure from "../components/ui/MuscleFigure.vue";
import { useStartRoutine } from "../composables/useStartRoutine";
import { aggregateMuscles } from "../lib/muscles";
import { useCatalogStore } from "../stores/catalogStore";
import { useRoutineStore } from "../stores/routineStore";

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const routineStore = useRoutineStore();
const { starting, startRoutine, exerciseName } = useStartRoutine();

const routineId = computed(() => route.params.id as string);
const routine = computed(() => routineStore.byId(routineId.value));

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
          </div>

          <div class="eyebrow">Trainierte Muskeln</div>
          <MuscleFigure class="ro-muscles" :primary="routineMuscles.primary" :secondary="routineMuscles.secondary" />

          <div class="eyebrow ro-ex-eyebrow">Übungen</div>
          <ul class="ro-ex-list">
            <li v-for="re in orderedExercises" :key="re.id" class="ro-ex-row">
              <span class="ro-ex-name">{{ exerciseDisplayName(re.exerciseId, re.exercise.slug, re.exercise.name) }}</span>
              <span class="ro-ex-summary">{{ setSummary(re.targetSets) }}</span>
            </li>
          </ul>

          <!-- Sticky start button (spec §3.2 explicit requirement) — pinned to the bottom of the
               viewport so it's reachable with zero scroll regardless of exercise count. Same
               sticky-inside-ion-content pattern already proven by PickStep.vue's .continue-bar. -->
          <div class="ro-start-bar">
            <button class="btn-primary btn-lg btn-block" :disabled="starting" @click="jetztStarten">
              {{ starting ? "Wird gestartet…" : "▶ Jetzt starten" }}
            </button>
          </div>
        </template>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
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
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp3);
}
.ro-header h2 {
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
.ro-ex-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-md);
  background: var(--surface-2);
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
