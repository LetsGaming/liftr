// @vitest-environment jsdom
//
// WorkoutDetail.vue is a read-only summary of one finished workout, built on the real
// historyStore/catalogStore/ranksStore/xpStore/overallRankStore (Pinia — real collaborators)
// with only the true network boundary mocked: the service modules each store's actions call.
// Only IonModal (SheetModal's own shell, see RpeCapture.test.ts's header comment) is stubbed —
// SheetModal itself runs for real, including its dismiss()/did-dismiss/close plumbing.
// shareCard.ts is mocked outright — its drawWorkoutCard does real <canvas> 2D-context drawing,
// which jsdom doesn't implement (see tests/client/lib/shareCard.test.ts's own header comment).
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import WorkoutDetail from "~client/components/workout/WorkoutDetail.vue";
import { useCatalogStore } from "~client/stores/catalogStore";
import type { WorkoutDetail as WorkoutDetailModel } from "~client/services/workoutService";
import { mountWithProviders } from "../../helpers/mountWithProviders";

vi.mock("~client/services/workoutService", () => ({
  getWorkout: vi.fn(),
  deleteWorkout: vi.fn(),
}));
vi.mock("~client/services/overallRankService", () => ({
  getOverallRank: vi.fn().mockResolvedValue({ current: null, peak: null }),
}));
vi.mock("~client/services/rankService", () => ({ getRanks: vi.fn().mockResolvedValue([]) }));
vi.mock("~client/services/xpService", () => ({
  getXp: vi.fn().mockResolvedValue({ level: 3, xp: 0, xpForNextLevel: 100, xpIntoLevel: 0 }),
}));
vi.mock("~client/lib/shareCard", () => ({
  drawWorkoutCard: vi.fn().mockResolvedValue(undefined),
  canvasToBlob: vi.fn().mockResolvedValue(new Blob(["x"])),
  shareOrDownloadBlob: vi.fn().mockResolvedValue(undefined),
}));

import { getWorkout, deleteWorkout } from "~client/services/workoutService";

const getWorkoutMock = vi.mocked(getWorkout);
const deleteWorkoutMock = vi.mocked(deleteWorkout);

/** See RpeCapture.test.ts's header comment. WorkoutDetail's delete flow calls
 *  `sheetRef.value?.dismiss()` directly (not via the header close button), so this needs the
 *  fuller dismiss()-emitting stub. */
const IonModalStub = defineComponent({
  name: "IonModal",
  props: {
    isOpen: { type: Boolean, default: false },
    breakpoints: { type: Array, default: undefined },
    initialBreakpoint: { type: Number, default: undefined },
    backdropDismiss: { type: Boolean, default: undefined },
  },
  emits: ["did-dismiss"],
  mounted() {
    (this.$el as HTMLElement & { dismiss?: () => Promise<boolean> }).dismiss = () => {
      this.$emit("did-dismiss");
      return Promise.resolve(true);
    };
  },
  template: `<div class="ion-modal-stub"><slot name="header" /><slot /></div>`,
});

function workoutFixture(overrides: Partial<WorkoutDetailModel> = {}): WorkoutDetailModel {
  return {
    id: "w-1",
    routineId: null,
    startedAt: "2026-09-05T10:00:00.000Z",
    endedAt: "2026-09-05T10:52:00.000Z", // 52 min, minus 2 min (120s) paused below = 50 min
    pausedSeconds: 120,
    notes: null,
    workoutExercises: [
      {
        id: "we-1",
        exerciseId: "ex-1",
        orderIndex: 0,
        exercise: { id: "ex-1", slug: "bench-press", name: null, isBodyweight: false, equipment: "barbell" },
        sets: [
          { id: "s-0", setIndex: 0, weightKg: null, reps: 5, isWarmup: true, loggedAt: null, isPr: false },
          { id: "s-1", setIndex: 1, weightKg: 60, reps: 8, isWarmup: false, loggedAt: null, isPr: false },
          { id: "s-2", setIndex: 2, weightKg: 62.5, reps: 6, isWarmup: false, loggedAt: null, isPr: true },
        ],
      },
      {
        id: "we-2",
        exerciseId: "ex-2",
        orderIndex: 1,
        exercise: { id: "ex-2", slug: "back-squat", name: null, isBodyweight: false, equipment: "barbell" },
        sets: [{ id: "s-3", setIndex: 0, weightKg: 80, reps: 5, isWarmup: false, loggedAt: null, isPr: false }],
      },
    ],
    ...overrides,
  };
}

async function mountDetail(workout: WorkoutDetailModel | null) {
  getWorkoutMock.mockReset();
  deleteWorkoutMock.mockReset();
  if (workout) getWorkoutMock.mockResolvedValue(workout);
  else getWorkoutMock.mockRejectedValue(new Error("network down"));
  deleteWorkoutMock.mockResolvedValue(undefined);

  const wrapper = mountWithProviders(WorkoutDetail, {
    props: { workoutId: "w-1" },
    global: { stubs: { IonModal: IonModalStub } },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkoutDetail", () => {
  it("shows a loading hint before the workout resolves", () => {
    getWorkoutMock.mockReset().mockReturnValue(new Promise(() => {})); // never resolves
    const wrapper = mountWithProviders(WorkoutDetail, {
      props: { workoutId: "w-1" },
      global: { stubs: { IonModal: IonModalStub } },
    });

    expect(wrapper.text()).toContain("Lädt…");
  });

  it("shows an error hint when the workout can't be loaded", async () => {
    const { wrapper } = await mountDetail(null);

    expect(wrapper.text()).toContain("ließ sich nicht laden");
  });

  it("renders the date, duration (minus paused time), volume, set and exercise counts", async () => {
    const { wrapper } = await mountDetail(workoutFixture());

    expect(wrapper.find(".date-line").text()).toBe("05. September 2026");

    const stats = wrapper.findAll(".stat-tile");
    expect(stats).toHaveLength(4);
    // (52min - 2min paused) = 50min
    expect(stats[0]!.find("b").text()).toBe("50 min");
    expect(stats[0]!.find("span").text()).toBe("Dauer");
    // volume = 60*8 + 62.5*6 + 80*5 = 480 + 375 + 400 = 1255kg (warmup set has weightKg: null -> 0)
    expect(stats[1]!.find("b").text()).toBe("1.255 kg");
    expect(stats[1]!.find("span").text()).toBe("Volumen");
    // totalSets excludes warmups: 2 (bench) + 1 (squat) = 3
    expect(stats[2]!.find("b").text()).toBe("3");
    expect(stats[2]!.find("span").text()).toBe("Sätze");
    expect(stats[3]!.find("b").text()).toBe("2");
    expect(stats[3]!.find("span").text()).toBe("Übungen");
  });

  it("shows '—' as the duration when the workout has no endedAt yet", async () => {
    const { wrapper } = await mountDetail(workoutFixture({ endedAt: null }));

    expect(wrapper.findAll(".stat-tile")[0]!.find("b").text()).toBe("—");
  });

  it("orders exercises by orderIndex and renders each exercise's name and set chips", async () => {
    const { wrapper } = await mountDetail(
      workoutFixture({
        workoutExercises: [
          {
            id: "we-2",
            exerciseId: "ex-2",
            orderIndex: 1,
            exercise: { id: "ex-2", slug: "back-squat", name: null, isBodyweight: false, equipment: "barbell" },
            sets: [{ id: "s-3", setIndex: 0, weightKg: 80, reps: 5, isWarmup: false, loggedAt: null, isPr: false }],
          },
          {
            id: "we-1",
            exerciseId: "ex-1",
            orderIndex: 0,
            exercise: { id: "ex-1", slug: "bench-press", name: null, isBodyweight: false, equipment: "barbell" },
            sets: [{ id: "s-1", setIndex: 0, weightKg: 60, reps: 8, isWarmup: false, loggedAt: null, isPr: false }],
          },
        ],
      }),
    );

    const items = wrapper.findAll(".ex-list li");
    expect(items).toHaveLength(2);
    // German i18n names from locales/exercises.de.json, in orderIndex order (bench-press first).
    expect(items[0]!.text()).toContain("Bankdrücken");
    expect(items[1]!.text()).toContain("Langhantel-Kniebeuge");
  });

  it("renders each set as reps×weight, marks warmup/PR sets, and shows a trophy on a PR", async () => {
    const { wrapper } = await mountDetail(workoutFixture());

    const chips = wrapper.findAll(".ex-list li")[0]!.findAll(".set-chip");
    expect(chips).toHaveLength(3);

    expect(chips[0]!.text()).toBe("5"); // warmup set has weightKg: null -> reps only
    expect(chips[0]!.classes()).toContain("warmup");
    expect(chips[0]!.classes()).not.toContain("pr");

    expect(chips[1]!.text()).toBe("8×60kg");
    expect(chips[1]!.classes()).not.toContain("warmup");

    expect(chips[2]!.text()).toContain("6×62.5kg");
    expect(chips[2]!.classes()).toContain("pr");
    expect(chips[2]!.attributes("title")).toBe("Persönlicher Rekord");
  });

  it("clicking share draws, blobs, and shares/downloads a workout card", async () => {
    const { wrapper } = await mountDetail(workoutFixture());
    const { drawWorkoutCard, canvasToBlob, shareOrDownloadBlob } = await import("~client/lib/shareCard");

    await wrapper.find(".btn-primary").trigger("click");
    await flushPromises();

    expect(drawWorkoutCard).toHaveBeenCalledTimes(1);
    const model = vi.mocked(drawWorkoutCard).mock.calls[0]![1];
    expect(model.kind).toBe("workout");
    expect(model.setCount).toBe(3);
    expect(model.prCount).toBe(1);
    expect(model.exercises).toHaveLength(2);
    expect(canvasToBlob).toHaveBeenCalledTimes(1);
    expect(shareOrDownloadBlob).toHaveBeenCalledTimes(1);
  });

  it("requires a second tap within the confirm window to actually delete the workout, then closes the sheet", async () => {
    const { wrapper } = await mountDetail(workoutFixture());

    const deleteBtn = wrapper.find(".delete-btn");
    expect(deleteBtn.text()).toContain("Workout löschen");

    await deleteBtn.trigger("click"); // arm
    expect(wrapper.find(".delete-btn").text()).toContain("Wirklich löschen?");
    expect(deleteWorkoutMock).not.toHaveBeenCalled();

    await wrapper.find(".delete-btn").trigger("click"); // confirm
    await flushPromises();

    expect(deleteWorkoutMock).toHaveBeenCalledWith("w-1");
    // Real SheetModal.dismiss() -> did-dismiss -> deferred close emit (rAF stubbed synchronous).
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("closing via the sheet's own close button emits close", async () => {
    const { wrapper } = await mountDetail(workoutFixture());

    await wrapper.find(".btn-close").trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("renders the primary/secondary trained muscles from the catalog's own muscle data", async () => {
    const wrapper = mountWithProviders(WorkoutDetail, {
      props: { workoutId: "w-1" },
      global: { stubs: { IonModal: IonModalStub } },
    });
    getWorkoutMock.mockReset().mockResolvedValue(
      workoutFixture({
        workoutExercises: [
          {
            id: "we-1",
            exerciseId: "ex-1",
            orderIndex: 0,
            exercise: { id: "ex-1", slug: "bench-press", name: null, isBodyweight: false, equipment: "barbell" },
            sets: [{ id: "s-1", setIndex: 0, weightKg: 60, reps: 8, isWarmup: false, loggedAt: null, isPr: false }],
          },
        ],
      }),
    );
    useCatalogStore().$patch({
      exercises: [
        {
          id: "ex-1",
          slug: "bench-press",
          name: null,
          equipment: "barbell",
          requiredEquipment: [],
          movementPattern: "push",
          isBodyweight: false,
          isCustom: false,
          demoStartImage: null,
          demoEndImage: null,
          howToKey: null,
          hasImage: true,
          muscles: [
            { slug: "chest", role: "primary" },
            { slug: "triceps", role: "secondary" },
          ],
        },
      ],
    });
    await flushPromises();
    await wrapper.vm.$nextTick();

    // MuscleFigure renders one <img class="overlay"> per trained muscle slug (front+back) once
    // it has primary/secondary data to work with.
    expect(wrapper.find(".muscle-figure").exists()).toBe(true);
    expect(wrapper.findAll(".overlay").length).toBeGreaterThan(0);
  });
});
