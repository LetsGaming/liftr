// @vitest-environment jsdom
//
// useCountUp drives its animation with requestAnimationFrame/matchMedia — browser APIs jsdom
// doesn't implement by default — and uses onBeforeUnmount, which needs a real component instance
// (mounted via withSetup). rAF is stubbed manually with an id->callback map (so
// cancelAnimationFrame actually drops a pending frame, same as the real API) alongside a
// controllable performance.now(), so each animation frame's progress is fully deterministic
// instead of depending on real wall-clock time.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useCountUp } from "~client/composables/useCountUp";
import { withSetup } from "../helpers/withSetup";

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafNextId: number;
let nowValue: number;

function pendingRafCount(): number {
  return rafCallbacks.size;
}

function flushRaf(at: number) {
  nowValue = at;
  const pending = [...rafCallbacks.values()];
  rafCallbacks.clear();
  pending.forEach((cb) => cb(at));
}

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: reducedMotion }) as unknown as typeof matchMedia,
  );
}

beforeEach(() => {
  rafCallbacks = new Map();
  rafNextId = 0;
  nowValue = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      const id = ++rafNextId;
      rafCallbacks.set(id, cb);
      return id;
    }) as unknown as typeof requestAnimationFrame,
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      rafCallbacks.delete(id);
    }) as unknown as typeof cancelAnimationFrame,
  );
  vi.spyOn(performance, "now").mockImplementation(() => nowValue);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCountUp", () => {
  it("starts at the target's initial value", () => {
    stubMatchMedia(false);
    const target = ref(42);
    const { result } = withSetup(() => useCountUp(target));

    expect(result.value.value).toBe(42);
  });

  it("animates toward a new target with an ease-out cubic curve, landing exactly on it", async () => {
    stubMatchMedia(false);
    const target = ref(0);
    const { result } = withSetup(() => useCountUp(target, 1000));

    target.value = 100;
    await nextTick();
    expect(pendingRafCount()).toBe(1); // scheduled by animateTo, not yet run

    flushRaf(500); // 50% through the 1000ms duration
    const eased50 = 1 - Math.pow(1 - 0.5, 3);
    expect(result.value.value).toBeCloseTo(100 * eased50, 5);
    expect(result.value.value).not.toBe(100); // still mid-flight

    flushRaf(1000); // reaches the full duration
    expect(result.value.value).toBe(100);
    expect(pendingRafCount()).toBe(0); // animation loop stops scheduling once t >= 1
  });

  it("does not overshoot: clamps progress at the duration even if a frame lands late", async () => {
    stubMatchMedia(false);
    const target = ref(0);
    const { result } = withSetup(() => useCountUp(target, 1000));

    target.value = 50;
    await nextTick();
    flushRaf(5000); // way past the animation's duration in one jump

    expect(result.value.value).toBe(50);
  });

  it("jumps straight to the target under prefers-reduced-motion, no animation frame scheduled", async () => {
    stubMatchMedia(true);
    const target = ref(0);
    const { result } = withSetup(() => useCountUp(target, 1000));

    target.value = 77;
    await nextTick();

    expect(result.value.value).toBe(77);
    expect(pendingRafCount()).toBe(0);
  });

  it("re-targeting mid-animation cancels the in-flight frame and restarts from the current value", async () => {
    stubMatchMedia(false);
    const target = ref(0);
    const { result } = withSetup(() => useCountUp(target, 1000));

    target.value = 100;
    await nextTick();
    flushRaf(500); // partway toward 100
    const midValue = result.value.value;
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(100);

    target.value = 0; // re-target back down before finishing
    await nextTick();
    expect(pendingRafCount()).toBe(1); // stale continuation frame cancelled, one fresh frame scheduled

    // the restarted animation's own start time is "now" (500) at the moment it was scheduled, so
    // it needs a full further 1000ms of (fake) elapsed time — i.e. up to 1500 — to complete
    flushRaf(1500);
    expect(result.value.value).toBe(0);
  });

  it("skips animating when the new target already equals the currently displayed value", async () => {
    stubMatchMedia(false);
    const target = ref(5);
    const { result } = withSetup(() => useCountUp(target, 1000));
    result.value.value = 10; // simulate the displayed value already sitting at 10

    target.value = 10; // genuinely changes the target ref, but matches the current displayed value

    await nextTick();

    expect(pendingRafCount()).toBe(0);
    expect(result.value.value).toBe(10);
  });

  it("cancels its pending animation frame on unmount", async () => {
    stubMatchMedia(false);
    const target = ref(0);
    const { unmount } = withSetup(() => useCountUp(target, 1000));

    target.value = 100;
    await nextTick();
    expect(pendingRafCount()).toBe(1);

    unmount();

    expect(pendingRafCount()).toBe(0);
  });
});
