/**
 * The sacred loop's state machine (plan 1.5). Every mutation (log a set, pause, advance)
 * writes to IndexedDB immediately via persist(), so a crashed tab or a locked phone mid-set
 * loses nothing — on next load, restore() picks the workout back up exactly where it left off.
 * Weight/rep steps match the mockup exactly: 1.25kg, 1 rep (see dStep/mStep in the mockup JS).
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { MAX_PLAUSIBLE_REPS, MAX_PLAUSIBLE_WEIGHT_KG, SET_KIND_LABEL, warmupRamp, type SetKind } from "@liftr/shared";
import { defineStore } from "pinia";
import { clearActiveWorkout, loadActiveWorkout, saveActiveWorkout } from "../lib/idb";
import { useSyncStore, type RankVerdict } from "./syncStore";

// Re-exported for existing call sites (SetKindPicker.vue, WorkoutPage.vue) — the definitions
// themselves now live in @liftr/shared/workout/setKind.ts so the server's routine zod schema
// and routine-template SetTarget can reference the same vocabulary (feature: pre-plan a set's
// kind when building a routine, not just reclassify it live).
export { SET_KIND_LABEL, type SetKind };

export const WEIGHT_STEP_KG = 1.25;
export const REPS_STEP = 1;
/** RestTimer.vue's own built-in fallback when an exercise doesn't override it. */
export const DEFAULT_REST_SECONDS = 90;
/** Threshold for `isStale` below — 3 hours is well past any realistic single session
 *  (including a long leg day + accessories) without being so tight it nags mid-workout. */
export const STALE_WORKOUT_SECONDS = 3 * 60 * 60;

export interface ActiveSet {
  index: number;
  weightKg: number | null; // null for pure rep-based bodyweight exercises
  reps: number;
  isWarmup: boolean;
  kind: SetKind;
  logged: boolean;
  loggedAt: number | null;
  clientId: string | null;
  prevWeightKg: number | null; // "last time" reference for this exact set index
  prevReps: number | null;
}

export interface ActiveExercise {
  workoutExerciseId: string; // client-generated (offline-capable start, see server sync.ts)
  exerciseId: string;
  name: string;
  isBodyweight: boolean;
  sets: ActiveSet[];
  /** shared by every exercise in the same superset/circuit (plan §6.6); null for a standalone exercise. */
  supersetGroup: number | null;
  /** Feedback: "adjust the pause, per set and per exercise" — copied from the routine at
   *  start() (or DEFAULT_REST_SECONDS for a routine-less Quick Start / mid-session add). See
   *  logCurrentSet() for how these two get picked between. */
  restBetweenSetsSeconds: number;
  restAfterExerciseSeconds: number;
}

interface ActiveWorkoutState {
  workoutId: string | null;
  routineId: string | null;
  routineName: string;
  startedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  currentExerciseIndex: number;
  exercises: ActiveExercise[];
}

export interface StartSetTarget {
  reps: number;
  /** null = no weight target for this set (plain bodyweight); 0/positive = tracked, including
   *  "extra kg" added on top of bodyweight (weighted dips/pull-ups). */
  weightKg: number | null;
  /** Feature: pre-plan a set's kind in the routine, not just live via SetKindPicker.vue —
   *  absent/undefined means "normal", same as before this field existed. */
  kind?: SetKind;
}

export interface StartExerciseInput {
  exerciseId: string;
  name: string;
  isBodyweight: boolean;
  /** One {reps, weightKg} target per set (e.g. a 10/8/6 pyramid) — set count is this array's length. */
  targetSets: StartSetTarget[];
  lastTime?: { weightKg: number | null; reps: number }[]; // per set index, oldest-first
  supersetGroup?: number | null;
  restBetweenSetsSeconds?: number | null;
  restAfterExerciseSeconds?: number | null;
}

/**
 * `state` is a Vue reactive Proxy (Pinia's $state) — structured clone (what IndexedDB's put()
 * uses under the hood) does not reliably clone nested reactive Proxies, and fails *silently*
 * here since callers don't await/catch this fire-and-forget write. Strip reactivity first via
 * a JSON round-trip (the state is plain JSON-safe data: no Dates, no functions) so the write
 * actually lands. Discovered by testing crash recovery in a real browser, not by inspection.
 */
function persist(state: ActiveWorkoutState) {
  void saveActiveWorkout(JSON.parse(JSON.stringify(state)));
}

export const useActiveWorkoutStore = defineStore("activeWorkout", {
  state: (): ActiveWorkoutState => ({
    workoutId: null,
    routineId: null,
    routineName: "",
    startedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    currentExerciseIndex: 0,
    exercises: [],
  }),

  getters: {
    isActive: (state) => state.workoutId !== null,
    isPaused: (state) => state.pausedAt !== null,

    currentExercise: (state): ActiveExercise | null => state.exercises[state.currentExerciseIndex] ?? null,

    /** first unlogged set of the current exercise — the one the steppers edit right now. */
    currentSet(): ActiveSet | null {
      const ex = this.currentExercise;
      if (!ex) return null;
      return ex.sets.find((s) => !s.logged) ?? null;
    },

    /**
     * True once every set in every exercise is logged. NOT the same as `currentExercise`
     * being null — the index stays pointed at the last exercise once its own sets are done
     * (there's nothing left to auto-advance *to*), so the "workout complete" view must check
     * this explicitly rather than assuming currentExercise goes null on completion.
     */
    allSetsLogged: (state) => state.exercises.length > 0 && state.exercises.every((ex) => ex.sets.every((s) => s.logged)),

    elapsedSeconds: (state) => {
      if (!state.startedAt) return 0;
      const end = state.pausedAt ?? Date.now();
      return Math.floor((end - state.startedAt - state.totalPausedMs) / 1000);
    },

    progressLabel: (state) => `Übung ${state.currentExerciseIndex + 1} von ${state.exercises.length}`,

    /** Feedback: "a workout runs indefinitely if it wasn't cancelled or ended by the user" — a
     *  workout left running for hours (phone locked, app backgrounded and forgotten, a crash
     *  that never got back to the app) has no natural end. This doesn't auto-end anything —
     *  silently discarding or finishing a session the user never actually confirmed would be
     *  its own bug — it just flags "this has been going a suspiciously long time" so
     *  WorkoutPage.vue can nudge the user to explicitly finish or cancel it, once, on resume. */
    isStale(): boolean {
      return this.isActive && this.elapsedSeconds > STALE_WORKOUT_SECONDS;
    },

    /**
     * The warm-up ramp only makes sense before any real work has happened on this exercise
     * (plan Phase 6.3) — offering it mid-exercise, or for bodyweight movements with no
     * meaningful "working weight" yet, would just be clutter in the sacred logging path.
     */
    canInsertWarmup(): boolean {
      const ex = this.currentExercise;
      if (!ex || ex.isBodyweight) return false;
      return ex.sets.length > 0 && ex.sets.every((s) => !s.logged && !s.isWarmup);
    },
  },

  actions: {
    /** Crash/lock recovery (plan 1.5): call once on app boot before rendering the workout page. */
    async restore() {
      const saved = await loadActiveWorkout<ActiveWorkoutState>();
      if (saved?.workoutId) {
        // Sets persisted before `kind` existed (an in-progress workout saved pre-upgrade) load
        // back with kind === undefined, which crashed WorkoutPage.vue's kind badge/label lookup
        // (SET_KIND_LABEL[undefined]) the moment restore() resumed one. Backfill from the field
        // that always existed, isWarmup, same derivation used everywhere else in this file.
        for (const ex of saved.exercises) {
          for (const s of ex.sets) {
            if (!s.kind) s.kind = s.isWarmup ? "warmup" : "normal";
          }
          // Same backfill for a workout persisted before restBetweenSetsSeconds/
          // restAfterExerciseSeconds existed — they'd otherwise load back as undefined and
          // RestTimer would render "undefined:undefined".
          if (ex.restBetweenSetsSeconds == null) ex.restBetweenSetsSeconds = DEFAULT_REST_SECONDS;
          if (ex.restAfterExerciseSeconds == null) ex.restAfterExerciseSeconds = DEFAULT_REST_SECONDS;
        }
        this.$patch(saved);
      }
    },

    async start(routineId: string | null, routineName: string, inputs: StartExerciseInput[]) {
      // Requested lazily on the first real engagement (plan 1.5), not on page load — asking
      // before the user has done anything is the "naggy popup" pattern audit §2.2 says to avoid.
      // RestTimer.vue's Notification call was previously a dead branch since nothing requested
      // this; closes that gap.
      if (Capacitor.isNativePlatform()) {
        void LocalNotifications.requestPermissions();
      } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }

      const workoutId = crypto.randomUUID();
      const startedAt = Date.now();

      this.$patch({
        workoutId,
        routineId,
        routineName,
        startedAt,
        pausedAt: null,
        totalPausedMs: 0,
        currentExerciseIndex: 0,
        exercises: inputs.map((input) => {
          const workoutExerciseId = crypto.randomUUID();
          return {
            workoutExerciseId,
            exerciseId: input.exerciseId,
            name: input.name,
            isBodyweight: input.isBodyweight,
            supersetGroup: input.supersetGroup ?? null,
            restBetweenSetsSeconds: input.restBetweenSetsSeconds ?? DEFAULT_REST_SECONDS,
            restAfterExerciseSeconds: input.restAfterExerciseSeconds ?? DEFAULT_REST_SECONDS,
            sets: Array.from({ length: input.targetSets.length }, (_, i) => {
              const target = input.targetSets[i]!;
              // isBodyweight no longer forces weightKg to null unconditionally — a routine can
              // set a per-set "extra kg" target (weighted dips/pull-ups) even on a bodyweight
              // exercise. It's only null when the target itself is null (plain bodyweight) and
              // there's no historical weight to fall back to either.
              const fallbackWeight = input.isBodyweight ? target.weightKg : (target.weightKg ?? 0);
              return {
                index: i,
                weightKg: input.lastTime?.[i]?.weightKg ?? fallbackWeight,
                // Reps are never pre-filled from the routine's target or last time (feedback:
                // "a user always needs to enter how many reps they made, instead of the value
                // set for the routine being the default") — weight tends to be planned in
                // advance, but rep count is the actual outcome of the set. Starts at 0, an
                // incomplete state logCurrentSet() refuses to log (see WorkoutPage.vue's
                // logSet()); lastTime/target still show as the "Letztes Mal"/"Ziel" reference.
                reps: 0,
                isWarmup: (target.kind ?? "normal") === "warmup",
                kind: target.kind ?? "normal",
                logged: false,
                loggedAt: null,
                clientId: null,
                prevWeightKg: input.lastTime?.[i]?.weightKg ?? null,
                prevReps: input.lastTime?.[i]?.reps ?? null,
              };
            }),
          };
        }),
      });
      persist(this.$state);

      const sync = useSyncStore();
      await sync.enqueue({
        clientId: crypto.randomUUID(),
        type: "start_workout",
        payload: {
          id: workoutId,
          routineId,
          startedAt: new Date(startedAt).toISOString(),
          exercises: this.exercises.map((ex, orderIndex) => ({
            id: ex.workoutExerciseId,
            exerciseId: ex.exerciseId,
            orderIndex,
          })),
        },
      });
    },

    adjustCurrentSet(field: "weightKg" | "reps", direction: 1 | -1) {
      const set = this.currentSet;
      if (!set) return;
      // Clamped to the same MAX_PLAUSIBLE_* the server enforces (feedback: "easy to swindle the
      // system to gain XP and ranks") — capping here means the normal stepper flow can never
      // construct a value the server would reject, which matters beyond just UX: a rejected
      // log_set stays queued and gets retried forever (see syncStore.ts's flush()), so letting
      // the UI produce one at all would wedge the sync queue on a value that can never succeed.
      if (field === "weightKg") {
        if (set.weightKg == null) return;
        set.weightKg = Math.min(MAX_PLAUSIBLE_WEIGHT_KG, Math.max(0, Math.round((set.weightKg + direction * WEIGHT_STEP_KG) * 100) / 100));
      } else {
        set.reps = Math.min(MAX_PLAUSIBLE_REPS, Math.max(0, set.reps + direction * REPS_STEP));
      }
      persist(this.$state);
    },

    /**
     * Reclassifies a set ("Satzart auswählen" — feedback: "not possible to set what kind of
     * set this is"). Scoped to sets that haven't been logged yet: a logged set is already
     * synced server-side and this store has no update-in-place sync mutation (log_set is an
     * idempotent insert keyed on clientId, not an upsert-by-content) — reclassifying history
     * would need a real edit endpoint, which is a bigger change than this picker. Deciding what
     * the *next* set will be is the actual use case anyway.
     */
    setSetKind(workoutExerciseId: string, setIndex: number, kind: SetKind) {
      const ex = this.exercises.find((e) => e.workoutExerciseId === workoutExerciseId);
      const set = ex?.sets.find((s) => s.index === setIndex);
      if (!set || set.logged) return;
      set.kind = kind;
      set.isWarmup = kind === "warmup";
      persist(this.$state);
    },

    /** Removes an unlogged set ("Satz entfernen" in the same picker). Same logged-set
     *  restriction as setSetKind, for the same reason. */
    removeSet(workoutExerciseId: string, setIndex: number) {
      const ex = this.exercises.find((e) => e.workoutExerciseId === workoutExerciseId);
      if (!ex) return;
      const set = ex.sets.find((s) => s.index === setIndex);
      if (!set || set.logged) return;
      ex.sets = ex.sets.filter((s) => s !== set).map((s, i) => ({ ...s, index: i }));
      persist(this.$state);
    },

    /**
     * Returns the rest duration (seconds) that should fire after this set, or null for no rest
     * (plan §6.6, plus feedback: "adjust the pause, per set and per exercise"). Standalone
     * exercises always rest between sets, using the exercise's own restBetweenSetsSeconds —
     * except for its very last set, which uses restAfterExerciseSeconds instead (the pause
     * before the *next* exercise starts, not another set of this one). A superset/circuit
     * instead advances round-robin between its member exercises with **no** rest in between —
     * that's the whole point of a superset — resting (at restBetweenSetsSeconds) only once a
     * full round (one set of every member) is done, i.e. when the round-robin would wrap back
     * to an earlier position in the group, and at restAfterExerciseSeconds once the whole group
     * is finished and it's moving on to the next exercise.
     */
    async logCurrentSet(): Promise<number | null> {
      const ex = this.currentExercise;
      const set = this.currentSet;
      if (!ex || !set) return null;
      // reps === 0 means the stepper was never actually touched (feedback: reps must always be
      // entered, never silently logged from a routine's target/last-time default — see the 0
      // starting value above). The UI already disables "Satz speichern" in this state; this is
      // the belt-and-braces guard against a submit slipping through some other path.
      if (set.reps <= 0) return null;

      set.logged = true;
      set.loggedAt = Date.now();
      set.clientId = crypto.randomUUID();

      persist(this.$state);

      const sync = useSyncStore();
      await sync.enqueue({
        clientId: set.clientId,
        type: "log_set",
        payload: {
          workoutExerciseId: ex.workoutExerciseId,
          setIndex: set.index,
          weightKg: set.weightKg,
          reps: set.reps,
          kind: set.kind,
          loggedAt: new Date(set.loggedAt).toISOString(),
        },
      });

      let restSeconds: number | null = ex.restBetweenSetsSeconds;

      if (ex.supersetGroup != null) {
        const groupIndices = this.exercises
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.supersetGroup === ex.supersetGroup);
        const curPos = groupIndices.findIndex(({ i }) => i === this.currentExerciseIndex);
        let advancedWithinGroup = false;
        for (let step = 1; step < groupIndices.length; step++) {
          const pos = (curPos + step) % groupIndices.length;
          const candidate = groupIndices[pos]!;
          if (candidate.e.sets.some((s) => !s.logged)) {
            this.currentExerciseIndex = candidate.i;
            advancedWithinGroup = true;
            // wrapped back to an earlier/equal slot = round complete
            restSeconds = pos <= curPos ? ex.restBetweenSetsSeconds : null;
            break;
          }
        }
        if (!advancedWithinGroup) {
          const nextIndex = this.exercises.findIndex((e) => e.sets.some((s) => !s.logged));
          if (nextIndex !== -1) this.currentExerciseIndex = nextIndex;
          restSeconds = ex.restAfterExerciseSeconds;
        }
        persist(this.$state);
      } else if (ex.sets.every((s) => s.logged)) {
        // auto-advance to the next exercise with unlogged sets, mirroring the mockup's flow
        const nextIndex = this.exercises.findIndex((e) => e.sets.some((s) => !s.logged));
        if (nextIndex !== -1) this.currentExerciseIndex = nextIndex;
        restSeconds = ex.restAfterExerciseSeconds;
        persist(this.$state);
      }

      return restSeconds;
    },

    /** Inserts a 40/60/80% ramp ahead of the working sets, based on the first set's target weight. */
    insertWarmupSets() {
      const ex = this.currentExercise;
      if (!ex || !this.canInsertWarmup) return;
      const workingWeightKg = ex.sets[0]?.weightKg;
      if (workingWeightKg == null || workingWeightKg <= 0) return;

      const ramp = warmupRamp(workingWeightKg);
      if (ramp.length === 0) return;

      const warmupSets: ActiveSet[] = ramp.map((r) => ({
        index: 0,
        weightKg: r.weightKg,
        reps: r.reps,
        isWarmup: true,
        kind: "warmup",
        logged: false,
        loggedAt: null,
        clientId: null,
        prevWeightKg: null,
        prevReps: null,
      }));
      ex.sets = [...warmupSets, ...ex.sets].map((s, i) => ({ ...s, index: i }));
      persist(this.$state);
    },

    jumpToExercise(index: number) {
      if (index < 0 || index >= this.exercises.length) return;
      this.currentExerciseIndex = index;
      persist(this.$state);
    },

    /**
     * Mid-session add (feedback gap: no way to change what a session includes once started —
     * a busy squat rack or a piece of equipment in use dead-ended the workout, or forced
     * cancelling it entirely). Builds one exercise the same way start() does, appends it, and
     * queues the matching "add_exercise" sync item so log_set for its sets has a real
     * workout_exercise row to reference server-side (see sync.ts).
     */
    async addExercise(input: StartExerciseInput) {
      const workoutExerciseId = crypto.randomUUID();
      const orderIndex = this.exercises.length;
      const exercise: ActiveExercise = {
        workoutExerciseId,
        exerciseId: input.exerciseId,
        name: input.name,
        isBodyweight: input.isBodyweight,
        supersetGroup: null, // added mid-session — never auto-joins an existing superset
        restBetweenSetsSeconds: input.restBetweenSetsSeconds ?? DEFAULT_REST_SECONDS,
        restAfterExerciseSeconds: input.restAfterExerciseSeconds ?? DEFAULT_REST_SECONDS,
        sets: Array.from({ length: input.targetSets.length }, (_, i) => {
          const target = input.targetSets[i]!;
          const fallbackWeight = input.isBodyweight ? target.weightKg : (target.weightKg ?? 0);
          return {
            index: i,
            weightKg: input.lastTime?.[i]?.weightKg ?? fallbackWeight,
            // Reps are never pre-filled from the routine's target or last time (feedback: "a
            // user always needs to enter how many reps they made, instead of the value set for
            // the routine being the default") — weight tends to be planned in advance and
            // usually is what you intended, but rep count is the actual outcome of the set and
            // isn't known until you've done it. Starts at 0 (an incomplete state logCurrentSet()
            // refuses to log, see store.currentSet's caller in WorkoutPage.vue) so the stepper
            // has to be genuinely touched. lastTime/target still show as the "Letztes Mal" /
            // "Ziel" reference text — just never silently become the logged value.
            reps: 0,
            isWarmup: (target.kind ?? "normal") === "warmup",
            kind: target.kind ?? "normal",
            logged: false,
            loggedAt: null,
            clientId: null,
            prevWeightKg: input.lastTime?.[i]?.weightKg ?? null,
            prevReps: input.lastTime?.[i]?.reps ?? null,
          };
        }),
      };
      this.exercises.push(exercise);
      persist(this.$state);

      const sync = useSyncStore();
      await sync.enqueue({
        clientId: crypto.randomUUID(),
        type: "add_exercise",
        payload: { id: workoutExerciseId, workoutId: this.workoutId, exerciseId: input.exerciseId, orderIndex },
      });
    },

    /**
     * Skip past the current exercise without deleting it — jumps to the next exercise with any
     * unlogged set, wrapping around, so an exercise you can't do right now (equipment in use)
     * doesn't block the rest of the session. Unlike removing it outright, you can always
     * jumpToExercise() back to it later via the rail.
     */
    skipCurrentExercise() {
      const n = this.exercises.length;
      for (let step = 1; step <= n; step++) {
        const i = (this.currentExerciseIndex + step) % n;
        if (this.exercises[i]!.sets.some((s) => !s.logged)) {
          this.currentExerciseIndex = i;
          persist(this.$state);
          return;
        }
      }
    },

    togglePause() {
      if (this.pausedAt) {
        this.totalPausedMs += Date.now() - this.pausedAt;
        this.pausedAt = null;
      } else {
        this.pausedAt = Date.now();
      }
      persist(this.$state);
    },

    /**
     * Discards the in-progress session entirely — no finish_workout sync item, so the server's
     * workout row (if start_workout already synced) is simply left with endedAt: null forever,
     * which /api/history already filters out (isNotNull(workouts.endedAt)). Any sets logged
     * before cancelling stay synced and keep counting toward ranks/PRs — cancelling only means
     * "I'm not finishing this session," not "undo everything I already did."
     */
    async cancelWorkout() {
      await clearActiveWorkout();
      this.$reset();
    },

    /**
     * Returns this session's rank verdicts (one per exercise that had a non-warmup set logged)
     * so the caller can build the finish sequence's reward beat. Rank is now recomputed once
     * here, when the workout actually finishes, not after every individual set — so unlike
     * every other mutation in this store, this one is awaited all the way through the network
     * flush rather than fire-and-forget: the caller needs the real verdicts before it decides
     * what to show, not a guess made a moment later. Returns [] if offline or the flush
     * otherwise didn't complete this round — the finish screen just shows no rank-ups for that
     * session; a later background flush still lands the workout itself either way.
     */
    async finish(): Promise<RankVerdict[]> {
      if (!this.workoutId) return [];
      const pausedSeconds = Math.floor(this.totalPausedMs / 1000);
      const workoutId = this.workoutId;

      const sync = useSyncStore();
      const result = await sync.enqueueAndAwaitFlush({
        clientId: crypto.randomUUID(),
        type: "finish_workout",
        payload: { workoutId, endedAt: new Date().toISOString(), pausedSeconds },
      });

      await clearActiveWorkout();
      this.$reset();

      return result?.ranks ?? [];
    },
  },
});
