// @vitest-environment jsdom
//
// useXpChip.ts reads `window.matchMedia` (prefers-reduced-motion) directly, which doesn't exist
// under vitest's default `node` environment — see tests/README.md's Environment section.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useXpChip } from "~client/composables/useXpChip";

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches } as MediaQueryList),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useXpChip", () => {
  it("starts with no chip showing", () => {
    const { xpChip } = useXpChip();
    expect(xpChip.value).toBeNull();
  });

  it("trigger() shows the chip with the given amount", () => {
    const { xpChip, trigger } = useXpChip();
    trigger(25);
    expect(xpChip.value).toEqual({ key: 1, amount: 25 });
  });

  it("assigns each trigger a new, incrementing key", () => {
    const { xpChip, trigger } = useXpChip();
    trigger(10);
    expect(xpChip.value?.key).toBe(1);
    trigger(20);
    expect(xpChip.value?.key).toBe(2);
  });

  it("clears the chip after 1600ms when motion is not reduced", () => {
    const { xpChip, trigger } = useXpChip();
    trigger(15);

    vi.advanceTimersByTime(1599);
    expect(xpChip.value).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(xpChip.value).toBeNull();
  });

  it("uses a shorter 900ms lifetime when the user prefers reduced motion", () => {
    stubReducedMotion(true);
    const { xpChip, trigger } = useXpChip();
    trigger(15);

    vi.advanceTimersByTime(899);
    expect(xpChip.value).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(xpChip.value).toBeNull();
  });

  it("re-triggering before the previous chip expires replaces it and keeps it visible", () => {
    const { xpChip, trigger } = useXpChip();
    trigger(5); // key 1, would expire at t=1600

    vi.advanceTimersByTime(1000);
    trigger(8); // key 2, would expire at t=2600

    vi.advanceTimersByTime(600); // t=1600: key 1's timeout fires, but key no longer matches
    expect(xpChip.value).toEqual({ key: 2, amount: 8 });

    vi.advanceTimersByTime(1000); // t=2600: key 2's own timeout fires
    expect(xpChip.value).toBeNull();
  });
});
