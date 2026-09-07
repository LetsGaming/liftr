// @vitest-environment jsdom
//
// useCelebrate checks prefers-reduced-motion via matchMedia, a browser API jsdom doesn't
// implement by default — stubbed per test below.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCelebrate } from "~client/composables/useCelebrate";

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: reducedMotion }) as unknown as typeof matchMedia,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCelebrate", () => {
  it("starts idle: not running, no active beat", () => {
    const { activeIndex, running } = useCelebrate();

    expect(activeIndex.value).toBe(-1);
    expect(running.value).toBe(false);
  });

  describe("with real timing (prefers-reduced-motion: no-preference)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      stubMatchMedia(false);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("marks running true and steps activeIndex through each beat, holding holdMs before advancing", async () => {
      const { activeIndex, running, run } = useCelebrate();

      const promise = run([{ holdMs: 100 }, { holdMs: 100 }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(running.value).toBe(true);
      expect(activeIndex.value).toBe(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(activeIndex.value).toBe(1);

      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(activeIndex.value).toBe(-1);
      expect(running.value).toBe(false);
    });

    it("skips a beat marked show: false without holding or displaying it", async () => {
      const { activeIndex, run } = useCelebrate();

      const promise = run([{ holdMs: 100 }, { show: false, holdMs: 10000 }, { holdMs: 100 }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(activeIndex.value).toBe(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(activeIndex.value).toBe(2); // beat 1 skipped entirely, no 10s wait

      await vi.advanceTimersByTimeAsync(100);
      await promise;
    });

    it("defaults a beat's hold to 1400ms when holdMs is omitted", async () => {
      const { activeIndex, run } = useCelebrate();

      const promise = run([{}, { holdMs: 10 }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(activeIndex.value).toBe(0);

      await vi.advanceTimersByTimeAsync(1399);
      expect(activeIndex.value).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(activeIndex.value).toBe(1);

      // wait() polls every 50ms regardless of the requested holdMs, so a 10ms hold only actually
      // resolves at the next 50ms poll tick, not at the 10ms mark itself
      await vi.advanceTimersByTimeAsync(50);
      await promise;
    });

    it("skip() ends the currently active beat immediately instead of waiting out its holdMs", async () => {
      const { activeIndex, run, skip } = useCelebrate();

      const promise = run([{ holdMs: 10000 }, { holdMs: 50 }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(activeIndex.value).toBe(0);

      skip();
      await vi.advanceTimersByTimeAsync(50); // next 50ms poll tick notices the skip flag
      expect(activeIndex.value).toBe(1);

      await vi.advanceTimersByTimeAsync(50);
      await promise;
    });

    it("an empty beat list resolves immediately without ever setting activeIndex", async () => {
      const { activeIndex, running, run } = useCelebrate();

      await run([]);

      expect(activeIndex.value).toBe(-1);
      expect(running.value).toBe(false);
    });
  });

  describe("with prefers-reduced-motion: reduce", () => {
    beforeEach(() => {
      stubMatchMedia(true);
    });

    it("collapses every hold to zero, resolving without needing to advance real time", async () => {
      const { activeIndex, running, run } = useCelebrate();

      const promise = run([{ holdMs: 5000 }, { holdMs: 5000 }]);
      await promise;

      expect(activeIndex.value).toBe(-1);
      expect(running.value).toBe(false);
    });
  });
});
