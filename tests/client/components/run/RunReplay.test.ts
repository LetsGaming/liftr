// RunReplay.vue's own logic (playback schedule, interpolated frames, play/pause/seek, speed) is
// independent of how the marker actually gets drawn — RunMap.vue (stubbed here, its own Leaflet
// rendering is covered by RunMap.test.ts) is just told where to put a marker. rAF/matchMedia are
// stubbed the same deterministic way tests/client/composables/useCountUp.test.ts already
// establishes for this repo (jsdom has neither), so playback is driven frame-by-frame instead of
// depending on real wall-clock timing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunReplay from "~client/components/run/RunReplay.vue";
import type { RunPoint } from "~client/stores/runsStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const RunMapStub = {
  props: ["points"],
  template: `<div class="runmap-stub"></div>`,
  methods: {
    setMarkerPosition: vi.fn(),
  },
};

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafNextId: number;

function flushRaf(at = 0) {
  const pending = [...rafCallbacks.values()];
  rafCallbacks.clear();
  pending.forEach((cb) => cb(at));
}

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reducedMotion }) as unknown as typeof matchMedia);
}

beforeEach(() => {
  rafCallbacks = new Map();
  rafNextId = 0;
  stubMatchMedia(false);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      const id = ++rafNextId;
      rafCallbacks.set(id, cb);
      return id;
    }) as unknown as typeof requestAnimationFrame,
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => rafCallbacks.delete(id)) as unknown as typeof cancelAnimationFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makePoint(overrides: Partial<RunPoint> = {}): RunPoint {
  return { idx: 0, t: "2026-03-15T07:00:00.000Z", lat: 52.5, lon: 13.4, ele: null, hr: null, cadence: null, ...overrides };
}

function mountReplay(points: RunPoint[]) {
  return mountWithProviders(RunReplay, {
    props: { points },
    global: { stubs: { RunMap: RunMapStub } },
  });
}

describe("RunReplay", () => {
  it("shows total time as 0:00 with no points", () => {
    const wrapper = mountReplay([]);

    expect(wrapper.find(".time").text()).toBe("0:00 / 0:00");
  });

  it("collapses a long real-world gap into a short fixed pause and formats total time", () => {
    const points = [
      makePoint({ idx: 0, t: "2026-03-15T07:00:00.000Z" }),
      makePoint({ idx: 1, t: "2026-03-15T07:00:05.000Z" }), // 5s real gap, kept as-is
      makePoint({ idx: 2, t: "2026-03-15T07:05:05.000Z" }), // 5min real gap, collapsed to 1.5s
    ];
    const wrapper = mountReplay(points);

    // total = 5000ms + 1500ms = 6500ms -> 0:07 (Math.round(6500/1000) = 7)
    expect(wrapper.find(".time").text()).toBe("0:00 / 0:07");
  });

  it("only shows HR/cadence readouts when the points actually carry that field", () => {
    const withNeither = mountReplay([makePoint()]);
    expect(withNeither.find(".readouts").findAll(".readout")).toHaveLength(1); // pace only

    const withHr = mountReplay([makePoint({ hr: 140 })]);
    expect(withHr.text()).toContain("Puls");

    const withCadence = mountReplay([makePoint({ cadence: 82 })]);
    expect(withCadence.text()).toContain("Kadenz");
  });

  it("toggle() plays (schedules a frame, shows the pause icon) then pauses again", async () => {
    const points = [makePoint({ t: "2026-03-15T07:00:00.000Z" }), makePoint({ idx: 1, t: "2026-03-15T07:00:10.000Z" })];
    const wrapper = mountReplay(points);

    await wrapper.find(".play-btn").trigger("click");
    expect(wrapper.find(".play-btn svg").classes()).toContain("app-icon--pause");
    expect(rafCallbacks.size).toBe(1);

    await wrapper.find(".play-btn").trigger("click");
    expect(wrapper.find(".play-btn svg").classes()).toContain("app-icon--play");
  });

  it("stops playing once the playhead reaches the end", async () => {
    const points = [makePoint({ t: "2026-03-15T07:00:00.000Z" }), makePoint({ idx: 1, t: "2026-03-15T07:00:01.000Z" })];
    const wrapper = mountReplay(points); // total = 1000ms

    await wrapper.find(".play-btn").trigger("click");
    flushRaf(0); // first frame only records a start timestamp, doesn't advance the playhead yet
    flushRaf(2000); // second frame: 2000ms elapsed, well past the 1000ms total
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".play-btn svg").classes()).toContain("app-icon--play"); // playing flipped back to false
  });

  it("seek pauses playback and moves the playhead to the given percentage", async () => {
    const points = [makePoint({ t: "2026-03-15T07:00:00.000Z" }), makePoint({ idx: 1, t: "2026-03-15T07:00:10.000Z" })];
    const wrapper = mountReplay(points); // total = 10000ms

    await wrapper.find(".play-btn").trigger("click");
    expect(rafCallbacks.size).toBe(1);

    const scrubber = wrapper.find(".scrubber");
    await scrubber.setValue("50");

    expect(wrapper.find(".play-btn svg").classes()).toContain("app-icon--play"); // seek() pauses
    expect(wrapper.find(".time").text()).toBe("0:05 / 0:10");
  });

  it("clicking a speed button marks it active", async () => {
    const wrapper = mountReplay([makePoint()]);

    const speedButtons = wrapper.findAll(".speed-btn");
    expect(speedButtons[0]!.classes()).toContain("active"); // default speed = 1

    await speedButtons[2]!.trigger("click"); // "4x"
    expect(speedButtons[2]!.classes()).toContain("active");
    expect(speedButtons[0]!.classes()).not.toContain("active");
  });

  it("shows the reduced-motion note when prefers-reduced-motion is set", () => {
    stubMatchMedia(true);
    const wrapper = mountReplay([makePoint()]);

    expect(wrapper.find(".reduce-note").exists()).toBe(true);
  });

  it("shows no reduced-motion note otherwise", () => {
    stubMatchMedia(false);
    const wrapper = mountReplay([makePoint()]);

    expect(wrapper.find(".reduce-note").exists()).toBe(false);
  });
});
