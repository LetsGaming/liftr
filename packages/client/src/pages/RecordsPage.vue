<script setup lang="ts">
// Personal Records ledger. Reads `prs`, a table the server already fully populates on every
// workout finish. Honest empty state, no locked/teaser treatment.
//
// Running Rekorde section (Task 12): a second, independent ledger sourced from Task 10's
// runRankStore (/api/runs/prs) — five fixed rows, one per RunCategory, each showing that
// category's fastest *time* PR (kind === "time"; "speed" PRs carry the same underlying number
// but time is what a runner actually cares about seeing here, per the plan). Deliberately not
// reusing .pr-row/.pr-list for these: unlike the strength ledger (a variable-length history of
// every kind, sorted newest first), this section is a fixed 5-row grid that must always render
// all five categories even when some have no PR yet — different enough shape to warrant its own
// classes rather than forcing the existing list markup to do both jobs.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import type { RunCategory } from "@liftr/shared";
import { RUN_CATEGORIES } from "@liftr/shared";
import RunDetail from "../components/run/RunDetail.vue";
import { useExerciseName } from "../composables/useExerciseName";
import { usePrStore } from "../stores/prStore";
import { useRunRankStore, type RunPrListItem } from "../stores/runRankStore";

const prStore = usePrStore();
const runRankStore = useRunRankStore();
const { exerciseName } = useExerciseName();
onMounted(() => {
  void prStore.load();
  void runRankStore.loadPrs();
});

const KIND_LABEL: Record<string, string> = {
  e1rm: "e1RM",
  weight: "Gewicht",
  reps: "Wiederholungen",
  volume: "Volumen",
};

const RUN_CATEGORY_LABEL: Record<RunCategory, string> = {
  mile: "Meile",
  "5k": "5 km",
  "10k": "10 km",
  half_marathon: "Halbmarathon",
  marathon: "Marathon",
};

const sorted = computed(() => prStore.prs.slice().sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)));

// The fastest (lowest-value) "time"-kind PR per category. run_prs keeps every historical PR
// event, not just the current best (see runRankRepository.ts's findAllRunPrs comment), so
// "current best per category" is an application-level reduction here, same as
// findBestRunPrByKind does server-side for a single category.
const bestRunTimeByCategory = computed(() => {
  const out: Partial<Record<RunCategory, RunPrListItem>> = {};
  for (const pr of runRankStore.prs) {
    if (pr.kind !== "time") continue;
    const current = out[pr.category as RunCategory];
    if (!current || pr.value < current.value) out[pr.category as RunCategory] = pr;
  }
  return out;
});

const openRunId = ref<string | null>(null);

function isRecentlyAchieved(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

function formatValue(kind: string, value: number): string {
  if (kind === "reps") return `${Math.round(value)} Wdh.`;
  if (kind === "volume") return `${Math.round(value).toLocaleString("de-DE")} kg`;
  // "weight" and "e1rm" — e1rm in particular is computed (epley formula: weightKg * (1 +
  // reps/30)) and routinely lands on a non-terminating decimal (e.g. 100kg x 8 reps ->
  // 126.66666666666667), which rendered here unrounded as "126.66666666666667 kg". Round to a
  // whole kg, matching the convention already used for e1rm everywhere else it's displayed
  // (ExerciseInfoPanel.vue's `Math.round(bestE1rm)`, ProgressChart.vue's `Math.round(...)`).
  return `${Math.round(value)} kg`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Seconds -> "m:ss" (or "h:mm:ss" once it crosses an hour, e.g. marathon times), matching the
 *  German locale's colon convention already used for pace elsewhere (RunsPage.vue's
 *  formatPace). */
function formatRaceTime(totalSeconds: number): string {
  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Rekorde</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p style="color: var(--dim)">Deine Rekord-Historie — jeder neue Bestwert automatisch erfasst.</p>

      <template v-if="!prStore.loaded && !prStore.error">
        <div v-for="i in 4" :key="i" class="shimmer pr-skel-row" aria-hidden="true" />
      </template>

      <p v-else-if="prStore.error" class="page-note load-error panel" style="margin-top: var(--sp4)">
        Rekorde konnten nicht geladen werden.
        <button type="button" class="btn-secondary" @click="prStore.load()">Erneut versuchen</button>
      </p>

      <p v-else-if="sorted.length === 0" class="page-note empty-note panel" style="margin-top: var(--sp4)">
        Noch keine Rekorde — dein erster harter Satz auf einer beliebigen Übung startet einen.
      </p>

      <ul v-else class="pr-list">
        <li
          v-for="pr in sorted"
          :key="pr.id"
          class="panel pr-row"
          :class="{ 'panel-reward panel-reward--nebula': isRecentlyAchieved(pr.achievedAt) }"
        >
          <div class="pr-row-main">
            <b>{{ exerciseName(pr.exerciseSlug, pr.exerciseName) }}</b>
            <span class="pr-kind">{{ KIND_LABEL[pr.kind] }}</span>
          </div>
          <div class="pr-row-meta">
            <span class="tnum pr-value">{{ formatValue(pr.kind, pr.value) }}</span>
            <span class="pr-date">{{ formatDate(pr.achievedAt) }}</span>
          </div>
        </li>
      </ul>

      <h2 class="eyebrow run-pr-heading">Lauf-Rekorde</h2>

      <template v-if="!runRankStore.prsLoaded && !runRankStore.prsError">
        <div v-for="i in 5" :key="i" class="shimmer run-pr-skel-row" aria-hidden="true" />
      </template>

      <p v-else-if="runRankStore.prsError" class="page-note load-error run-pr-load-error panel" style="margin-top: var(--sp4)">
        Lauf-Rekorde konnten nicht geladen werden.
        <button type="button" class="btn-secondary" @click="runRankStore.loadPrs()">Erneut versuchen</button>
      </p>

      <ul v-else class="run-pr-list">
        <li v-for="category in RUN_CATEGORIES" :key="category">
          <button
            type="button"
            class="panel run-pr-row"
            :class="{ 'run-pr-empty': !bestRunTimeByCategory[category] }"
            :disabled="!bestRunTimeByCategory[category]"
            @click="openRunId = bestRunTimeByCategory[category]!.runId"
          >
            <div class="pr-row-main">
              <b>{{ RUN_CATEGORY_LABEL[category] }}</b>
            </div>
            <div v-if="bestRunTimeByCategory[category]" class="pr-row-meta">
              <span class="tnum pr-value">{{ formatRaceTime(bestRunTimeByCategory[category]!.value) }}</span>
              <span class="pr-date">{{ formatDate(bestRunTimeByCategory[category]!.achievedAt) }}</span>
            </div>
            <div v-else class="pr-row-meta">
              <span class="pr-date">Noch kein Rekord</span>
            </div>
          </button>
        </li>
      </ul>

      <RunDetail v-if="openRunId" :run-id="openRunId" @close="openRunId = null" />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-note {
  color: var(--dim);
}
/* Error/empty-ledger states use the shared .panel/surface-hybrid treatment (tokens.css) instead
   of sitting as bare page text, so they read as one system with the populated .pr-row list
   below. .panel supplies background/blur/shadow/hairline; padding is added locally since .panel
   itself is unopinionated about spacing. */
.load-error,
.empty-note {
  padding: var(--sp4);
}
.load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp3);
  max-width: 60ch;
}
.load-error .btn-secondary {
  padding: 8px 14px;
}
.pr-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  margin-top: var(--sp4);
}
.pr-row {
  padding: var(--sp4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
}
.pr-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pr-kind {
  font-size: 12px;
  color: var(--dim);
}
.pr-row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: none;
}
.pr-value {
  font-weight: 800;
}
.pr-date {
  font-size: 12px;
  color: var(--faint);
}
/* .shimmer (styles/motion.css) only supplies the sweep gradient + animation — the call site
   must give the block its own background-color or the "loading" state is just page background
   with a near-invisible 8%-white sweep (same technique as RanksPage.vue's .rank-skel-block). */
.pr-skel-row {
  height: 56px;
  border-radius: var(--r-lg);
  margin-top: var(--sp3);
  background-color: var(--surface-2);
}
.run-pr-heading {
  margin-top: var(--sp5);
}
.run-pr-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  margin-top: var(--sp4);
}
/* Rides .panel (hybrid bg/blur/shadow + hairline) same as .pr-row, but on a <button> — same
   treatment RunsPage.vue's .run-row and OverviewPage.vue's .feed-btn already give a clickable
   panel row, so a native button needs its own explicit width/text-align/background reset since
   .panel itself is unopinionated about either. */
.run-pr-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  padding: var(--sp4);
  text-align: left;
  color: var(--text);
  border: none;
}
.run-pr-row:disabled {
  cursor: default;
}
.run-pr-empty .pr-date {
  color: var(--faint);
}
.run-pr-skel-row {
  height: 56px;
  border-radius: var(--r-lg);
  margin-top: var(--sp3);
  background-color: var(--surface-2);
}
</style>
