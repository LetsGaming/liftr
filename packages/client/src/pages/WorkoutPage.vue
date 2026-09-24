<script setup lang="ts">
/**
 * The sacred loop. "Start" prefers a real saved Routine — one tap, no rebuilding. The old
 * "quick start first 4 catalog exercises" ad-hoc flow stays as a fallback for when no routine
 * exists yet, since it's still useful to exercise the loop on a fresh install before you've
 * built anything.
 */
import BasePage from "../components/patterns/BasePage.vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import ExerciseDetailContent from "../components/exercise/ExerciseDetailContent.vue";
import ExerciseIcon from "../components/exercise/ExerciseIcon.vue";
import ExerciseRail from "../components/exercise/ExerciseRail.vue";
import FinishSequence from "../components/workout/FinishSequence.vue";
import AppIcon from "../components/base/AppIcon.vue";
import MuscleFigure from "../components/exercise/MuscleFigure.vue";
import NoteCapture from "../components/workout/NoteCapture.vue";
import RankProgress from "../components/rank/RankProgress.vue";
import TierBadge from "../components/rank/TierBadge.vue";
import RestTimer from "../components/workout/RestTimer.vue";
import RoutineList from "../components/routine/RoutineList.vue";
import RpeCapture from "../components/workout/RpeCapture.vue";
import SetEntry from "../components/workout/SetEntry.vue";
import SetKindPicker from "../components/workout/SetKindPicker.vue";
import SheetModal from "../components/patterns/SheetModal.vue";
import StatTile from "../components/patterns/StatTile.vue";
import Button from "../components/base/Button.vue";
import Input from "../components/base/Input.vue";
import IconButton from "../components/patterns/IconButton.vue";
import ListRow from "../components/patterns/ListRow.vue";
import SyncIndicator from "../components/shell/SyncIndicator.vue";
import TabSwitcher from "../components/patterns/TabSwitcher.vue";
import TruncatingLabel from "../components/base/TruncatingLabel.vue";
import WorkoutClock from "../components/workout/WorkoutClock.vue";
import { useAddExerciseToSession } from "../composables/useAddExerciseToSession";
import { useMesocycleControls } from "../composables/useMesocycleControls";
import { useStartRoutine } from "../composables/useStartRoutine";
import { useWorkoutFinish } from "../composables/useWorkoutFinish";
import { showingFinishRecap } from "../composables/useWorkoutChrome";
import { useWorkoutShareCard } from "../composables/useWorkoutShareCard";
import { useToast } from "../composables/useToast";
import { useXpChip } from "../composables/useXpChip";
import { haptics } from "../lib/haptics";
import { canCopyToClipboard } from "../lib/shareCard";
import { aggregateMuscles } from "../lib/muscles";
import { TIER_LABEL_DE, type RankTier } from "../lib/tierIcons";
import { TIERS, type Tier } from "@liftr/shared";
import { useActiveWorkoutStore, SET_KIND_LABEL, type SetKind } from "../stores/activeWorkoutStore";
import { useCatalogStore } from "../stores/catalogStore";
import { useHistoryStore } from "../stores/historyStore";
import { useRanksStore } from "../stores/ranksStore";
import { useOverallRankStore } from "../stores/overallRankStore";
import { useRoutineStore } from "../stores/routineStore";
import { useStreakStore } from "../stores/streakStore";
import { useXpStore } from "../stores/xpStore";

const catalog = useCatalogStore();
const store = useActiveWorkoutStore();
const routineStore = useRoutineStore();
const streakStore = useStreakStore();
const ranksStore = useRanksStore();
const xpStore = useXpStore();
const overallRank = useOverallRankStore();
const historyStore = useHistoryStore();
const { exerciseName } = useStartRoutine();

const restTrigger = ref(0);
/** Which rest duration RestTimer should run for next — set by logSet() from whatever
 *  store.logCurrentSet() decided (between-set vs after-exercise pauses can differ). */
const restSeconds = ref(90);
/** Which of the three rest states logCurrentSet() just produced — 'between-sets'/
 *  'after-exercise' for a real rest duration, 'superset-continue' for the mid-superset
 *  round-robin case where logCurrentSet() returns null (round not yet complete, no rest).
 *  RestTimer.vue renders all three distinctly instead of just "running vs not". */
const restKind = ref<"between-sets" | "after-exercise" | "superset-continue">("between-sets");

/** The set-row entrance class can't bind directly to the durable `s.logged` flag: any unrelated
 *  re-render of the set list (e.g. reordering, a sibling set changing) re-evaluates such a
 *  binding, and since the class would already be present it wouldn't restart the animation
 *  *unless* the whole `<li>` gets torn down and remounted (Vue's `:key="s.index"` diffing can do
 *  exactly that when items shift), which would visibly stutter given sets can be logged in quick
 *  succession. Tracking the index that *just* logged instead means pop-in only ever applies for
 *  one short window right after the event, then clears itself — later re-renders of the same row
 *  see `justLoggedIndex === null` and never re-add the class. */
const justLoggedIndex = ref<number | null>(null);

/**
 * Session-aggregate muscle map: union of every muscle trained across the whole workout, primary
 * winning over secondary if an exercise disagrees with another. Needed
 * both by the template (mid-session muscle preview) and by useWorkoutFinish's snapshot, so it's
 * computed here and passed into the composable rather than re-derived inside it.
 */
const sessionMuscles = computed(() => aggregateMuscles(store.exercises.map((ex) => catalog.byId(ex.exerciseId)?.muscles ?? [])));

const {
  finishedSummary,
  finishSequenceDone,
  sessionXp,
  sessionRankUps,
  captionRows,
  logSetXp,
  consistencyBonusXp,
  varietyBonusXp,
  newMuscleSlugs,
  finishXpSnapshot,
  routineBeats,
  updatingRoutine,
  routineUpdated,
  updateRoutineWithBeats,
  streakDays,
  finishWorkout,
} = useWorkoutFinish(
  { activeWorkoutStore: store, routineStore, streakStore, ranksStore, xpStore, historyStore, catalogStore: catalog, overallRankStore: overallRank },
  sessionMuscles,
  exerciseName,
);

/** Keeps App.vue's top-hud in sync with the recap being shown here, so it can hide its own
 *  level/XP chip while FinishSequence's Fortschritt beat displays the same number — see
 *  useWorkoutChrome.ts for why this isn't just activeWorkoutStore state. */
watch(
  finishedSummary,
  (v) => {
    showingFinishRecap.value = v != null;
  },
  // immediate: resyncs the module singleton to this fresh mount's (always-null) initial value —
  // guards against a stale `true` surviving if the user left mid-recap via the tab bar instead of
  // tapping "Fertig" (which is the only other place finishedSummary gets cleared).
  { immediate: true },
);

/** Highest tier among this session's *genuine* rank-ups, if any, so the summary can keep the
 *  tier/level state as its first visual instead of duplicating FinishSequence's beats and
 *  opening straight into three gray StatTiles with no continuation from the emotional peak. A
 *  discounted-only session must never look genuine, so it falls back to no badge at all,
 *  matching FinishSequence's topTierClass. */
/** The post-Finish-Sequence recap chip below must show the *full* session total, not just the
 *  client-accumulated per-set sessionXp — the two session-level bonuses (consistency, variety)
 *  are computed server-side once at finish time and arrive via useWorkoutFinish alongside it. */
const sessionXpTotal = computed(() => sessionXp.value + consistencyBonusXp.value + varietyBonusXp.value);

const topRankUp = computed(() => {
  const genuine = sessionRankUps.value.filter((r) => !r.plausibilityNote);
  if (genuine.length === 0) return null;
  return genuine.reduce((best, r) =>
    TIERS.indexOf(r.tier as Tier) > TIERS.indexOf(best.tier as Tier) ? r : best,
  );
});

/** Share-card tier badge: the account's current overall rank + level, not a per-exercise band —
 *  same overallRankStore/xpStore data App.vue's shell and OverviewPage.vue's "Gesamtrang" tile
 *  already read, reused here rather than a third source of truth. */
const shareTier = computed(() =>
  overallRank.current ? { tier: overallRank.current.tier, division: overallRank.current.division, level: xpStore.level } : null,
);
const { finishedCanvas, sharingFinished, shareFinished, copyingFinished, copyFinished } = useWorkoutShareCard(
  finishedSummary,
  sessionRankUps,
  shareTier,
  topRankUp,
);

const { toast } = useToast();
const canCopyShareImage = canCopyToClipboard();
async function onCopyFinished() {
  const ok = await copyFinished();
  toast(ok ? "In Zwischenablage kopiert" : "Kopieren fehlgeschlagen");
}

/** The occasional-use session actions ("Übung hinzufügen", "Workout-Notiz", "Aufwärmsätze
 *  einfügen", "Workout abbrechen") live behind one compact "⋯" trigger (see `.overflow-btn`
 *  below), opened as a small sheet, rather than as always-visible buttons crammed in right below
 *  the clock/pause — the single most-crowded spot on the screen, competing for space with the
 *  elapsed-time clock and the rank-reveal icon a lifter actually touches every set. Everything a
 *  lifter touches every set (clock/pause, current exercise, weight/reps entry) stays exactly
 *  where it was. */
const showWorkoutMenu = ref(false);

/** "Workout abbrechen" confirmation: a visible inline banner the user must explicitly dismiss
 *  or confirm — no auto-expiring timer. Was previously a silent tap-twice-within-3s pattern
 *  (useConfirmTap), which only swapped a tiny icon-button's label with no dialog/banner and no
 *  visible countdown; too easy to trigger by accident on a destructive, unrecoverable,
 *  whole-workout-ending action (UX audit finding). */
const showCancelConfirm = ref(false);
function confirmCancelWorkout() {
  showCancelConfirm.value = false;
  showWorkoutMenu.value = false;
  void store.cancelWorkout();
}

const { activeMesocycle } = useMesocycleControls(store, routineStore);

const { showAddExercise, addExerciseSearch, addExerciseCandidates, addExerciseToSession } = useAddExerciseToSession(
  store,
  () => catalog.exercises,
  exerciseName,
);

const { xpChip, trigger: triggerXpChip } = useXpChip();

/** Opened as a sheet, not a navigation — leaving the workout screen mid-set would unmount the
 *  active rest timer/scroll position/open pickers even though the workout itself survives in the
 *  store. Every other entry point (ExercisesPage, RankLifterSection, ...) still routes to
 *  `/exercises/:slug`. */
const infoExerciseSlug = ref<string | null>(null);
const infoExerciseTitle = computed(() => {
  const exercise = infoExerciseSlug.value ? catalog.bySlug(infoExerciseSlug.value) : undefined;
  return exercise ? exerciseName(exercise.slug, exercise.name) : "Übung";
});
function openInfo(exerciseId: string) {
  const exercise = catalog.byId(exerciseId);
  if (exercise) infoExerciseSlug.value = exercise.slug;
}

/** "Satzart auswählen" — which set's picker is open. */
const kindPickerFor = ref<{ workoutExerciseId: string; setIndex: number } | null>(null);

/** RPE capture — off the primary logging path: this only toggles a sheet's visibility, never
 *  touches `Satz speichern`'s disabled condition. Reads/writes straight off
 *  `store.currentSet.rpe` (no local copy to go stale) so it automatically reads as unset again
 *  once the set logs and the store's `currentSet` advances to the next one. */
const showRpeCapture = ref(false);

/** Notes capture — one sheet, two targets: 'set' writes store.currentSet.notes (same
 *  per-set, off-the-primary-path timing as RPE, rides along in the next logCurrentSet() call),
 *  'workout' writes store.workoutNotes (session-level, sent in finish()'s payload).
 *  A single ref instead of two separate open-flags since only one of these sheets is ever open
 *  at a time and they share one component. */
const noteCaptureTarget = ref<"set" | "workout" | null>(null);
const noteCaptureTitle = computed(() => (noteCaptureTarget.value === "workout" ? "Workout-Notiz" : "Notiz zum Satz"));
const noteCaptureValue = computed(() =>
  noteCaptureTarget.value === "workout" ? store.workoutNotes : (store.currentSet?.notes ?? null),
);
function saveNoteCapture(value: string | null) {
  // NoteCapture.vue dismisses its own sheet (sheetRef.dismiss()) before/alongside emitting
  // "save" — that dismiss's @did-dismiss fires @close above, which is what actually nulls
  // noteCaptureTarget. Don't also toggle it here: unmounting NoteCapture out from under Ionic's
  // own async dismiss teardown is exactly the crash SheetModal.vue's header comment documents.
  if (noteCaptureTarget.value === "workout") store.setWorkoutNotes(value);
  else store.setCurrentSetNotes(value);
}

/** Defensive fallback to "normal": `kind` on an `ActiveSet` can be undefined depending on how the
 *  set was created (activeWorkoutStore.restore() backfills it from `isWarmup` when restoring a
 *  persisted workout), so this keeps a `SET_KIND_LABEL[kind]` lookup from crashing on any path
 *  that hands back a set without one. */
function kindLabel(kind: SetKind | undefined): string {
  return SET_KIND_LABEL[kind ?? "normal"];
}
/** Normal sets show their position in the exercise; every other kind shows a fixed letter
 *  instead — matches the reference app's "A"/"F"/"D" badges (SetKindPicker.vue uses the same
 *  SET_KIND_LABEL for its own row icons). */
function kindLetter(kind: SetKind | undefined, index: number): string {
  return !kind || kind === "normal" ? String(index + 1) : SET_KIND_LABEL[kind][0]!;
}

/** "Superset 2/3" — position within the group, for the focus header. */
const supersetLabel = computed(() => {
  const ex = store.currentExercise;
  if (!ex || ex.supersetGroup == null) return null;
  const group = store.exercises.filter((e) => e.supersetGroup === ex.supersetGroup);
  const pos = group.findIndex((e) => e.workoutExerciseId === ex.workoutExerciseId);
  return `Superset ${pos + 1}/${group.length}`;
});

/** Nudges the user when a workout has been running indefinitely (never cancelled or ended).
 *  Checked once right after restore() picks a resumed session back up, not reactively, so it
 *  nudges once per app open/reload instead of re-appearing on every navigation back to this tab
 *  while the user is deliberately still mid-session. */
const showStalePrompt = ref(false);

onMounted(async () => {
  await Promise.all([catalog.load(), store.restore(), routineStore.load(), ranksStore.load(), historyStore.load(), overallRank.load()]);
  showStalePrompt.value = store.isStale;
  await ensureLogButtonVisible();
});

/** On a short exercise, "Satz speichern" can render entirely within the fixed mobile tab bar's
 *  own band — geometrically inside ion-content's scrollport, but visually covered by a sibling
 *  the browser's own visibility check knows nothing about. `scroll-margin-bottom` (see
 *  .log-set-wrap) tells `scrollIntoView` to treat that band as off-screen too, so this only
 *  scrolls when the button would otherwise land there. */
const logSetWrapRef = ref<HTMLElement | null>(null);
async function ensureLogButtonVisible() {
  await nextTick();
  // Optional chaining on the call itself, not just the ref: jsdom (tests/README.md's environment
  // for this file) has no layout engine and doesn't implement scrollIntoView at all.
  logSetWrapRef.value?.scrollIntoView?.({ block: "nearest" });
}

/** A single compact line — the next exercise's name plus its *first set's* weight/reps (e.g.
 *  "Nächste Übung: Schulterdrücken · 40 kg × 10"), letting a lifter prep plates/equipment before
 *  the transition. `undefined` on the routine's last exercise — the empty state (see the
 *  template's `next-ex-empty` branch) rather than silently hiding the whole row, which would
 *  look like a layout bug. */
const nextExercisePreview = computed(() => {
  const next = store.exercises[store.currentExerciseIndex + 1];
  if (!next) return undefined;
  const firstSet = next.sets[0];
  const w = firstSet?.weightKg != null ? Math.round(firstSet.weightKg * 100) / 100 : null;
  const summary = firstSet ? `${w != null ? `${w} kg × ` : ""}${firstSet.reps}` : null;
  return { name: next.name, summary };
});

/** The "overview" affordance opens the full exercise list (reusing ExerciseRail's own data/jump
 *  logic via its `variant="vertical"` rendering) in a sheet — preserves
 *  store.jumpToExercise(i)'s jump-to-any capability, just moved behind a deliberate tap instead
 *  of an always-visible rail. */
const showExerciseOverview = ref(false);

/** The rank/XP display keeps its exact existing presentation (RankProgress, variant="inline",
 *  below) rather than being folded into ExerciseInfoPanel's Rang tab. It's hidden by default and
 *  only rendered once this deliberate-reveal toggle is tapped, instead of always being on screen
 *  mid-set. No reserved-height skeleton is needed for this — a user can only reach this toggle
 *  after the page has already painted, so there's no auto-appearing-content layout shift to
 *  guard against here. */
const showRank = ref(false);

/** The exercise currently in focus's cached rank row, if one exists yet — context for the
 *  in-session RankProgress bar. Rank is now only ever recomputed once, when the workout
 *  finishes (see finishWorkout() below), so this reads the value as of the *start* of the
 *  session and stays static while logging — it no longer animates set-by-set. The reward for
 *  what actually changed this session shows in the finish sequence instead. */
const currentRank = computed(() => {
  const exerciseId = store.currentExercise?.exerciseId;
  return exerciseId ? ranksStore.ranks.find((r) => r.exerciseId === exerciseId) : undefined;
});

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
    restKind.value = wasLastUnloggedSet ? "after-exercise" : "between-sets";
    restTrigger.value += 1;
  } else if (set && reps > 0) {
    // Mid-superset round-robin: the round hasn't wrapped yet, so there's genuinely no rest to
    // run. Still bump the trigger so RestTimer.vue can render its distinct "no rest" state
    // instead of silently doing nothing — RestTimer.vue renders three distinct rest states.
    //
    // Guarded on set && reps > 0 (snapshotted *before* the await above) so a double-tap that
    // lands on logCurrentSet()'s other null-return cases — no current set, or its belt-and-
    // braces reps<=0 guard — can't masquerade as this case and stomp a real rest state that the
    // first tap just set.
    restKind.value = "superset-continue";
    restTrigger.value += 1;
  }

  if (set) {
    void haptics.tap();
    triggerXpChip(logSetXp(weightKg, reps, tier));
    // One-shot pop-in trigger — see justLoggedIndex's declaration. 260ms gives --dur-base's
    // 220ms animation a little headroom to finish before the class clears.
    justLoggedIndex.value = set.index;
    setTimeout(() => {
      if (justLoggedIndex.value === set.index) justLoggedIndex.value = null;
    }, 260);
  }
  if (wasLastUnloggedSet) void haptics.bump();
  void ensureLogButtonVisible();
}

// Same two tabs as RunsPage.vue's own TabSwitcher — kept as a literal here rather than a shared
// constant since it's just two short { id, label, to } objects, not logic.
const WORKOUT_RUNS_TABS = [
  { id: "workout", label: "Workout", to: "/workout" },
  { id: "runs", label: "Läufe", to: "/runs" },
];
</script>

<template>
  <BasePage title="Workout">
    <template v-if="!store.isActive && !finishedSummary" #subheader>
      <TabSwitcher :tabs="WORKOUT_RUNS_TABS" model-value="workout" nav-label="Workout oder Läufe" />
    </template>
    <div class="workout-page">
    <div v-if="finishedSummary" class="finished-summary">
      <FinishSequence
        v-if="!finishSequenceDone"
        :rank-ups="sessionRankUps"
        :streak="streakStore.streak"
        :streak-days="streakDays"
        :tokens-remaining="streakStore.tokensRemaining"
        :session-xp="sessionXp"
        :consistency-bonus-xp="consistencyBonusXp"
        :variety-bonus-xp="varietyBonusXp"
        :new-muscle-slugs="newMuscleSlugs"
        :level-before="finishXpSnapshot?.levelBefore ?? 0"
        :progress-before="finishXpSnapshot?.progressBefore ?? 0"
        :level-after="xpStore.level"
        :progress-after="xpStore.progressPercent"
        @done="finishSequenceDone = true"
      />
      <template v-else>
        <div class="eyebrow">Geschafft</div>
        <h2>{{ finishedSummary.routineName }}</h2>

        <div class="reward-recap panel-reward" :class="topRankUp ? `t-${topRankUp.tier}` : ''">
          <TierBadge v-if="topRankUp" class="recap-badge" :tier="topRankUp.tier" />
          <div class="recap-body">
            <b v-if="topRankUp">{{ TIER_LABEL_DE[topRankUp.tier as RankTier] }} erreicht</b>
            <b v-else>Lv. {{ xpStore.level }}</b>
            <span>+{{ sessionXpTotal }} XP{{ sessionRankUps.length > 1 ? ` · ${sessionRankUps.length} Rangaufstiege` : "" }}</span>
          </div>
        </div>

        <div class="eyebrow">Trainierte Muskeln</div>
        <MuscleFigure :primary="finishedSummary.muscles.primary" :secondary="finishedSummary.muscles.secondary" />

        <template v-if="captionRows.length > 0">
          <div class="eyebrow">Was sich verändert hat</div>
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
          <p v-if="routineUpdated" class="beat-done"><AppIcon name="check" /> Routine aktualisiert.</p>
          <div v-else class="beat-actions">
            <Button variant="secondary" @click="routineBeats = []">Nicht jetzt</Button>
            <Button :disabled="updatingRoutine" @click="updateRoutineWithBeats">
              {{ updatingRoutine ? "Wird gespeichert…" : "Routine aktualisieren" }}
            </Button>
          </div>
        </div>

        <div class="stat-row">
          <StatTile :value="finishedSummary.durationLabel" label="Dauer" />
          <StatTile :value="`${Math.round(finishedSummary.volumeKg).toLocaleString('de-DE')} kg`" label="Volumen" />
          <StatTile :value="finishedSummary.setCount" label="Sätze" />
        </div>

        <Button size="lg" block :disabled="sharingFinished" @click="shareFinished">
          <template v-if="sharingFinished">Erstelle Bild…</template>
          <template v-else><AppIcon name="share" /> Als Bild teilen</template>
        </Button>
        <Button v-if="canCopyShareImage" variant="secondary" block :disabled="copyingFinished" @click="onCopyFinished">
          <template v-if="copyingFinished">Kopiere…</template>
          <template v-else><AppIcon name="clipboard" /> In Zwischenablage kopieren</template>
        </Button>
        <Button variant="secondary" block @click="finishedSummary = null">Fertig</Button>
        <canvas ref="finishedCanvas" class="share-canvas" aria-hidden="true" />
      </template>
    </div>

    <RoutineList v-else-if="!store.isActive" />

    <div v-else class="active-workout">
      <div v-if="showStalePrompt" class="stale-banner panel">
        <p>
          Dieses Workout läuft seit über {{ Math.floor(store.elapsedSeconds / 3600) }} Stunden. Läuft es noch, oder hast du
          vergessen, es zu beenden?
        </p>
        <div class="stale-actions">
          <Button variant="secondary" @click="showStalePrompt = false">Läuft noch</Button>
          <Button @click="showStalePrompt = false; finishWorkout()">Jetzt beenden</Button>
        </div>
      </div>

      <aside class="rail-col">
        <SyncIndicator />
        <WorkoutClock>
          <template #actions>
            <span class="cancel-divider" aria-hidden="true" />
            <button class="cancel-btn" aria-label="Workout abbrechen" @click="showCancelConfirm = true">✕</button>
          </template>
        </WorkoutClock>
        <div v-if="showCancelConfirm" class="cancel-confirm panel">
          <p>Workout wirklich abbrechen? Der gesamte Fortschritt geht verloren.</p>
          <div class="cancel-confirm-actions">
            <Button variant="secondary" @click="showCancelConfirm = false">Nein</Button>
            <button class="btn-cancel-confirm" @click="confirmCancelWorkout">Ja, abbrechen</button>
          </div>
        </div>
        <div class="progress-row">
          <div class="progress">
            <span>{{ store.progressLabel }}</span>
            <span v-if="activeMesocycle" class="meso-active-badge">
              Woche {{ activeMesocycle.currentWeek }}/{{ activeMesocycle.totalWeeks }} ·
              {{ activeMesocycle.weekPercents[activeMesocycle.currentWeek - 1] }}%
            </span>
          </div>
          <button class="overflow-btn" aria-label="Weitere Optionen" @click="showWorkoutMenu = true">⋯</button>
        </div>
        <ExerciseRail class="rail-list-desktop" />

        <div v-if="showAddExercise" class="add-ex-panel panel">
          <div class="add-ex-panel-head">
            <b>Übung hinzufügen</b>
            <IconButton variant="close" label="Schließen" @click="showAddExercise = false">✕</IconButton>
          </div>
          <Input v-model="addExerciseSearch" class="add-ex-search" type="text" placeholder="Übung suchen…" />
          <ul class="add-ex-list">
            <li v-for="ex in addExerciseCandidates" :key="ex.id">
              <ListRow as="button" @click="addExerciseToSession(ex)">
                <template #leading>
                  <ExerciseIcon :equipment="ex.equipment ?? 'bodyweight'" :size="16" />
                </template>
                {{ exerciseName(ex.slug, ex.name) }}
              </ListRow>
            </li>
          </ul>
        </div>
      </aside>

      <div v-if="nextExercisePreview || store.exercises.length > 1" class="next-ex-row rail-strip-mobile surface-hybrid">
        <div v-if="nextExercisePreview" class="next-ex-lines">
          <span class="next-ex-label">Nächste Übung</span>
          <span class="next-ex-name">{{ nextExercisePreview.name }}</span>
          <span v-if="nextExercisePreview.summary" class="next-ex-summary">{{ nextExercisePreview.summary }}</span>
        </div>
        <span v-else class="next-ex-lines next-ex-empty">Letzte Übung dieser Routine</span>
        <button class="next-ex-overview-btn surface-hybrid" aria-label="Alle Übungen anzeigen" @click="showExerciseOverview = true">
          <AppIcon name="drag-handle" />
        </button>
      </div>

      <section v-if="store.currentExercise && !store.allSetsLogged" class="focus-col">
        <div class="focus-head">
          <div class="focus-head-title">
            <span v-if="supersetLabel" class="superset-badge">{{ supersetLabel }}</span>
            <TruncatingLabel as="h2">{{ store.currentExercise.name }}</TruncatingLabel>
          </div>
          <div class="focus-head-actions">
            <button v-if="store.exercises.length > 1" class="skip-btn surface-hybrid" @click="store.skipCurrentExercise(); ensureLogButtonVisible()">
              Übung überspringen <AppIcon name="skip-forward" />
            </button>
            <div class="focus-head-info-group">
              <button
                class="info-btn rank-toggle-btn surface-hybrid"
                :class="{ active: showRank }"
                :aria-pressed="showRank"
                aria-label="Rang anzeigen"
                @click="showRank = !showRank"
              >
                <AppIcon name="trophy" />
              </button>
              <button class="info-btn surface-hybrid" aria-label="Übungsinfo" @click="openInfo(store.currentExercise.exerciseId)"><AppIcon name="info" /></button>
            </div>
          </div>
        </div>
        <RankProgress
          v-if="showRank && currentRank"
          variant="inline"
          :tier="currentRank.tier"
          :division="currentRank.division"
          :lp="currentRank.lp"
          :next-target-weight-kg="currentRank.nextTargetWeightKg"
          :next-target-reps="currentRank.nextTargetReps"
          :trust="currentRank.trust"
        />
        <p class="last-ref" :class="{ 'last-ref-hidden': store.currentSet?.prevWeightKg == null && !store.currentSet?.prevReps }">
          Letztes Mal an dieser Stelle:
          <b>
            <template v-if="store.currentSet?.prevWeightKg != null">{{ Math.round(store.currentSet.prevWeightKg * 100) / 100 }} kg × </template>
            {{ store.currentSet?.prevReps }} Wdh.
          </b>
        </p>

        <SetEntry />
        <div v-if="store.currentSet" class="set-meta-row">
          <button class="meta-pill surface-hybrid" @click="showRpeCapture = true">
            {{ store.currentSet.rpe != null ? `RPE ${store.currentSet.rpe}` : "RPE" }}
          </button>
          <button class="meta-pill note-pill surface-hybrid" @click="noteCaptureTarget = 'set'">
            {{ store.currentSet.notes ? `Notiz: ${store.currentSet.notes}` : "Notiz" }}
          </button>
        </div>
        <RestTimer :trigger="restTrigger" :seconds="restSeconds" :rest-kind="restKind" />

        <div ref="logSetWrapRef" class="log-set-wrap">
          <template v-if="store.currentSet">
            <Button size="lg" block class="log-set-btn" :disabled="store.currentSet.reps <= 0" @click="logSet">
              Satz speichern
            </Button>
            <p class="reps-hint" :class="{ 'reps-hint-hidden': store.currentSet.reps > 0 }">
              Erst Wiederholungen, dann speichern.
            </p>
          </template>
          <p v-else class="exercise-done">Übung erledigt <AppIcon name="check" /></p>
          <span v-if="xpChip" :key="xpChip.key" class="xp-chip tnum pop-in">+{{ xpChip.amount }} XP</span>
        </div>

        <ul class="set-rows tnum">
          <li v-for="s in store.currentExercise.sets" :key="s.index" :class="{ done: s.logged, warmup: s.isWarmup, 'pop-in': justLoggedIndex === s.index }">
            <button
              v-if="!s.logged"
              class="sn"
              :class="`k-${s.kind ?? 'normal'}`"
              :aria-label="`Satzart wählen (aktuell ${kindLabel(s.kind)})`"
              @click="kindPickerFor = { workoutExerciseId: store.currentExercise!.workoutExerciseId, setIndex: s.index }"
            >
              {{ kindLetter(s.kind, s.index) }}
            </button>
            <span v-else class="sn"><AppIcon name="check" /></span>
            <span>
              <template v-if="s.logged">
                <template v-if="s.weightKg != null">{{ Math.round(s.weightKg * 100) / 100 }} kg · </template>{{ s.reps }} Wdh.
              </template>
              <template v-else-if="s.kind !== 'normal'">
                <template v-if="s.weightKg != null">{{ Math.round(s.weightKg * 100) / 100 }} kg · </template>{{ s.reps }} Wdh. ({{ kindLabel(s.kind) }})
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

      <RpeCapture
        v-if="showRpeCapture"
        :current-rpe="store.currentSet?.rpe ?? null"
        @close="showRpeCapture = false"
        @pick="store.setCurrentSetRpe($event)"
      />

      <NoteCapture
        v-if="noteCaptureTarget"
        :title="noteCaptureTitle"
        :model-value="noteCaptureValue"
        @close="noteCaptureTarget = null"
        @save="saveNoteCapture"
      />

      <SheetModal v-if="showWorkoutMenu" title="Mehr" @close="showWorkoutMenu = false">
        <div class="workout-menu">
          <button class="menu-item" @click="showWorkoutMenu = false; showAddExercise = true">
            + Übung hinzufügen
          </button>
          <button class="menu-item" @click="showWorkoutMenu = false; noteCaptureTarget = 'workout'">
            {{ store.workoutNotes ? `Workout-Notiz: ${store.workoutNotes}` : "+ Workout-Notiz" }}
          </button>
          <button
            v-if="store.canInsertWarmup"
            class="menu-item"
            @click="showWorkoutMenu = false; store.insertWarmupSets()"
          >
            + Aufwärmsätze einfügen
          </button>
        </div>
      </SheetModal>

      <div v-if="!(store.currentExercise && !store.allSetsLogged)" class="workout-complete">
        <p>Alle Übungen erledigt.</p>
        <Button size="lg" @click="finishWorkout">Workout beenden</Button>
      </div>
    </div>

    <SheetModal v-if="showExerciseOverview" title="Übungen" @close="showExerciseOverview = false">
      <ExerciseRail @jump="showExerciseOverview = false; ensureLogButtonVisible()" />
    </SheetModal>

    <SheetModal
      v-if="infoExerciseSlug"
      :title="infoExerciseTitle"
      desktop-variant="drawer"
      desktop-width="480px"
      @close="infoExerciseSlug = null"
    >
      <div style="--content-inset: var(--sp5)">
        <ExerciseDetailContent :slug="infoExerciseSlug" />
      </div>
    </SheetModal>
    </div>
  </BasePage>
</template>

<style scoped>
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
  --badge-size: 44px;
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
  color: var(--success);
  font-weight: 700;
}
/* `flex: 1` split the row 50/50, and at mobile widths that gave "Routine aktualisieren" too
   little space, wrapping it onto two lines while the shorter "Nicht jetzt" stayed on one, so
   .btn-secondary's 44px min-height won while .btn-primary grew taller and the two buttons
   didn't match height. Stacking them full-width on mobile (each gets the whole row, so neither
   wraps) fixes it there; the >=900px row layout below has enough width for both on one line. */
.beat-actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.beat-actions button {
  width: 100%;
}
@media (min-width: 900px) {
  .beat-actions {
    flex-direction: row;
  }
  .beat-actions button {
    flex: 1;
    width: auto;
  }
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

/* Uses the shared .surface-hybrid utility (translucent + blurred, gradient hairline via ::after)
   rather than a flat fill + border — border dropped since the hairline pseudo-element does that
   job (same pattern as .panel above). */
.next-ex-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-md);
}
/* Was a single nowrap+ellipsis line cramming label/name/weight×reps together, which truncated
   on anything but a short name (feedback: "should go across more rows to actually be able to
   display all the data" — the mid-workout screen already has the vertical room for it). Three
   stacked rows instead — label, name, summary — each free to wrap instead of being clipped. */
.next-ex-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.next-ex-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--faint);
}
.next-ex-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
  overflow-wrap: anywhere;
}
.next-ex-summary {
  font-size: 12.5px;
  color: var(--dim);
}
.next-ex-empty {
  font-style: italic;
  color: var(--faint);
}
/* .surface-hybrid instead of a flat fill (see .next-ex-row above). */
.next-ex-overview-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--text);
  font-size: 15px;
  flex: none;
}
/* Placed after .next-ex-row's own unconditional `display: flex` (source order matters here —
   two same-specificity class selectors on one element resolve ties by whichever rule comes
   later) so this actually wins at >=900px, where the vertical rail in .rail-col already covers
   "what's next"/jump-to-any and this row would otherwise duplicate it. */
@media (min-width: 900px) {
  .rail-strip-mobile {
    display: none;
  }
}
@media (max-width: 899.98px) {
  .rail-list-desktop {
    display: none;
  }
}
.stale-actions button {
  flex: 1;
}
/* The progress label shares a row with the "⋯" overflow trigger (the one remaining
   session-level control up here) instead of that trigger needing its own separate row. */
.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp2);
}
.progress {
  font-size: 13px;
  color: var(--dim);
  padding: var(--sp2) 0;
}
/* Reuses .info-btn's exact 44px round shape/touch-target so the header keeps the same visual
   language it already established for icon-only actions (ⓘ, 🏆), instead of a new one for this
   single new control. */
.overflow-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 20px;
  line-height: 1;
  flex: none;
}
/* Bug fix (product owner report): title and actions used to sit side by side
   (row + space-between), which squeezed a long exercise name against the skip/rank/info
   buttons. Now stacked — title on its own row, actions on the row below — same pattern as
   the rest of this header's children. */
.focus-head {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp2);
  margin-bottom: var(--sp2);
}
/* Flex column + min-width:0 wrapper so TruncatingLabel's h2 can actually truncate instead of
   wrapping/breaking mid-word — TruncatingLabel.vue's header comment requires an immediate
   flex/grid parent, which this unclassed div previously was not (min-width:0 only overrides a
   flex/grid item's default auto min-width, it does nothing inside a plain block parent). */
.focus-head-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
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
/* Law-of-Proximity fix (UX-08): groups the two icon-only affordances (rank/info) away from the
   unrelated "Übung überspringen" pill instead of all three reading as one row of same-weight
   controls — pushed to the row's far end so the skip pill and the info group visually separate. */
.focus-head-info-group {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  margin-left: auto;
}
/* N2: was a flat --surface-2 fill — .surface-hybrid instead (see .next-ex-row above). */
.skip-btn {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--dim);
  border-radius: var(--r-md);
  padding: 7px 10px;
  white-space: nowrap;
}
/* Was 30x30px, below the 44px touch-target floor .btn-close already meets (critique finding:
   applied inconsistently). N2: was a flat --surface-2 fill — .surface-hybrid instead. */
.info-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--text);
  font-size: 15px;
  flex: none;
}
/* The rank-reveal toggle reuses .info-btn's shape/size, marked "on" via a distinct fill so it
   reads as a real state change. Derived as a Nebula-tinted version of the same .surface-hybrid
   base .info-btn already carries, rather than a flat opaque fill, so it stays in the same
   translucent family as every other hybrid surface on this screen: color-mix's result keeps that
   translucency, and the added ring is the cheapest legible way to say "revealed" while reusing
   only existing tokens (--nebula-m/--nebula-ink), matching the positive list's allowance of a
   Nebula ring/accent on an interactive state indicator (nebula-design-system.md §2) without
   reaching for the concentrated CTA gradient itself. */
.rank-toggle-btn.active {
  background: color-mix(in srgb, var(--nebula-m) 22%, var(--surface-hybrid-bg));
  box-shadow: var(--surface-hybrid-shadow), 0 0 0 1px var(--nebula-ink);
}
/* .panel (tokens.css) supplies background/border/radius — a utility surface, not a reward one. */
.add-ex-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  padding: var(--sp3);
}
/* Header-decluttering audit fix: this panel used to open/close under its own dedicated toggle
   button (removed, see the overflow sheet below), so it needs its own small close affordance
   now that opening it happens one level removed (via the sheet). */
.add-ex-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.add-ex-panel-head b {
  font-size: 13.5px;
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
  gap: var(--sp2);
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  background: var(--surface-3);
  color: var(--text);
  font-size: 13px;
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
/* RPE/notes (Tasks 4-5) — small, --dim text, non-.btn-primary, deliberately not inline with the
   weight/reps steppers and not competing with "Satz speichern" (Global Constraint 4). N2: was a
   flat --surface-2 fill — .surface-hybrid instead (see .next-ex-row above). .warmup-btn/
   .add-ex-btn (the same row-family) were removed once their triggers moved into the overflow
   sheet (header-decluttering fix). */
.set-meta-row {
  display: flex;
  gap: var(--sp2);
  margin-bottom: var(--sp3);
}
.meta-pill {
  font-size: 12px;
  color: var(--dim);
  border-radius: var(--r-md);
  padding: 8px 12px;
  max-width: 100%;
}
.note-pill {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
/* Was --glow-blue on every instance — this is the ordinary CTA class (Quick Start, "Satz
   speichern", "Starten", routine save, …), so *every* screen had a glowing button, which
   reads as "everything is emphasized" = nothing is. Flat saturated fill instead (.btn-primary,
   tokens.css, itself bright now — the rework's whole point was that the *fill* should carry
   the emphasis, not a glow bolted onto a dark one); glow/motion stays reserved for an actually
   rare moment — the finish sequence's rank-up beat (FinishSequence.vue). */
.log-set-wrap {
  position: relative;
  /* On a short exercise (little "Letztes Mal"/RPE/note content above it), this button can land
     exactly in the fixed mobile tab bar's band on first paint — --bottom-chrome-h (0 on desktop,
     where there's no tab bar) tells scrollIntoView's visibility check to treat that band as
     "not actually visible", so the auto-scroll below (see logSetWrapRef) clears it. */
  scroll-margin-bottom: var(--bottom-chrome-h, 0px);
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
  color: var(--warning-hi);
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
/* N2: was a flat --surface-2 fill. Given to <li> directly rather than via the shared
   .surface-hybrid class (translucency + blur only, no ::after hairline/box-shadow) — these rows
   are dense repeated list items, not floating cards, so the full card recipe (gradient ring +
   drop shadow on every single set) would read as visual noise; translucency alone is still
   enough to read as "in the system" rather than a leftover opaque row. */
.set-rows li {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  font-size: 13.5px;
}
/* Was `opacity: 0.75` — the only visible consequence of completing a set was that it faded
   (critique finding: the reward inverts). A logged set now gets a faint green tint instead,
   full opacity — done work reads as brighter, not dimmer.
   N2 re-derivation (not a mechanical --surface-2 -> --surface-hybrid-bg swap): the old base was
   fully opaque, so color-mix's 14%-green output was itself fully opaque and its exact hue was
   the whole visual story. --surface-hybrid-bg is translucent (~0.88 alpha) and this row has no
   card behind it — color-mix here still carries that alpha through (mixing a ~14%-weighted
   opaque green into an ~0.88-alpha base yields ~0.90 alpha), so the result is a translucent tint
   sitting directly over whatever's rendered behind it (the page content and, at the row's own
   position, the pervasive cosmic sweep) rather than over a flat neutral fill. A straight 14%
   swap visibly diluted toward whatever hue the sweep carries at that spot, reading as a duller,
   less legible "done" signal than before. Bumped to 20% green share to compensate and keep the
   success tint reading as unambiguously green rather than washed out, while staying in the same
   translucent family as the sibling (non-done) rows above instead of special-casing it back to a
   fully opaque fill. */
.set-rows li.done {
  background: color-mix(in srgb, var(--success) 20%, var(--surface-hybrid-bg));
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
  background: var(--warning);
  color: var(--k-warmup-text);
}
.set-rows .sn.k-normal {
  background: var(--surface-3);
  color: var(--text);
}
.set-rows .sn.k-failure {
  background: var(--danger);
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
/* Header-decluttering audit fix: "Übung hinzufügen" / "Workout-Notiz" / "Aufwärmsätze einfügen"
   now live in one sheet (see the SheetModal in the template, opened from the "⋯" .overflow-btn
   next to .progress) instead of always-visible buttons crammed under the clock. Plain stacked
   list rows, full-width — a sheet's contents don't need to compete for horizontal space the way
   the old inline pill row did. "Workout abbrechen" used to live here too as `.menu-item-danger`,
   but a later bug-fix pass relocated cancel next to the pause button (`.cancel-btn` below) so it
   reads as "same family of control, different action" — this sheet no longer offers a second,
   redundant way to trigger the same destructive action. */
.workout-menu {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.menu-item {
  width: 100%;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 12px 14px;
  min-height: 44px;
}
/* Bug fix (product owner report): used to live alone far down the rail with a completely
   different look (a wide text pill) from the pause button it has nothing to do with visually.
   Now positioned right next to WorkoutClock's pause `.icon-btn` (same 40px height, same
   border-radius, same border weight — "same family of control") but red instead of neutral,
   so it reads as "same family, higher stakes" rather than an unrelated control. Widens past
   the 40px square only for the "Wirklich?" confirm label — auto width keeps the icon state a
   true square matching the pause button exactly. */
.cancel-btn {
  /* Slot content keeps WorkoutPage's own scope id, not WorkoutClock.vue's — so its scoped
     `.icon-btn` rules don't reach in here; base sizing is repeated explicitly to match it. */
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  min-width: 40px;
  width: auto;
  padding: 0 10px;
  border-radius: var(--r-md);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--danger);
  background: transparent;
  border: 1px solid var(--danger-lo);
}
/* Law-of-Proximity fix (UX-07): a plain hairline between Pause and Workout-abbrechen so the
   destructive action doesn't read as just another same-size icon button glued to the safe one —
   on top of the red-outlined treatment .cancel-btn already carries. */
.cancel-divider {
  width: 1px;
  height: 24px;
  background: var(--line-2);
  flex: none;
}
/* Visible, explicit cancel-workout confirmation — replaces the old silent tap-twice-within-3s
   pattern (useConfirmTap). .panel (tokens.css) supplies background/border/radius. */
.cancel-confirm {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  padding: var(--sp4);
}
.cancel-confirm p {
  font-size: 13.5px;
  color: var(--text);
}
.cancel-confirm-actions {
  display: flex;
  gap: var(--sp2);
}
.cancel-confirm-actions button {
  flex: 1;
}
.btn-cancel-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  min-height: var(--touch-target-min);
  border-radius: var(--r-md);
  background: var(--danger);
  border: 1px solid var(--danger);
  color: var(--k-failure-text);
  font-size: 13.5px;
  font-weight: 700;
  transition: transform var(--dur-fast) var(--ease-out);
}
.btn-cancel-confirm:active {
  transform: scale(0.97);
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
