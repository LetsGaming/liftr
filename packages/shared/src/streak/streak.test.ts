import { describe, expect, it } from "vitest";
import { computeStreak } from "./streak.js";

const NOW = new Date("2026-08-23T12:00:00Z"); // a Sunday

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("computeStreak", () => {
  it("returns 0 with full tokens when there is no activity at all", () => {
    expect(computeStreak(new Set())).toEqual({ streak: 0, tokensRemaining: 2 });
  });

  it("counts consecutive days including today", () => {
    const dates = new Set([daysAgo(0), daysAgo(1), daysAgo(2)]);
    expect(computeStreak(dates, NOW)).toEqual({ streak: 3, tokensRemaining: 2 });
  });

  it("does not break the streak if today hasn't been trained yet, and doesn't count today", () => {
    const dates = new Set([daysAgo(1), daysAgo(2), daysAgo(3)]);
    expect(computeStreak(dates, NOW)).toEqual({ streak: 3, tokensRemaining: 2 });
  });

  it("a single missed day is protected: streak survives, one token spent", () => {
    // trained today and 2 days ago, missed yesterday
    const dates = new Set([daysAgo(0), daysAgo(2), daysAgo(3)]);
    const result = computeStreak(dates, NOW);
    expect(result.streak).toBe(3);
    expect(result.tokensRemaining).toBe(1);
  });

  it("two missed days both get protected (max 2 tokens)", () => {
    const dates = new Set([daysAgo(0), daysAgo(3), daysAgo(4)]);
    const result = computeStreak(dates, NOW);
    expect(result.streak).toBe(3);
    expect(result.tokensRemaining).toBe(0);
  });

  it("a third missed day breaks the streak (no tokens left)", () => {
    // gap of 3 days (1,2,3 missing) exceeds the 2-token pool -> walk stops there
    const dates = new Set([daysAgo(0), daysAgo(4)]);
    const result = computeStreak(dates, NOW);
    expect(result.streak).toBe(1); // only today counted before running out of tokens
    expect(result.tokensRemaining).toBe(0);
  });

  it("training today after a long gap gives a fresh streak of 1, not 0", () => {
    const dates = new Set([daysAgo(0)]);
    expect(computeStreak(dates, NOW)).toEqual({ streak: 1, tokensRemaining: 2 });
  });

  describe("workoutsPerWeek-derived token pool", () => {
    it("a daily lifter gets the same minimal pool as the default (no larger, no smaller)", () => {
      expect(computeStreak(new Set(), NOW, 7)).toEqual({ streak: 0, tokensRemaining: 2 });
    });

    it("a 3x/week lifter's normal 2-day between-session gaps don't cost the streak", () => {
      // trains Mon/Wed/Fri-style: today, 2 days ago, 4 days ago — two 1-day gaps in between
      const dates = new Set([daysAgo(0), daysAgo(2), daysAgo(4)]);
      const result = computeStreak(dates, NOW, 3);
      expect(result.streak).toBe(3);
      expect(result.tokensRemaining).toBeGreaterThan(0);
    });

    it("a 2x/week lifter's on-schedule rest days don't falsely break the streak", () => {
      // trains today and 3 days ago — a gap the flat 2-token pool alone could not fully bridge
      const dates = new Set([daysAgo(0), daysAgo(3)]);
      const flatPoolResult = computeStreak(dates, NOW); // no workoutsPerWeek: today's flat behavior
      const scaledResult = computeStreak(dates, NOW, 2);
      expect(scaledResult.streak).toBeGreaterThanOrEqual(flatPoolResult.streak);
    });

    it("clamps a very low stated frequency instead of inflating the pool indefinitely", () => {
      expect(computeStreak(new Set(), NOW, 1).tokensRemaining).toBeLessThanOrEqual(6);
    });

    it("an unset/zero workoutsPerWeek falls back to the default pool", () => {
      expect(computeStreak(new Set(), NOW, 0)).toEqual({ streak: 0, tokensRemaining: 2 });
      expect(computeStreak(new Set(), NOW, undefined)).toEqual({ streak: 0, tokensRemaining: 2 });
    });
  });
});
