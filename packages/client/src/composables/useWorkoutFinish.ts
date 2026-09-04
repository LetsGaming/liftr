/**
 * The finish-workout flow: snapshot the session, await the server's rank verdicts, build the
 * finish-sequence's reward beats, and offer to update the routine if the session out-performed
 * its targets. Extracted out of WorkoutPage.vue (QUAL-03: that file was the largest in the app,
 * 1280 LOC mixing session orchestration, sharing, mesocycle UI, and this finish flow together).
 */
import { computed, ref, watch, type ComputedRef } from "vue";
import { buildRoutineUpdate, findRoutineBeats, type RoutineBeat } from "./useRoutineBeat";
import type { useActiveWorkoutStore, ActiveExercise } from "../stores/activeWorkoutStore";
import type { useCatalogStore } from "../stores/catalogStore";
import type { useHistoryStore } from "../stores/historyStore";
import type { useOverallRankStore } from "../stores/overallRankStore";
import type { useRanksStore } from "../stores/ranksStore";
import type { useRoutineStore, Routine } from "../stores/routineStore";
import type { useStreakStore } from "../stores/streakStore";
import type { useXpStore } from "../stores/xpStore";
import type { RankUpSummary, StreakDay } from "../components/workout/FinishSequence.vue";

export interface FinishedSummary {
  routineName: string;
  durationLabel: string;
  volumeKg: number;
  setCount: number;
  muscles: { primary: string[]; secondary: string[] };
  exercises: { name: string; sets: { weightKg: number | null; reps: number; isWarmup: boolean }[] }[];
}

/** German day-of-week abbreviations for the finish sequence's 7-day streak strip, JS
 *  getDay()-indexed (0 = Sunday). */
const DAY_ABBR = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Rank engine v2 (task 10): honest, threshold-free German copy for each plausibility-gate
 *  reason a finish-workout verdict can carry. Never states the exact numbers that tripped it. */
const PLAUSIBILITY_NOTE_DE: Record<string, string> = {
  pace: "Diese Session war ungewöhnlich schnell — dein Rang- und XP-Gewinn fällt deshalb vorsichtiger aus.",
  improbable_jump: "Dieser Sprung war ungewöhnlich groß — dein Rang- und XP-Gewinn fällt deshalb vorsichtiger aus.",
  exceeds_ceiling: "Dieser Wert liegt ungewöhnlich hoch — dein Rang- und XP-Gewinn fällt deshalb vorsichtiger aus.",
};

/** Rank engine v2 (task 10): a one-time post-workout caption for an exercise's rank card,
 *  surfaced only when there's something worth saying (a same-band recovery-style LP gain, or a
 *  plausibility-gate note). Purely presentational — nothing here is persisted. */
export interface SessionCaption {
  exerciseId: string;
  exerciseName: string;
  recoveryGainLabel: string | null;
  plausibilityNote: string | null;
}

interface Stores {
  activeWorkoutStore: ReturnType<typeof useActiveWorkoutStore>;
  routineStore: ReturnType<typeof useRoutineStore>;
  streakStore: ReturnType<typeof useStreakStore>;
  ranksStore: ReturnType<typeof useRanksStore>;
  xpStore: ReturnType<typeof useXpStore>;
  historyStore: ReturnType<typeof useHistoryStore>;
  catalogStore: ReturnType<typeof useCatalogStore>;
  /** Phase 5 (share-card redesign): the finish flow needs the *post*-session overall tier for
   *  the share card's badge — a rank-up mid-session can move it, so it's reloaded alongside
   *  streak/XP below rather than trusted from whatever it was at session start. */
  overallRankStore: ReturnType<typeof useOverallRankStore>;
}

export function useWorkoutFinish(
  stores: Stores,
  sessionMuscles: ComputedRef<{ primary: string[]; secondary: string[] }>,
  exerciseName: (slug: string) => string,
) {
  const { activeWorkoutStore: store, routineStore, streakStore, ranksStore, xpStore, historyStore, catalogStore, overallRankStore } = stores;

  const finishedSummary = ref<FinishedSummary | null>(null);
  const finishSequenceDone = ref(false);

  /**
   * Session-earned signals, accumulated live as sets are logged so finishWorkout() can hand them
   * to FinishSequence instead of the old hardcoded prCount:0/rankUps:[] (engagement rework W4).
   * Reset whenever the active workoutId actually changes — a session resumed after an app reload
   * (store.restore()) gets a fresh workoutId only if it differs from whatever was here before,
   * so a crash-recovered session under-counts whatever XP/rank-ups it earned in the previous app
   * session before the reload. A minor, documented simplification, not a claim of exact lifetime
   * accounting.
   */
  const sessionXp = ref(0);
  const sessionRankUps = ref<RankUpSummary[]>([]);
  /** Task 10: unlike sessionRankUps (filtered to rankedUp/newPr, for the celebration beat), this
   *  covers every touched exercise's verdict — a same-band recovery LP gain or a plausibility
   *  note is exactly the case that never trips rankedUp/newPr, so it needs its own list. */
  const sessionCaptions = ref<SessionCaption[]>([]);
  watch(
    () => store.workoutId,
    (id, prev) => {
      if (id && id !== prev) {
        sessionXp.value = 0;
        sessionRankUps.value = [];
        sessionCaptions.value = [];
      }
    },
  );

  /** Snapshot of xpStore's level/progress right before finishWorkout() triggers a reload —
   *  xpStore is only ever refreshed at app boot (App.vue) and after a finish (below), so its
   *  state at the moment finishWorkout() runs *is* "before this session's XP was added."
   *  levelAfter/progressAfter are read live off xpStore instead, so they update reactively the
   *  moment the post-finish reload lands. */
  const finishXpSnapshot = ref<{ levelBefore: number; progressBefore: number } | null>(null);

  /** Feedback: "if a user made changes to the routine while in the workout (more weight/reps
   *  than the default) it should ask to overwrite the routine." Populated in finishWorkout(),
   *  before store.finish() resets the session. */
  const routineBeats = ref<RoutineBeat[]>([]);
  const beatRoutine = ref<Routine | null>(null);
  const beatActiveExercises = ref<ActiveExercise[]>([]);
  const routineUpdated = ref(false);
  const updatingRoutine = ref(false);

  async function updateRoutineWithBeats() {
    if (!beatRoutine.value || updatingRoutine.value) return;
    updatingRoutine.value = true;
    try {
      const exercises = buildRoutineUpdate(beatRoutine.value, beatActiveExercises.value);
      await routineStore.update(beatRoutine.value.id, { exercises });
      routineUpdated.value = true;
    } finally {
      updatingRoutine.value = false;
    }
  }

  /** Last 7 calendar days, oldest first, marked active from whatever history is already loaded.
   *  Deliberately simple — "a workout happened that day" — not a full re-derivation of
   *  streak.ts's protection-token walk (that number is computed server-side and shown as-is);
   *  good enough to draw the week's shape. */
  const streakDays = computed<StreakDay[]>(() => {
    const activeDates = new Set(historyStore.items.filter((i) => i.kind === "workout").map((i) => new Date(i.at).toDateString()));
    const today = new Date();
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - idx));
      return { label: DAY_ABBR[d.getDay()]!, active: activeDates.has(d.toDateString()) };
    });
  });

  async function finishWorkout() {
    // store.finish() resets the store's state, so snapshot everything the summary/share panel
    // needs first.
    const routineId = store.routineId;
    finishSequenceDone.value = false;
    finishXpSnapshot.value = { levelBefore: xpStore.level, progressBefore: xpStore.progressPercent };
    const elapsedS = Math.max(
      0,
      Math.floor(((store.pausedAt ?? Date.now()) - (store.startedAt ?? Date.now()) - store.totalPausedMs) / 1000),
    );
    const volumeKg = store.exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.logged).reduce((s2, s) => s2 + (s.weightKg ?? 0) * s.reps, 0),
      0,
    );
    const setCount = store.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.logged && !s.isWarmup).length, 0);
    const routineName = store.routineName || "Workout";
    const muscles = { primary: [...sessionMuscles.value.primary], secondary: [...sessionMuscles.value.secondary] };
    const exercisesSnapshot = store.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets.filter((s) => s.logged).map((s) => ({ weightKg: s.weightKg, reps: s.reps, isWarmup: s.isWarmup })),
    }));

    // Feedback: "if a user made changes to the routine while in the workout (more weight/reps
    // than the default) it should ask to overwrite the routine." Snapshotted here — before
    // store.finish() resets the session — since that's the last point store.exercises still
    // reflects what was actually logged. JSON round-trip strips Pinia's reactive Proxy, same
    // reason persist() does it in activeWorkoutStore.ts, so the plain snapshot survives past
    // finish() for the "update routine" button below to use.
    const sourceRoutine = routineId ? routineStore.routines.find((r) => r.id === routineId) ?? null : null;
    beatRoutine.value = sourceRoutine;
    beatActiveExercises.value = sourceRoutine ? (JSON.parse(JSON.stringify(store.exercises)) as ActiveExercise[]) : [];
    routineBeats.value = sourceRoutine ? findRoutineBeats(sourceRoutine, beatActiveExercises.value) : [];
    routineUpdated.value = false;

    // Rank is now recomputed once, here, rather than after every set — store.finish() awaits the
    // real network round trip (unlike every other mutation in this store) so the verdicts are
    // known before finishedSummary is set below. Setting finishedSummary first and populating
    // sessionRankUps afterward would race FinishSequence's onMounted, which decides whether to
    // show the "Rangaufstiege" beat the instant it mounts.
    const ranks = await store.finish();

    sessionRankUps.value = ranks
      .filter((r) => r.rankedUp || r.newPr)
      .map((r) => {
        const ex = catalogStore.byId(r.exerciseId);
        return {
          exerciseName: ex ? exerciseName(ex.slug) : "",
          tier: r.tier,
          division: r.division,
          isPr: r.newPr != null,
          lp: r.lp,
          prevLp: r.prevLp,
          plausibilityNote: r.plausibilityReason ? (PLAUSIBILITY_NOTE_DE[r.plausibilityReason] ?? null) : null,
        };
      });
    // Every touched exercise's rank is refreshed here too (not just the ones that ranked up), so
    // the Ränge tab / next session's RankProgress bar reflect this workout without a separate
    // /api/ranks round trip.
    for (const r of ranks) {
      ranksStore.applyVerdict(r.exerciseId, { tier: r.tier, division: r.division, lp: r.lp });
    }

    // Task 10: recovery-gain / plausibility captions for the post-finish summary panel. A
    // recovery gain is exactly a same-band LP increase with no tier/division change — this is
    // deliberately not restricted to "was this specifically a decay-recovery climb", since the
    // server doesn't return that distinction; a normal (non-decayed) session that simply logs a
    // better set and gains LP in the same band also satisfies this and will show the same label.
    // Known, accepted simplification (rank-engine-v2 plan, task 10) rather than scope creep to
    // add a new server field for it.
    sessionCaptions.value = ranks
      .map((r) => {
        const recoveryGainLabel =
          !r.rankedUp && r.lp > r.prevLp ? `+${Math.round(r.lp - r.prevLp)} LP (Rückkehr-Bonus)` : null;
        const plausibilityNote = r.plausibilityReason ? (PLAUSIBILITY_NOTE_DE[r.plausibilityReason] ?? null) : null;
        const ex = catalogStore.byId(r.exerciseId);
        return { exerciseId: r.exerciseId, exerciseName: ex ? exerciseName(ex.slug) : "", recoveryGainLabel, plausibilityNote };
      })
      .filter((c) => c.recoveryGainLabel != null || c.plausibilityNote != null);

    finishedSummary.value = { routineName, durationLabel: `${Math.round(elapsedS / 60)} min`, volumeKg, setCount, muscles, exercises: exercisesSnapshot };

    // store.finish() already awaited the network round trip, so the streaks row and this
    // session's XP are already reflected server-side — no more guessing with a timeout.
    void streakStore.load();
    void xpStore.load();
    void overallRankStore.load();

    const routine = routineId ? routineStore.routines.find((r) => r.id === routineId) : null;
    if (routine?.mesocycle) await routineStore.advanceMesocycle(routine.id);
  }

  return {
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
  };
}
