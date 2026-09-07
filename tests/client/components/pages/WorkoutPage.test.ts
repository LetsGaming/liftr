import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import ExerciseRail from "~client/components/exercise/ExerciseRail.vue";
import FinishSequence from "~client/components/workout/FinishSequence.vue";
import RestTimer from "~client/components/workout/RestTimer.vue";
import SetEntry from "~client/components/workout/SetEntry.vue";
import SheetModal from "~client/components/ui/SheetModal.vue";
import RankProgress from "~client/components/rank/RankProgress.vue";
import RoutineList from "~client/components/routine/RoutineList.vue";
import WorkoutPage from "~client/pages/WorkoutPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Plain top-of-file consts (not vi.hoisted — `reactive`/`ref` aren't available inside that
// factory, see RunsPage.test.ts's comment) referenced only inside uninvoked closures below, so
// vi.mock's own hoisting above these declarations never dereferences them before they exist.
interface ActiveSet {
  index: number;
  logged: boolean;
  isWarmup: boolean;
  kind: "normal" | "warmup" | "dropset" | "failure";
  weightKg: number | null;
  reps: number;
}
interface ActiveExercise {
  workoutExerciseId: string;
  exerciseId: string;
  name: string;
  supersetGroup: number | null;
  sets: ActiveSet[];
}

const store = reactive({
  isActive: false,
  currentExercise: null as ActiveExercise | null,
  currentExerciseIndex: 0,
  exercises: [] as ActiveExercise[],
  currentSet: null as { weightKg: number | null; reps: number; prevWeightKg: number | null; prevReps: number | null; rpe: number | null; notes: string | null } | null,
  allSetsLogged: false,
  progressLabel: "0/0 Sätze",
  isStale: false,
  elapsedSeconds: 0,
  startedAt: null as number | null,
  pausedAt: null as number | null,
  totalPausedMs: 0,
  isPaused: false,
  workoutNotes: null as string | null,
  canInsertWarmup: false,
  restore: vi.fn(),
  togglePause: vi.fn(),
  logCurrentSet: vi.fn(),
  cancelWorkout: vi.fn(),
  skipCurrentExercise: vi.fn(),
  jumpToExercise: vi.fn(),
  removeSet: vi.fn(),
  setSetKind: vi.fn(),
  setCurrentSetRpe: vi.fn(),
  setWorkoutNotes: vi.fn(),
  setCurrentSetNotes: vi.fn(),
});
const catalogState = reactive({ exercises: [] as unknown[], loaded: false, load: vi.fn(), byId: () => undefined });
const routineState = reactive({ routines: [] as unknown[], loaded: false, error: false, load: vi.fn() });
const streakState = reactive({ streak: 0, tokensRemaining: 2, loaded: false, error: false, load: vi.fn() });
const ranksState = reactive({ ranks: [] as { exerciseId: string; tier: string; division: number; lp: number; nextTargetWeightKg: number | null; nextTargetReps: number | null; trust: string }[], loaded: false, error: false, load: vi.fn() });
const xpState = reactive({ level: 4, progressPercent: 30, loaded: false, error: false, showXp: true, load: vi.fn() });
const overallRankState = reactive({ current: null as { tier: string; division: number } | null, loaded: false, error: false, load: vi.fn() });
const historyState = reactive({ items: [] as unknown[], loaded: false, error: false, load: vi.fn() });

const finish = {
  finishedSummary: ref<null | {
    routineName: string;
    durationLabel: string;
    volumeKg: number;
    setCount: number;
    muscles: { primary: string[]; secondary: string[] };
    exercises: unknown[];
  }>(null),
  finishSequenceDone: ref(false),
  sessionXp: ref(0),
  sessionRankUps: ref<{ tier: string; plausibilityNote: string | null }[]>([]),
  sessionCaptions: ref<unknown[]>([]),
  consistencyBonusXp: ref(0),
  varietyBonusXp: ref(0),
  newMuscleSlugs: ref<string[]>([]),
  finishXpSnapshot: ref<{ levelBefore: number; progressBefore: number } | null>(null),
  routineBeats: ref<unknown[]>([]),
  updatingRoutine: ref(false),
  routineUpdated: ref(false),
  updateRoutineWithBeats: vi.fn(),
  streakDays: ref<unknown[]>([]),
  finishWorkout: vi.fn(),
};
const mesocycle = { activeMesocycle: ref<{ currentWeek: number; totalWeeks: number; weekPercents: number[] } | null>(null) };
const addExercise = { showAddExercise: ref(false), addExerciseSearch: ref(""), addExerciseCandidates: ref<unknown[]>([]), addExerciseToSession: vi.fn() };
const shareCard = { finishedCanvas: ref<HTMLCanvasElement | null>(null), sharingFinished: ref(false), shareFinished: vi.fn(), copyingFinished: ref(false), copyFinished: vi.fn() };

vi.mock("~client/stores/activeWorkoutStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~client/stores/activeWorkoutStore")>();
  return { ...actual, useActiveWorkoutStore: () => store };
});
vi.mock("~client/stores/catalogStore", () => ({ useCatalogStore: () => catalogState }));
vi.mock("~client/stores/routineStore", () => ({ useRoutineStore: () => routineState }));
vi.mock("~client/stores/streakStore", () => ({ useStreakStore: () => streakState }));
vi.mock("~client/stores/ranksStore", () => ({ useRanksStore: () => ranksState }));
vi.mock("~client/stores/xpStore", () => ({ useXpStore: () => xpState }));
vi.mock("~client/stores/overallRankStore", () => ({ useOverallRankStore: () => overallRankState }));
vi.mock("~client/stores/historyStore", () => ({ useHistoryStore: () => historyState }));

vi.mock("~client/composables/useWorkoutFinish", () => ({ useWorkoutFinish: () => finish }));
vi.mock("~client/composables/useStartRoutine", () => ({ useStartRoutine: () => ({ exerciseName: (slug: string) => slug }) }));
vi.mock("~client/composables/useMesocycleControls", () => ({ useMesocycleControls: () => mesocycle }));
vi.mock("~client/composables/useAddExerciseToSession", () => ({ useAddExerciseToSession: () => addExercise }));
vi.mock("~client/composables/useWorkoutShareCard", () => ({ useWorkoutShareCard: () => shareCard }));

// Heavy feature components with their own store/service reads, already covered at their own
// layer — stubbed so this page's test only asserts *whether/how* they're wired in, not their
// internals.
const STUBS = {
  FinishSequence: true,
  RoutineList: true,
  SetEntry: true,
  RestTimer: true,
  ExerciseRail: true,
  ExerciseInfoPanel: true,
  SheetModal: true,
  SetKindPicker: true,
  RpeCapture: true,
  NoteCapture: true,
  SyncIndicator: true,
};

function makeExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    workoutExerciseId: "we1",
    exerciseId: "ex1",
    name: "Bankdrücken",
    supersetGroup: null,
    sets: [{ index: 0, logged: false, isWarmup: false, kind: "normal", weightKg: 80, reps: 0 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(store, {
    isActive: false,
    currentExercise: null,
    currentExerciseIndex: 0,
    exercises: [],
    currentSet: null,
    allSetsLogged: false,
    progressLabel: "0/0 Sätze",
    isStale: false,
    startedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    isPaused: false,
    workoutNotes: null,
    canInsertWarmup: false,
  });
  Object.assign(catalogState, { exercises: [], loaded: false });
  Object.assign(routineState, { routines: [], loaded: false, error: false });
  Object.assign(streakState, { streak: 0, loaded: false, error: false });
  Object.assign(ranksState, { ranks: [], loaded: false, error: false });
  Object.assign(xpState, { level: 4, loaded: false, error: false });
  Object.assign(overallRankState, { current: null, loaded: false, error: false });
  Object.assign(historyState, { items: [], loaded: false, error: false });
  finish.finishedSummary.value = null;
  finish.finishSequenceDone.value = false;
  finish.sessionXp.value = 0;
  finish.sessionRankUps.value = [];
});

describe("WorkoutPage", () => {
  it("loads catalog/routines/ranks/history/overall-rank and restores the active session on mount", () => {
    mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });
    expect(catalogState.load).toHaveBeenCalledOnce();
    expect(store.restore).toHaveBeenCalledOnce();
    expect(routineState.load).toHaveBeenCalledOnce();
    expect(ranksState.load).toHaveBeenCalledOnce();
    expect(historyState.load).toHaveBeenCalledOnce();
    expect(overallRankState.load).toHaveBeenCalledOnce();
  });

  it("renders the routine list when idle (no finish recap, no active session)", () => {
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });
    expect(wrapper.findComponent(RoutineList).exists()).toBe(true);
    expect(wrapper.find(".active-workout").exists()).toBe(false);
    expect(wrapper.find(".finished-summary").exists()).toBe(false);
  });

  it("renders the finish sequence, wired with this session's rewards, once a workout has finished", () => {
    finish.finishedSummary.value = {
      routineName: "Push Day",
      durationLabel: "45 min",
      volumeKg: 3200,
      setCount: 12,
      muscles: { primary: [], secondary: [] },
      exercises: [],
    };
    finish.sessionXp.value = 120;
    finish.sessionRankUps.value = [{ tier: "silver", plausibilityNote: null }];
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    const sequence = wrapper.findComponent(FinishSequence);
    expect(sequence.exists()).toBe(true);
    expect(sequence.props("sessionXp")).toBe(120);
    expect(sequence.props("rankUps")).toStrictEqual([{ tier: "silver", plausibilityNote: null }]);
    expect(wrapper.findComponent(RoutineList).exists()).toBe(false);
  });

  it("falls through to the reward recap once the finish sequence completes, and 'Fertig' clears it", async () => {
    finish.finishedSummary.value = {
      routineName: "Push Day",
      durationLabel: "45 min",
      volumeKg: 3200,
      setCount: 12,
      muscles: { primary: [], secondary: [] },
      exercises: [],
    };
    finish.finishSequenceDone.value = true;
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    expect(wrapper.findComponent(FinishSequence).exists()).toBe(false);
    expect(wrapper.text()).toContain("Geschafft");
    expect(wrapper.text()).toContain("Push Day");
    expect(wrapper.text()).toContain("45 min");

    const doneBtn = wrapper.findAll(".finished-summary button").find((b) => b.text() === "Fertig")!;
    await doneBtn.trigger("click");
    expect(finish.finishedSummary.value).toBeNull();
  });

  it("shows the active session's focus column for the current exercise, and hides the stale/complete states", () => {
    store.isActive = true;
    store.currentExercise = makeExercise();
    store.exercises = [store.currentExercise];
    store.currentSet = { weightKg: 80, reps: 0, prevWeightKg: 77.5, prevReps: 8, rpe: null, notes: null };
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    expect(wrapper.find(".active-workout").exists()).toBe(true);
    expect(wrapper.find(".focus-col").exists()).toBe(true);
    expect(wrapper.text()).toContain("Bankdrücken");
    expect(wrapper.findComponent(SetEntry).exists()).toBe(true);
    expect(wrapper.find(".workout-complete").exists()).toBe(false);
    expect(wrapper.find(".stale-banner").exists()).toBe(false);
  });

  it("shows the workout-complete state (not the focus column) once every set is logged", () => {
    store.isActive = true;
    store.currentExercise = makeExercise();
    store.allSetsLogged = true;
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    expect(wrapper.find(".focus-col").exists()).toBe(false);
    expect(wrapper.find(".workout-complete").exists()).toBe(true);
  });

  it("finishing the workout from the complete state calls finishWorkout", async () => {
    store.isActive = true;
    store.allSetsLogged = true;
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    await wrapper.find(".workout-complete button").trigger("click");
    expect(finish.finishWorkout).toHaveBeenCalledOnce();
  });

  it("shows a stale-session prompt when the restored workout has been running for hours, and 'Jetzt beenden' finishes it", async () => {
    store.isActive = true;
    store.isStale = true;
    store.currentExercise = makeExercise();
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });
    // onMounted's `showStalePrompt.value = store.isStale` runs after the async Promise.all([...])
    // of store loads above it — mount() itself doesn't await that, so give it a couple of
    // microtask turns to actually land before asserting on its result.
    await flushAsync();

    const banner = wrapper.find(".stale-banner");
    expect(banner.exists()).toBe(true);

    const finishBtn = banner.findAll("button").find((b) => b.text() === "Jetzt beenden")!;
    await finishBtn.trigger("click");
    expect(wrapper.find(".stale-banner").exists()).toBe(false);
    expect(finish.finishWorkout).toHaveBeenCalledOnce();
  });

  it("requires a second tap on the cancel button before actually cancelling the workout", async () => {
    store.isActive = true;
    store.currentExercise = makeExercise();
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    const cancelBtn = wrapper.find(".cancel-btn");
    await cancelBtn.trigger("click");
    expect(store.cancelWorkout).not.toHaveBeenCalled();
    expect(wrapper.find(".cancel-btn").text()).toBe("Wirklich?");

    await wrapper.find(".cancel-btn").trigger("click");
    expect(store.cancelWorkout).toHaveBeenCalledOnce();
  });

  it("reveals the current exercise's cached rank card only after the rank-reveal toggle is tapped", async () => {
    store.isActive = true;
    store.currentExercise = makeExercise({ exerciseId: "ex1" });
    ranksState.ranks = [{ exerciseId: "ex1", tier: "gold", division: 1, lp: 55, nextTargetWeightKg: 90, nextTargetReps: 8, trust: "real" }];
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    expect(wrapper.findComponent(RankProgress).exists()).toBe(false);
    await wrapper.find(".rank-toggle-btn").trigger("click");

    const rank = wrapper.findComponent(RankProgress);
    expect(rank.exists()).toBe(true);
    expect(rank.props("tier")).toBe("gold");
    expect(rank.props("lp")).toBe(55);
  });

  it("opens the full exercise-jump sheet from the overview affordance", async () => {
    const exA = makeExercise({ workoutExerciseId: "we1", exerciseId: "ex1" });
    const exB = makeExercise({ workoutExerciseId: "we2", exerciseId: "ex2", name: "Kniebeuge" });
    store.isActive = true;
    store.currentExercise = exA;
    store.exercises = [exA, exB];
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    expect(wrapper.findComponent(ExerciseRail).exists()).toBe(true); // desktop rail, always present
    expect(wrapper.findComponent(SheetModal).exists()).toBe(false);
    await wrapper.find(".next-ex-overview-btn").trigger("click");
    expect(wrapper.findComponent(SheetModal).exists()).toBe(true);
  });

  it("logging a set accumulates session XP and triggers the rest timer with the store's rest duration", async () => {
    store.isActive = true;
    store.currentExercise = makeExercise({ sets: [{ index: 0, logged: false, isWarmup: false, kind: "normal", weightKg: 80, reps: 8 }] });
    store.exercises = [store.currentExercise];
    store.currentSet = { weightKg: 80, reps: 8, prevWeightKg: null, prevReps: null, rpe: null, notes: null };
    store.logCurrentSet.mockResolvedValue(120);
    const wrapper = mountWithProviders(WorkoutPage, { global: { stubs: STUBS } });

    await wrapper.find(".log-set-btn").trigger("click");
    await Promise.resolve();
    await Promise.resolve();

    expect(store.logCurrentSet).toHaveBeenCalledOnce();
    const timer = wrapper.findComponent(RestTimer);
    expect(timer.props("seconds")).toBe(120);
    expect(timer.props("restKind")).toBe("after-exercise"); // the fixture's only unlogged set
    expect(wrapper.text()).toContain("XP");
  });
});

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}
