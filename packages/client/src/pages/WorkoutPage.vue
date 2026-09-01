<script setup lang="ts">
/**
 * The sacred loop (plan 1.5 / mockup #p-workout, #m-wk). "Start" now prefers a real saved
 * Routine (plan 1.4) — one tap, no rebuilding, per audit §3. The old "quick start first 4
 * catalog exercises" ad-hoc flow stays as a fallback for when no routine exists yet, since
 * it's still useful to exercise the loop on a fresh install before you've built anything.
 */
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import ExerciseIcon from "../components/exercise/ExerciseIcon.vue";
import ExerciseInfoPanel from "../components/exercise/ExerciseInfoPanel.vue";
import ExerciseRail from "../components/exercise/ExerciseRail.vue";
import FinishSequence from "../components/workout/FinishSequence.vue";
import MuscleFigure from "../components/ui/MuscleFigure.vue";
import RankProgress from "../components/rank/RankProgress.vue";
import RestTimer from "../components/workout/RestTimer.vue";
import RoutineWizard from "../components/routine-wizard/RoutineWizard.vue";
import SetEntry from "../components/workout/SetEntry.vue";
import SetKindPicker from "../components/workout/SetKindPicker.vue";
import StatTile from "../components/ui/StatTile.vue";
import NumberStepper from "../components/ui/NumberStepper.vue";
import WorkoutClock from "../components/workout/WorkoutClock.vue";
import { useAddExerciseToSession } from "../composables/useAddExerciseToSession";
import { useConfirmTap } from "../composables/useConfirmTap";
import { useMesocycleControls } from "../composables/useMesocycleControls";
import { useRoutineManagement } from "../composables/useRoutineManagement";
import { useStartRoutine } from "../composables/useStartRoutine";
import { useWorkoutFinish } from "../composables/useWorkoutFinish";
import { useWorkoutShareCard } from "../composables/useWorkoutShareCard";
import { useToast } from "../composables/useToast";
import { useXpChip } from "../composables/useXpChip";
import { haptics } from "../lib/haptics";
import { canCopyToClipboard } from "../lib/shareCard";
import { aggregateMuscles } from "../lib/muscles";
import { TIER_BADGE_PATH, TIER_LABEL_DE, type RankTier } from "../lib/tierIcons";
import { computeSetXp, TIERS, type Tier } from "@liftr/shared";
import { useActiveWorkoutStore, SET_KIND_LABEL, type SetKind } from "../stores/activeWorkoutStore";
import { useCatalogStore } from "../stores/catalogStore";
import { useHistoryStore } from "../stores/historyStore";
import { useRanksStore } from "../stores/ranksStore";
import { useRoutineStore, type Routine } from "../stores/routineStore";
import { useStreakStore } from "../stores/streakStore";
import { useXpStore } from "../stores/xpStore";

const catalog = useCatalogStore();
const store = useActiveWorkoutStore();
const routineStore = useRoutineStore();
const streakStore = useStreakStore();
const ranksStore = useRanksStore();
const xpStore = useXpStore();
const historyStore = useHistoryStore();
const { starting, startRoutine, quickStart, exerciseName } = useStartRoutine();

const restTrigger = ref(0);
/** Which rest duration RestTimer should run for next — set by logSet() from whatever
 *  store.logCurrentSet() decided (between-set vs after-exercise, feedback: "adjust the pause,
 *  per set and per exercise"). */
const restSeconds = ref(90);

/**
 * Session-aggregate muscle map (plan Phase 3.1): union of every muscle trained across the
 * whole workout, primary winning over secondary if an exercise disagrees with another. Needed
 * both by the template (mid-session muscle preview) and by useWorkoutFinish's snapshot, so it's
 * computed here and passed into the composable rather than re-derived inside it.
 */
const sessionMuscles = computed(() => aggregateMuscles(store.exercises.map((ex) => catalog.byId(ex.exerciseId)?.muscles ?? [])));

const {
  finishedSummary,
  finishSequenceDone,
  sessionXp,
  sessionRankUps,
  sessionCaptions,
  finishXpSnapshot,
  routineBeats,
  updatingRoutine,
  routineUpdated,
  updateRoutineWithBeats,
  streakDays,
  finishWorkout,
} = useWorkoutFinish({ activeWorkoutStore: store, routineStore, streakStore, ranksStore, xpStore, historyStore, catalogStore: catalog }, sessionMuscles, exerciseName);

const { finishedCanvas, sharingFinished, shareFinished, copyingFinished, copyFinished } = useWorkoutShareCard(finishedSummary, sessionRankUps);

/** Rework Phase 4 (critique finding: the post-sequence summary used to open straight into three
 *  gray StatTiles — the emotional peak had no continuation, and the terminal frame was a data
 *  table). Highest tier among this session's rank-ups, if any, so the summary can keep the
 *  tier/level state as its first visual instead of duplicating FinishSequence's beats. */
const topRankUp = computed(() => {
  if (sessionRankUps.value.length === 0) return null;
  return sessionRankUps.value.reduce((best, r) =>
    TIERS.indexOf(r.tier as Tier) > TIERS.indexOf(best.tier as Tier) ? r : best,
  );
});

/** Rank engine v2 (task 10): sessionCaptions (from useWorkoutFinish) carries the honest
 *  copy but not the badge/next-target data to render a RankProgress card — that lives on
 *  ranksStore's row for the exercise (already refreshed by applyVerdict() in finishWorkout()).
 *  Joined here rather than in the composable so ranksStore stays the single source of truth
 *  for "what's this exercise's rank right now" — the same pattern RanksPage.vue and
 *  ExerciseInfoPanel.vue already use. A caption whose exercise has no ranksStore row yet
 *  (shouldn't happen — applyVerdict() runs for every touched exercise before this — but kept
 *  defensive) is simply dropped rather than rendered with guessed data. */
const captionRows = computed(() =>
  sessionCaptions.value.flatMap((c) => {
    const row = ranksStore.ranks.find((r) => r.exerciseId === c.exerciseId);
    if (!row) return [];
    return [{ ...c, tier: row.tier, division: row.division, lp: row.lp, nextTargetWeightKg: row.nextTargetWeightKg, nextTargetReps: row.nextTargetReps, trust: row.trust }];
  }),
);
const { toast } = useToast();
const canCopyShareImage = canCopyToClipboard();
async function onCopyFinished() {
  const ok = await copyFinished();
  toast(ok ? "In Zwischenablage kopiert" : "Kopieren fehlgeschlagen");
}

const {
  openMenuId,
  editingRoutine,
  showBuilder,
  deleteConfirm,
  toggleMenu,
  editRoutine,
  duplicateRoutine,
  onRoutineCreated,
} = useRoutineManagement(routineStore);

const cancelConfirm = useConfirmTap(() => void store.cancelWorkout());

const { mesoFormRoutineId, mesoWeeksInput, toggleMesoForm, startMesocycle, adjustMesoWeeks, activeMesocycle } = useMesocycleControls(store, routineStore);

const { showAddExercise, addExerciseSearch, addExerciseCandidates, addExerciseToSession } = useAddExerciseToSession(
  store,
  () => catalog.exercises,
  exerciseName,
);

const { xpChip, trigger: triggerXpChip } = useXpChip();

const infoExerciseId = ref<string | null>(null);
const infoExercise = computed(() => (infoExerciseId.value ? catalog.byId(infoExerciseId.value) : undefined));
function openInfo(exerciseId: string) {
  infoExerciseId.value = exerciseId;
}

/** "Satzart auswählen" (feedback: set kind must be settable) — which set's picker is open. */
const kindPickerFor = ref<{ workoutExerciseId: string; setIndex: number } | null>(null);

/** Defensive fallback to "normal" — activeWorkoutStore.restore() backfills `kind` on load for
 *  sets persisted before this field existed, but this is cheap insurance against the same class
 *  of crash from any other path that might hand back an old-shaped set. */
function kindLabel(kind: SetKind | undefined): string {
  return SET_KIND_LABEL[kind ?? "normal"];
}
/** Normal sets show their position in the exercise; every other kind shows a fixed letter
 *  instead — matches the reference app's "A"/"F"/"D" badges (SetKindPicker.vue uses the same
 *  SET_KIND_LABEL for its own row icons). */
function kindLetter(kind: SetKind | undefined, index: number): string {
  return !kind || kind === "normal" ? String(index + 1) : SET_KIND_LABEL[kind][0]!;
}

/** Same aggregation, over a *routine's* planned exercises rather than an active session's —
 *  feeds the routine card's muscle preview so "what does this train" is answerable before
 *  starting, not just after finishing (previously only shown on the finish summary). */
function routineMuscles(routine: Routine) {
  return aggregateMuscles(routine.routineExercises.map((re) => catalog.byId(re.exerciseId)?.muscles ?? []));
}

function routineExerciseName(exerciseId: string): string {
  const ex = catalog.byId(exerciseId);
  return ex ? exerciseName(ex.slug) : "";
}

/** "Superset 2/3" — position within the group, for the focus header (plan §6.6). */
const supersetLabel = computed(() => {
  const ex = store.currentExercise;
  if (!ex || ex.supersetGroup == null) return null;
  const group = store.exercises.filter((e) => e.supersetGroup === ex.supersetGroup);
  const pos = group.findIndex((e) => e.workoutExerciseId === ex.workoutExerciseId);
  return `Superset ${pos + 1}/${group.length}`;
});

/** Feedback: "a workout runs indefinitely if it wasn't cancelled or ended by the user" — checked
 *  once right after restore() picks a resumed session back up, not reactively, so it nudges once
 *  per app open/reload instead of re-appearing on every navigation back to this tab while the
 *  user is deliberately still mid-session. */
const showStalePrompt = ref(false);

onMounted(async () => {
  await Promise.all([catalog.load(), store.restore(), routineStore.load(), ranksStore.load(), historyStore.load()]);
  showStalePrompt.value = store.isStale;
});

/** The exercise currently in focus's cached rank row, if one exists yet — context for the
 *  in-session RankProgress bar. Rank is now only ever recomputed once, when the workout
 *  finishes (see finishWorkout() below), so this reads the value as of the *start* of the
 *  session and stays static while logging — it no longer animates set-by-set. The reward for
 *  what actually changed this session shows in the finish sequence instead. */
const currentRank = computed(() => {
  const exerciseId = store.currentExercise?.exerciseId;
  return exerciseId ? ranksStore.ranks.find((r) => r.exerciseId === exerciseId) : undefined;
});

const quickStartExercises = computed(() => catalog.exercises.slice(0, 4));

async function logSet() {
  // Snapshot everything logCurrentSet() will mutate/advance past, before calling it.
  const set = store.currentSet;
  const weightKg = set?.weightKg ?? null;
  const reps = set?.reps ?? 0;
  const tier = (currentRank.value?.tier as Tier | undefined) ?? null;
  const wasLastUnloggedSet = (store.currentExercise?.sets.filter((s) => !s.logged).length ?? 0) === 1;

  const restDuration = await store.logCurrentSet();
  if (restDuration != null) {
    restSeconds.value = restDuration;
    restTrigger.value += 1;
  }

  if (set) {
    void haptics.tap();
    const amount = Math.round(computeSetXp(weightKg, reps, tier));
    sessionXp.value += amount;
    triggerXpChip(amount);
  }
  if (wasLastUnloggedSet) void haptics.bump();
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Workout</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
    <div class="workout-page">
    <!-- Post-finish summary (feedback gap: "Workout beenden" used to just dump you back on
         the routine list with zero recap). Snapshot taken in finishWorkout() before store.finish()
         resets the state, since XP/rank verdicts arrive async via the sync flush, not synchronously. -->
    <div v-if="finishedSummary" class="finished-summary">
      <!-- Three timed reward beats (engagement rework W4) replace what used to be one flat
           card — rank-ups, streak, and session XP were all computed and then discarded here.
           Falls straight through to the summary/share content below once the sequence finishes
           (or the user taps to skip it). -->
      <FinishSequence
        v-if="!finishSequenceDone"
        :rank-ups="sessionRankUps"
        :streak="streakStore.streak"
        :streak-days="streakDays"
        :tokens-remaining="streakStore.tokensRemaining"
        :session-xp="sessionXp"
        :level-before="finishXpSnapshot?.levelBefore ?? 0"
        :progress-before="finishXpSnapshot?.progressBefore ?? 0"
        :level-after="xpStore.level"
        :progress-after="xpStore.progressPercent"
        @done="finishSequenceDone = true"
      />
      <template v-else>
        <div class="eyebrow">Workout abgeschlossen</div>
        <h2>{{ finishedSummary.routineName }}</h2>

        <!-- Terminal frame (critique finding: used to exit straight into three gray StatTiles —
             the emotional peak had no continuation). Holds the tier/level state FinishSequence's
             last beat just showed, instead of cutting straight to a data table; duration/volume/
             sets move below the fold, after muscles and rank hints. -->
        <div class="reward-recap panel-reward" :class="topRankUp ? `t-${topRankUp.tier}` : ''">
          <span v-if="topRankUp" class="badge recap-badge" :class="`t-${topRankUp.tier}`">
            <svg viewBox="0 0 24 24"><path :d="TIER_BADGE_PATH[topRankUp.tier as RankTier]" /></svg>
          </span>
          <div class="recap-body">
            <b v-if="topRankUp">{{ TIER_LABEL_DE[topRankUp.tier as RankTier] }} erreicht</b>
            <b v-else>Lv. {{ xpStore.level }}</b>
            <span>+{{ sessionXp }} XP{{ sessionRankUps.length > 1 ? ` · ${sessionRankUps.length} Rangaufstiege` : "" }}</span>
          </div>
        </div>

        <div class="eyebrow">Trainierte Muskeln</div>
        <MuscleFigure :primary="finishedSummary.muscles.primary" :secondary="finishedSummary.muscles.secondary" />

        <!-- Rank engine v2 (task 10): recovery-gain / plausibility captions for this session's
             verdicts. Only rendered when there's actually something to say — a normal session
             with no decay-recovery and no plausibility flag adds nothing here (sessionCaptions
             is already filtered to non-empty captions in useWorkoutFinish.ts). Looks up each
             exercise's current row in ranksStore (already refreshed by applyVerdict() during
             finishWorkout()) for the badge/next-target data the raw verdict doesn't carry. -->
        <template v-if="captionRows.length > 0">
          <div class="eyebrow">Rang-Hinweise</div>
          <div class="caption-list">
            <div v-for="c in captionRows" :key="c.exerciseId" class="caption-item">
              <b>{{ c.exerciseName }}</b>
              <RankProgress
                variant="inline"
                :tier="c.tier"
                :division="c.division"
                :lp="c.lp"
                :next-target-weight-kg="c.nextTargetWeightKg"
                :next-target-reps="c.nextTargetReps"
                :trust="c.trust"
                :recovery-gain-label="c.recoveryGainLabel"
                :plausibility-note="c.plausibilityNote"
              />
            </div>
          </div>
        </template>

        <!-- Feedback: "if a user made changes to the routine while in the workout (more
             weight/reps than the default) it should ask to overwrite the routine." -->
        <div v-if="routineBeats.length > 0" class="beat-panel panel">
          <p v-if="!routineUpdated">
            Du warst stärker als geplant: {{ routineBeats.length === 1 ? "1 Satz" : `${routineBeats.length} Sätze` }} über dem
            Routine-Ziel.
          </p>
          <ul v-if="!routineUpdated" class="beat-list">
            <li v-for="(b, i) in routineBeats" :key="i">
              {{ b.name }}: {{ b.loggedWeightKg != null ? `${b.loggedWeightKg} kg × ` : "" }}{{ b.loggedReps }} statt
              {{ b.targetWeightKg != null ? `${b.targetWeightKg} kg × ` : "" }}{{ b.targetReps }}
            </li>
          </ul>
          <p v-if="routineUpdated" class="beat-done">✓ Routine aktualisiert.</p>
          <div v-else class="beat-actions">
            <button class="btn-secondary" @click="routineBeats = []">Nicht jetzt</button>
            <button class="btn-primary" :disabled="updatingRoutine" @click="updateRoutineWithBeats">
              {{ updatingRoutine ? "Wird gespeichert…" : "Routine aktualisieren" }}
            </button>
          </div>
        </div>

        <!-- Demoted below the fold (critique finding) — reference numbers, not the reward. -->
        <div class="stat-row">
          <StatTile :value="finishedSummary.durationLabel" label="Dauer" />
          <StatTile :value="`${Math.round(finishedSummary.volumeKg).toLocaleString('de-DE')} kg`" label="Volumen" />
          <StatTile :value="finishedSummary.setCount" label="Sätze" />
        </div>

        <button class="btn-primary btn-lg btn-block" :disabled="sharingFinished" @click="shareFinished">
          {{ sharingFinished ? "Erstelle Bild…" : "📤 Als Bild teilen" }}
        </button>
        <button v-if="canCopyShareImage" class="btn-secondary btn-block" :disabled="copyingFinished" @click="onCopyFinished">
          {{ copyingFinished ? "Kopiere…" : "📋 In Zwischenablage kopieren" }}
        </button>
        <button class="btn-secondary btn-block" @click="finishedSummary = null">Fertig</button>
        <canvas ref="finishedCanvas" class="share-canvas" aria-hidden="true" />
      </template>
    </div>

    <div v-else-if="!store.isActive" class="not-started">
      <div v-if="routineStore.routines.length > 0" class="routine-grid">
        <div v-for="routine in routineStore.routines" :key="routine.id" class="routine-card">
          <div class="rc-head">
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
              {{ starting ? "…" : "▶ Start" }}
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
        {{ starting ? "Wird gestartet…" : "Quick Start (erste 4 Übungen, ohne Routine)" }}
      </button>
    </div>

    <div v-else class="active-workout">
      <div v-if="showStalePrompt" class="stale-banner panel">
        <p>
          Dieses Workout läuft seit über {{ Math.floor(store.elapsedSeconds / 3600) }} Stunden. Läuft es noch, oder wurde
          vergessen, es zu beenden?
        </p>
        <div class="stale-actions">
          <button class="btn-secondary" @click="showStalePrompt = false">Läuft noch</button>
          <button class="btn-primary" @click="showStalePrompt = false; finishWorkout()">Jetzt beenden</button>
        </div>
      </div>

      <aside class="rail-col">
        <WorkoutClock />
        <div class="progress">
          <span>{{ store.progressLabel }}</span>
          <span v-if="activeMesocycle" class="meso-active-badge">
            Woche {{ activeMesocycle.currentWeek }}/{{ activeMesocycle.totalWeeks }} ·
            {{ activeMesocycle.weekPercents[activeMesocycle.currentWeek - 1] }}%
          </span>
        </div>
        <!-- Always visible during the workout (was only shown on the completion screen) so
             "what does this session train" is answerable at any point, not just at the end. -->
        <div class="muscle-preview">
          <div class="eyebrow">Trainierte Muskeln</div>
          <MuscleFigure :primary="sessionMuscles.primary" :secondary="sessionMuscles.secondary" />
        </div>
        <ExerciseRail />

        <!-- Mid-session add (feedback gap: no way to change what a session includes once
             started — equipment in use / a busy rack had no path but cancelling entirely). -->
        <button class="add-ex-btn" @click="showAddExercise = !showAddExercise">
          {{ showAddExercise ? "Abbrechen" : "+ Übung hinzufügen" }}
        </button>
        <div v-if="showAddExercise" class="add-ex-panel panel">
          <input v-model="addExerciseSearch" class="add-ex-search" type="text" placeholder="Übung suchen…" />
          <ul class="add-ex-list">
            <li v-for="ex in addExerciseCandidates" :key="ex.id">
              <button @click="addExerciseToSession(ex)">
                <ExerciseIcon :equipment="ex.equipment ?? 'bodyweight'" :size="16" />
                {{ exerciseName(ex.slug) }}
              </button>
            </li>
          </ul>
        </div>

        <button class="cancel-btn" :class="{ confirming: cancelConfirm.isArmed() }" @click="cancelConfirm.trigger()">
          {{ cancelConfirm.isArmed() ? "Wirklich abbrechen?" : "Workout abbrechen" }}
        </button>
      </aside>

      <section v-if="store.currentExercise && !store.allSetsLogged" class="focus-col">
        <div class="focus-head">
          <div>
            <span v-if="supersetLabel" class="superset-badge">{{ supersetLabel }}</span>
            <h2>{{ store.currentExercise.name }}</h2>
          </div>
          <div class="focus-head-actions">
            <!-- Was "Überspringen ⏭" — identical wording/weight to RestTimer's "Überspringen"
                 button, meaning something much more consequential (skip the whole exercise, not
                 the rest timer) with no visual distinction between the two (critique finding).
                 "Übung" disambiguates without adding a control. -->
            <button v-if="store.exercises.length > 1" class="skip-btn" @click="store.skipCurrentExercise()">
              Übung überspringen ⏭
            </button>
            <button class="info-btn" aria-label="Übungsinfo" @click="openInfo(store.currentExercise.exerciseId)">ⓘ</button>
          </div>
        </div>

        <!-- The mockup's "ZUM NÄCHSTEN RANG" bar lives inside the exercise card, mid-session
             (examples/Screenshot_20260824-175421.png) — every logged set visibly moves it,
             instead of the reward only being visible on a different tab (engagement rework W2).
             A skeleton fills the same slot while ranksStore is still loading — without it,
             this block pops in a moment after the rest of the page has already painted and
             shoves the reps entry/log button/rest timer down (feedback: fix layout shift,
             especially during a workout — this is the loudest offender, since it happens once
             per page load right as someone's trying to start logging). Once ranks have loaded,
             an exercise that genuinely has no rank yet (never logged) renders nothing at all —
             that's a real absence, not a loading flicker, so it doesn't get a reserved slot. -->
        <RankProgress
          v-if="currentRank"
          variant="inline"
          :tier="currentRank.tier"
          :division="currentRank.division"
          :lp="currentRank.lp"
          :next-target-weight-kg="currentRank.nextTargetWeightKg"
          :next-target-reps="currentRank.nextTargetReps"
          :trust="currentRank.trust"
        />
        <div v-else-if="!ranksStore.loaded" class="rank-skeleton shimmer" aria-hidden="true" />

        <button v-if="store.canInsertWarmup" class="warmup-btn" @click="store.insertWarmupSets()">
          + Aufwärmsätze einfügen
        </button>

        <!-- Always rendered (feedback: fix layout shift) — some sets have a "last time"
             reference and some don't (a freshly added exercise never does), so this used to pop
             in and out as you moved between sets, shoving the entry/button/timer below it up
             and down on every single set transition — the single most frequent interaction in
             the app. Reserved height + visibility toggle instead, same pattern as .reps-hint. -->
        <p class="last-ref" :class="{ 'last-ref-hidden': store.currentSet?.prevWeightKg == null && !store.currentSet?.prevReps }">
          Letztes Mal an dieser Stelle:
          <b>
            <template v-if="store.currentSet?.prevWeightKg != null">{{ store.currentSet.prevWeightKg }} kg × </template>
            {{ store.currentSet?.prevReps }} Wdh.
          </b>
        </p>

        <SetEntry />

        <div class="log-set-wrap">
          <template v-if="store.currentSet">
            <!-- Reps start at 0 (activeWorkoutStore.ts) so the button stays disabled until the
                 stepper is actually touched — a routine's target/last-time is shown above as a
                 reference, never silently submitted as what was actually done. -->
            <button class="btn-primary btn-lg btn-block log-set-btn" :disabled="store.currentSet.reps <= 0" @click="logSet">
              Satz speichern
            </button>
            <!-- Always rendered (not v-if) with a reserved min-height, visibility toggled
                 instead of the element being added/removed — otherwise the hint appearing and
                 disappearing as reps go from 0 pushes the rest timer / set list up and down
                 (feedback: fix layout shift during a workout, this is exactly that pattern). -->
            <p class="reps-hint" :class="{ 'reps-hint-hidden': store.currentSet.reps > 0 }">
              Wiederholungen eingeben, um den Satz zu speichern
            </p>
          </template>
          <p v-else class="exercise-done">Übung erledigt ✓</p>
          <span v-if="xpChip" :key="xpChip.key" class="xp-chip tnum pop-in">+{{ xpChip.amount }} XP</span>
        </div>

        <RestTimer :trigger="restTrigger" :seconds="restSeconds" />

        <ul class="set-rows tnum">
          <li v-for="s in store.currentExercise.sets" :key="s.index" :class="{ done: s.logged, warmup: s.isWarmup, 'pop-in': s.logged }">
            <!-- Tapping the badge opens "Satzart auswählen" (feedback: set kind must be
                 settable) — only while the set is still unlogged; a logged set's kind is
                 locked (see activeWorkoutStore.ts's setSetKind()), so the badge stops being a
                 button and just shows the outcome. -->
            <button
              v-if="!s.logged"
              class="sn"
              :class="`k-${s.kind ?? 'normal'}`"
              :aria-label="`Satzart wählen (aktuell ${kindLabel(s.kind)})`"
              @click="kindPickerFor = { workoutExerciseId: store.currentExercise!.workoutExerciseId, setIndex: s.index }"
            >
              {{ kindLetter(s.kind, s.index) }}
            </button>
            <span v-else class="sn">✓</span>
            <span>
              <template v-if="s.logged">
                <template v-if="s.weightKg != null">{{ s.weightKg }} kg · </template>{{ s.reps }} Wdh.
              </template>
              <template v-else-if="s.kind !== 'normal'">
                <template v-if="s.weightKg != null">{{ s.weightKg }} kg · </template>{{ s.reps }} Wdh. ({{ kindLabel(s.kind) }})
              </template>
              <template v-else>offen</template>
            </span>
          </li>
        </ul>
      </section>

      <SetKindPicker
        v-if="kindPickerFor"
        :workout-exercise-id="kindPickerFor.workoutExerciseId"
        :set-index="kindPickerFor.setIndex"
        @close="kindPickerFor = null"
        @remove="
          store.removeSet(kindPickerFor.workoutExerciseId, kindPickerFor.setIndex);
          kindPickerFor = null;
        "
        @pick="
          (kind) => {
            store.setSetKind(kindPickerFor!.workoutExerciseId, kindPickerFor!.setIndex, kind);
            kindPickerFor = null;
          }
        "
      />

      <div v-if="!(store.currentExercise && !store.allSetsLogged)" class="workout-complete">
        <p>Alle Übungen erledigt.</p>
        <button class="btn-primary btn-lg" @click="finishWorkout">Workout beenden</button>
      </div>
    </div>

    <ExerciseInfoPanel v-if="infoExercise" :exercise="infoExercise" @close="infoExerciseId = null" />
    </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.not-started {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
  align-items: flex-start;
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
  border: 1px solid var(--line);
  position: relative;
  /* Entrance stagger + hover lift (feedback: the rest of the app was still missing the
     dashboard's liveliness) — this is the actual "choose a workout" screen, so it's worth as
     much life as the dashboard itself. Uses --ease-out, not --ease-spring: the overshoot easing
     is reserved for earned moments (rank-up, PR, level-up) per motion.css's own convention —
     a routine list entrance isn't one of those (see commit 8c0f158 for the same fix elsewhere). */
  animation: pop-in var(--dur-base) var(--ease-out) both;
  transition: box-shadow var(--dur-base) var(--ease-out);
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
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp2);
}
.rc-head b {
  font-size: 15.5px;
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
.meso-active-badge {
  display: block;
  margin-top: 2px;
  color: var(--blue-hi);
  font-weight: 700;
}
.finished-summary {
  max-width: var(--content-w-narrow);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp2);
}
.finished-summary .eyebrow {
  --eyebrow-color: var(--dim);
  margin-top: var(--sp3);
}
.finished-summary h2 {
  font-size: 22px;
  margin-bottom: var(--sp3);
}
.finished-summary .stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp2);
  margin-bottom: var(--sp2);
}
.finished-summary .btn-primary {
  margin-top: var(--sp5);
}
.reward-recap {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp4);
  margin-bottom: var(--sp3);
}
.recap-badge {
  width: 44px;
  height: 50px;
  flex: none;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}
.recap-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.recap-body b {
  font-size: 17px;
  color: var(--tt, var(--text));
}
.recap-body span {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--pr);
}
.caption-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  margin-bottom: var(--sp2);
}
.caption-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.caption-item b {
  font-size: 12.5px;
}
/* .panel (tokens.css) supplies background/border/radius — a utility surface, not a reward one. */
.beat-panel {
  margin-top: var(--sp4);
  padding: var(--sp4);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  text-align: left;
}
.beat-panel p {
  font-size: 13.5px;
}
.beat-list {
  list-style: none;
  font-size: 12.5px;
  color: var(--dim);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.beat-done {
  color: var(--green);
  font-weight: 700;
}
.beat-actions {
  display: flex;
  gap: var(--sp2);
}
.beat-actions button {
  flex: 1;
}
.share-canvas {
  display: none;
}
.active-workout {
  display: flex;
  flex-direction: column;
  gap: var(--sp5);
}
/* .panel (tokens.css) supplies background/border/radius — a utility surface, not a reward one. */
.stale-banner {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  padding: var(--sp4);
}
.stale-banner p {
  font-size: 13.5px;
  color: var(--text);
}
.stale-actions {
  display: flex;
  gap: var(--sp2);
}
.stale-actions button {
  flex: 1;
}
.progress {
  font-size: 13px;
  color: var(--dim);
  padding: var(--sp2) 0;
}
.focus-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  margin-bottom: var(--sp2);
}
.focus-head h2 {
  font-size: 22px;
}
.superset-badge {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--on-blue-lo);
  background: var(--blue-lo);
  border-radius: 999px;
  padding: 2px 9px;
  margin-bottom: 4px;
}
.focus-head-actions {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  flex: none;
}
.skip-btn {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 7px 10px;
  white-space: nowrap;
}
/* Was 30x30px, below the 44px touch-target floor .btn-close already meets (critique finding:
   applied inconsistently). */
.info-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 15px;
  flex: none;
}
.add-ex-btn {
  font-size: 12px;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 8px 12px;
}
/* .panel (tokens.css) supplies background/border/radius — a utility surface, not a reward one. */
.add-ex-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  padding: var(--sp3);
}
.add-ex-search {
  padding: 8px 12px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
}
.add-ex-list {
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.add-ex-list button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp2);
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  background: var(--surface-3);
  color: var(--text);
  font-size: 13px;
  text-align: left;
}
.add-ex-list svg {
  color: var(--blue-hi);
}
.last-ref {
  font-size: 13px;
  color: var(--dim);
  margin-bottom: var(--sp2);
  min-height: 1.4em;
}
.last-ref-hidden {
  visibility: hidden;
}
/* Reserves roughly RankProgress's own inline-variant height (badge + two text lines + bar) so
   the page doesn't jump once ranksStore finishes loading and the real component takes this
   slot — see the template comment above. .shimmer (styles/motion.css) supplies the sweep. */
.rank-skeleton {
  height: 78px;
  border-radius: var(--r-lg);
  background-color: var(--surface-2);
}
.warmup-btn {
  font-size: 12px;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 8px 12px;
  margin-bottom: var(--sp3);
  align-self: flex-start;
}
/* Was --glow-blue on every instance — this is the ordinary CTA class (Quick Start, "Satz
   speichern", "Starten", routine save, …), so *every* screen had a glowing button, which
   reads as "everything is emphasized" = nothing is. Flat saturated fill instead (.btn-primary,
   tokens.css, itself bright now — the rework's whole point was that the *fill* should carry
   the emphasis, not a glow bolted onto a dark one); glow/motion stays reserved for an actually
   rare moment — the finish sequence's rank-up beat (FinishSequence.vue). */
.log-set-wrap {
  position: relative;
}
.log-set-btn {
  margin: var(--sp3) 0;
}
/* The most-tapped button in the app gets a tier-tinted focus ring instead of the global default
   (:focus-visible in tokens.css) — a small, cheap reminder of the user's tier on the one control
   they touch every set. Falls back to the standard --blue-hi ring before the tier loads. */
.log-set-btn:focus-visible {
  outline-color: var(--tier-accent, var(--blue-hi));
}
.reps-hint {
  font-size: 11.5px;
  color: var(--fire-hi);
  text-align: center;
  min-height: 1.4em;
}
.reps-hint-hidden {
  visibility: hidden;
}
/* "+N XP" (engagement rework W3) — floats up off the log-set button and fades, echoing the
   client-computed XP for the set that was just logged. Purely decorative; the real total
   still comes from xpStore via the server.
   Feedback: "the little xp gain animation is too quick, it is not really possible to see how
   much that set gained you" — the old 700ms run faded continuously from 15% straight to 100%,
   so it was never actually at full opacity for more than an instant. This holds at full
   opacity/scale through the middle of the run (25%-70%) before fading, and runs longer overall
   (1600ms, set in JS below alongside the matching xpChip clear-timeout) so there's real time to
   read the number instead of just catching a flash of it. */
.xp-chip {
  position: absolute;
  top: var(--sp3);
  right: var(--sp2);
  font-size: 13px;
  font-weight: 800;
  color: var(--pr);
  pointer-events: none;
  animation: xp-float 1600ms var(--ease-out) forwards;
}
@keyframes xp-float {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.9);
  }
  15% {
    opacity: 1;
    transform: translateY(-4px) scale(1);
  }
  70% {
    opacity: 1;
    transform: translateY(-16px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-28px) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .xp-chip {
    animation: none;
    opacity: 1;
  }
}
.set-rows {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--sp4);
}
.set-rows li {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  font-size: 13.5px;
}
/* Was `opacity: 0.75` — the only visible consequence of completing a set was that it faded
   (critique finding: the reward inverts). A logged set now gets a faint green tint instead,
   full opacity — done work reads as brighter, not dimmer. */
.set-rows li.done {
  background: color-mix(in srgb, var(--green) 14%, var(--surface-2));
}
.set-rows li.warmup:not(.done) {
  color: var(--dim);
}
/* .sn is a <button> for an unlogged set (tap to open "Satzart auswählen") and a plain <span>
   once logged — border/font reset here so the button variant doesn't inherit native button
   chrome; color comes from the .k-* kind classes below, same palette as SetKindPicker.vue. */
/* Was 22x22px — under the 44px touch-target floor .btn-close was already raised to meet
   (critique finding: applied inconsistently). Only the interactive (unlogged) state needs the
   floor; the logged state is a plain, non-interactive <span> and stays compact so the row
   doesn't visually swell once every set is logged. */
.set-rows button.sn {
  width: 44px;
  height: 44px;
}
.set-rows .sn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-3);
  border: none;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  font-family: inherit;
  flex: none;
  transition: transform var(--dur-fast) var(--ease-out);
}
button.sn:active {
  transform: scale(0.88);
}
.set-rows .sn.k-warmup {
  background: var(--fire);
  color: var(--k-warmup-text);
}
.set-rows .sn.k-normal {
  background: var(--surface-3);
  color: var(--text);
}
.set-rows .sn.k-failure {
  background: var(--red);
  color: var(--k-failure-text);
}
.set-rows .sn.k-dropset {
  background: var(--expert-3);
  color: var(--k-dropset-text);
}
.exercise-done {
  color: var(--dim);
  padding: var(--sp4) 0;
}
.workout-complete {
  color: var(--dim);
  padding: var(--sp4) 0;
  text-align: center;
}
.muscle-preview {
  padding: var(--sp3);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}
.muscle-preview .eyebrow {
  margin-bottom: var(--sp2);
}
/* Was styled identically to every other secondary rail button (add exercise, warm-up) — a
   destructive action needs to read as one before you tap it, not only after (when it flips
   to the .confirming fill). Red text/border on a transparent fill marks it as "careful" at a
   glance without competing with the solid-red confirm step. */
.cancel-btn {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--red);
  background: transparent;
  border: 1px solid var(--red-lo);
  border-radius: var(--r-md);
  padding: 10px 12px;
}
.cancel-btn.confirming {
  background: var(--red-lo);
  border-color: var(--red);
  color: var(--text);
}

/* UI/UX rework audit P0-B: a fixed 260px rail + a capped-520px focus column inside a flex
   row left the rest of any wide desktop viewport as dead black space on the right. Centering
   the pair as a unit is the P0 minimum fix; a real third context zone (rank progress + muscle
   preview, per the audit's §6 spec) is a larger content addition for later, not a structural
   one. The pre-workout routine list below used to just center at a fixed card size on the
   reasoning that a short list shouldn't stretch — feedback overturned that: the cards
   themselves should get bigger and use more whitespace on desktop, not just be recentered
   (see .routine-grid's own min-width:900px rule for the actual size bump). */
@media (min-width: 900px) {
  .not-started {
    align-items: center;
    width: 100%;
  }
  .active-workout {
    flex-direction: row;
    align-items: flex-start;
    justify-content: center;
    max-width: var(--content-w-wide);
    margin: 0 auto;
    width: 100%;
  }
  .rail-col {
    width: 260px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--sp4);
  }
  .focus-col {
    flex: 1;
    max-width: 520px;
  }
}
</style>
