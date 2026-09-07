import { computeReadiness } from "@liftr/shared";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getReadinessMock } = vi.hoisted(() => ({ getReadinessMock: vi.fn() }));

vi.mock("~client/services/readinessService", () => ({
  getReadiness: getReadinessMock,
}));

import { useReadinessStore } from "~client/stores/readinessStore";
import { useSettingsStore } from "~client/stores/settingsStore";
import type { MuscleLastTrained } from "~client/services/readinessService";

beforeEach(() => {
  setActivePinia(createPinia());
  getReadinessMock.mockReset();
});

describe("readinessStore", () => {
  it("starts with empty rows, not loaded, no error", () => {
    const store = useReadinessStore();

    expect(store.rows).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
  });

  it("load() populates rows and flips loaded on success", async () => {
    const rows: MuscleLastTrained[] = [{ slug: "chest", lastTrainedAt: null, wasPrimary: true }];
    getReadinessMock.mockResolvedValue(rows);
    const store = useReadinessStore();

    await store.load();

    expect(store.rows).toEqual(rows);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() sets error and leaves rows alone when the request fails", async () => {
    getReadinessMock.mockRejectedValue(new Error("offline"));
    const store = useReadinessStore();

    await store.load();

    expect(store.error).toBe(true);
    expect(store.rows).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() clears a previous error on a subsequent successful call", async () => {
    getReadinessMock.mockRejectedValueOnce(new Error("offline"));
    const store = useReadinessStore();
    await store.load();
    expect(store.error).toBe(true);

    getReadinessMock.mockResolvedValueOnce([]);
    await store.load();

    expect(store.error).toBe(false);
    expect(store.loaded).toBe(true);
  });

  describe("heat getter", () => {
    it("recomputes 0..1 readiness per slug against 'now', matching @liftr/shared's computeReadiness directly", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
      const rows: MuscleLastTrained[] = [
        { slug: "chest", lastTrainedAt: "2026-09-06T12:00:00Z", wasPrimary: true },
        { slug: "biceps", lastTrainedAt: null, wasPrimary: false },
      ];
      getReadinessMock.mockResolvedValue(rows);
      const store = useReadinessStore();
      await store.load();

      expect(store.heat.chest).toBeCloseTo(computeReadiness("chest", new Date("2026-09-06T12:00:00Z"), true, new Date(), undefined));
      // Never trained -> fully recovered regardless of primary/secondary.
      expect(store.heat.biceps).toBe(1);

      vi.useRealTimers();
    });

    it("widens (never shortens) the recovery window using settingsStore's birthYear", async () => {
      vi.useFakeTimers();
      // 65h into a 72h primary-chest window: partially recovered, room for the window to widen.
      vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
      const rows: MuscleLastTrained[] = [{ slug: "chest", lastTrainedAt: "2026-09-04T19:00:00Z", wasPrimary: true }];
      getReadinessMock.mockResolvedValue(rows);
      const store = useReadinessStore();
      await store.load();
      const withoutBirthYear = store.heat.chest!;
      expect(withoutBirthYear).toBeGreaterThan(0);
      expect(withoutBirthYear).toBeLessThan(1);

      useSettingsStore().$patch({ profile: { birthYear: 1950 } });
      const withBirthYear = store.heat.chest!;

      // A wider window means the same elapsed time is a *smaller* fraction of it.
      expect(withBirthYear).toBeLessThan(withoutBirthYear);

      vi.useRealTimers();
    });
  });

  describe("recoveredSlugs getter", () => {
    it("returns slugs with readiness >= 0.85, sorted most-recovered first", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
      const rows: MuscleLastTrained[] = [
        // 70h/72h primary window = 0.972
        { slug: "quads", lastTrainedAt: "2026-09-07T02:00:00Z", wasPrimary: true },
        // 65h/72h primary window = 0.903
        { slug: "chest", lastTrainedAt: "2026-09-07T07:00:00Z", wasPrimary: true },
        // 10h/48h primary window = 0.208, below threshold
        { slug: "biceps", lastTrainedAt: "2026-09-09T14:00:00Z", wasPrimary: true },
      ];
      getReadinessMock.mockResolvedValue(rows);
      const store = useReadinessStore();
      await store.load();

      expect(store.recoveredSlugs).toEqual(["quads", "chest"]);

      vi.useRealTimers();
    });
  });
});
