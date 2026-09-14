<script setup lang="ts">
/**
 * Routine Overview screen. Reached by tapping a routine card instead of starting immediately —
 * all three start call sites route here first. Everything shown is already client-side once
 * routineStore.load() has run, no new backend endpoint needed. The trained-muscle summary is
 * always the mannequin, never a text/tag list — this copies the exact existing aggregation
 * pattern verbatim from RoutineList.vue/OverviewPage.vue rather than inventing a new one.
 */
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/ui/AppIcon.vue";
import DrillInScreen from "../components/ui/DrillInScreen.vue";
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

/** Per-exercise set details collapsed by default to save vertical space, expandable per row.
 *  Keyed by routineExercise id so state doesn't shift if exercises reorder. */
const expandedExercises = reactive<Record<string, boolean>>({});
function toggleExpanded(routineExerciseId: string) {
  expandedExercises[routineExerciseId] = !expandedExercises[routineExerciseId];
}

/** Same aggregation as RoutineList.vue:39-41 / OverviewPage.vue:130-132 — trained muscles are
 *  always the mannequin, never a text/tag list. */
const routineMuscles = computed(() =>
  aggregateMuscles((routine.value?.routineExercises ?? []).map((re) => catalog.byId(re.exerciseId)?.muscles ?? [])),
);

const orderedExercises = computed(() => (routine.value?.routineExercises ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex));

function exerciseDisplayName(exerciseId: string, fallbackSlug: string, fallbackName: string | null): string {
  const cat = catalog.byId(exerciseId);
  return cat ? exerciseName(cat.slug, cat.name) : exerciseName(fallbackSlug, fallbackName);
}

/** "4 × 80 kg · 8 Wdh." — set count plus the first set's weight/reps as the representative
 *  target, same "first working set as the summary number" idiom ExerciseRail.vue already uses
 *  for its own per-exercise line. */
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
  // land the user back on this now-stale overview.
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
      <DrillInScreen
        :title="routine ? routine.name : 'Routine'"
        :loading="!routineStore.loaded"
        :not-found="routineStore.loaded && !routine"
        :skeleton-count="3"
      >
        <template #not-found>
          <div class="eyebrow">Routine nicht gefunden</div>
          <p>Diese Routine existiert nicht (mehr). Vielleicht wurde sie gelöscht.</p>
          <router-link to="/workout" class="btn-secondary btn-block">Zur Übersicht →</router-link>
        </template>

        <template v-if="routine" #header-extra>
          <span class="ro-count">
            {{ routine.routineExercises.length }} {{ routine.routineExercises.length === 1 ? "Übung" : "Übungen" }}
          </span>
          <button class="ro-edit-btn" aria-label="Routine bearbeiten" @click="editRoutine(routine)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </template>

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

        <template #start-bar>
          <button class="btn-primary btn-lg btn-block" :disabled="starting" @click="jetztStarten">
            <template v-if="starting">Wird gestartet…</template>
            <template v-else><AppIcon name="play" /> Jetzt starten</template>
          </button>
        </template>
      </DrillInScreen>
      <RoutineWizard v-if="showBuilder" :routine="editingRoutine" @created="onRoutineCreated" />
    </IonContent>
  </IonPage>
</template>

<style scoped>
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
</style>
