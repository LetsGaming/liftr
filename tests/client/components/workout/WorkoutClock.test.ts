// @vitest-environment jsdom
//
// WorkoutClock reads activeWorkoutStore state directly (see the component's own header comment
// on *why*: the Pinia elapsedSeconds getter is memoized against reactive deps and doesn't tick
// on its own) and repaints on a plain setInterval — vi.useFakeTimers() drives that deterministically.
// activeWorkoutStore's mutating actions fire-and-forget persist() into IndexedDB (idb.ts), which
// doesn't exist under vitest's jsdom environment — stubbed the same way
// tests/client/stores/activeWorkoutStore.spec.ts does.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkoutClock from "~client/components/workout/WorkoutClock.vue";
import { useActiveWorkoutStore } from "~client/stores/activeWorkoutStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

vi.mock("~client/lib/idb", () => ({
  saveActiveWorkout: vi.fn(),
  loadActiveWorkout: vi.fn(),
  clearActiveWorkout: vi.fn(),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WorkoutClock", () => {
  it("shows 00:00 before any workout has started", () => {
    const wrapper = mountWithProviders(WorkoutClock);

    expect(wrapper.find(".clock-time span").text()).toBe("00:00");
  });

  it("counts up once a workout is running, repainting every second from the store's raw fields", async () => {
    const wrapper = mountWithProviders(WorkoutClock);
    // mountWithProviders' pinia becomes the globally active one the moment app.use(pinia) runs
    // inside mount() — grabbing the store afterward returns that same instance.
    const store = useActiveWorkoutStore();
    const startedAt = Date.now();
    store.$patch({ startedAt, pausedAt: null, totalPausedMs: 0 });

    await vi.advanceTimersByTimeAsync(65_000); // 65s of ticking, one repaint per second
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".clock-time span").text()).toBe("1:05");
  });

  it("subtracts totalPausedMs from the elapsed time", async () => {
    const wrapper = mountWithProviders(WorkoutClock);
    const store = useActiveWorkoutStore();
    const startedAt = Date.now();
    store.$patch({ startedAt, pausedAt: null, totalPausedMs: 30_000 });

    await vi.advanceTimersByTimeAsync(65_000);
    await wrapper.vm.$nextTick();

    // 65s elapsed minus 30s paused = 35s
    expect(wrapper.find(".clock-time span").text()).toBe("0:35");
  });

  it("freezes on the paused timestamp while pausedAt is set, ignoring further ticks", async () => {
    const wrapper = mountWithProviders(WorkoutClock);
    const store = useActiveWorkoutStore();
    const startedAt = Date.now();
    // Paused after exactly 10s of running.
    store.$patch({ startedAt, pausedAt: startedAt + 10_000, totalPausedMs: 0 });

    await vi.advanceTimersByTimeAsync(20_000); // real clock moves on, pausedAt doesn't
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".clock-time span").text()).toBe("0:10");
  });

  it("clicking the pause/resume button toggles the store's pause state and persists it", async () => {
    const wrapper = mountWithProviders(WorkoutClock);
    const store = useActiveWorkoutStore();
    store.$patch({ startedAt: Date.now(), pausedAt: null, totalPausedMs: 0 });
    await wrapper.vm.$nextTick();

    const { saveActiveWorkout } = await import("~client/lib/idb");
    const button = wrapper.find(".icon-btn");
    expect(button.attributes("aria-label")).toBe("Pausieren");

    await button.trigger("click");
    expect(store.isPaused).toBe(true);
    expect(saveActiveWorkout).toHaveBeenCalled();

    await wrapper.vm.$nextTick();
    expect(wrapper.find(".icon-btn").attributes("aria-label")).toBe("Fortsetzen");

    await wrapper.find(".icon-btn").trigger("click");
    expect(store.isPaused).toBe(false);
  });

  it("renders content passed into the #actions slot alongside the pause button", () => {
    const wrapper = mountWithProviders(WorkoutClock, {
      slots: { actions: '<button class="cancel-btn">Abbrechen</button>' },
    });

    expect(wrapper.find(".cancel-btn").exists()).toBe(true);
    expect(wrapper.find(".clock-actions").find(".cancel-btn").exists()).toBe(true);
  });
});
