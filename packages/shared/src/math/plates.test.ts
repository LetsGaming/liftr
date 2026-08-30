import { describe, expect, it } from "vitest";
import { calculatePlates, calculatePlatesFromInventory } from "./plates.js";

describe("calculatePlates", () => {
  it("splits an exact multi-plate target", () => {
    expect(calculatePlates(100, 20).perSide).toEqual([25, 15]);
    expect(calculatePlates(100, 20).exact).toBe(true);
  });

  it("uses one plate per side when that's exact", () => {
    const r = calculatePlates(60, 20);
    expect(r.perSide).toEqual([20]);
    expect(r.achievedWeightKg).toBe(60);
  });

  it("mixes plate sizes down to the smallest increment", () => {
    const r = calculatePlates(42.5, 20);
    expect(r.perSide).toEqual([10, 1.25]);
    expect(r.achievedWeightKg).toBe(42.5);
    expect(r.exact).toBe(true);
  });

  it("reports inexact when the target isn't reachable with the available plates", () => {
    const r = calculatePlates(21, 20);
    expect(r.perSide).toEqual([]);
    expect(r.achievedWeightKg).toBe(20);
    expect(r.exact).toBe(false);
  });

  it("never loads plates below the bar weight", () => {
    const r = calculatePlates(10, 20);
    expect(r.perSide).toEqual([]);
    expect(r.achievedWeightKg).toBe(20);
  });
});

describe("calculatePlatesFromInventory", () => {
  it("matches the unlimited greedy result when the inventory covers it generously", () => {
    const inventory = [
      { weightKg: 20, count: 8 },
      { weightKg: 10, count: 8 },
      { weightKg: 5, count: 8 },
      { weightKg: 2.5, count: 8 },
      { weightKg: 1.25, count: 8 },
    ];
    const r = calculatePlatesFromInventory(100, 20, inventory);
    expect(r.achievedWeightKg).toBe(100);
    expect(r.exact).toBe(true);
    expect(r.perSide.reduce((a, b) => a + b, 0)).toBe(40);
  });

  it("respects a limited plate count instead of assuming unlimited supply", () => {
    // Only two 20kg plates total (one pair) and four 5kg plates (two pairs) caps the per-side
    // total at 20+5+5=30kg — 100kg (40kg/side) just isn't reachable with this inventory.
    const inventory = [
      { weightKg: 20, count: 2 },
      { weightKg: 5, count: 4 },
    ];
    const r = calculatePlatesFromInventory(100, 20, inventory);
    expect(r.perSide).toEqual([20, 5, 5]);
    expect(r.achievedWeightKg).toBe(80);
    expect(r.exact).toBe(false);
  });

  it("only uses whole pairs — an odd plate out is never loaded lopsided", () => {
    // 3 plates of 10kg = only 1 usable pair (floor(3/2)), the third sits unused.
    const inventory = [{ weightKg: 10, count: 3 }];
    const r = calculatePlatesFromInventory(60, 20, inventory);
    expect(r.perSide).toEqual([10]);
    expect(r.achievedWeightKg).toBe(40);
    expect(r.exact).toBe(false);
  });

  it("prefers fewer plates when multiple combinations reach the same sum", () => {
    const inventory = [
      { weightKg: 10, count: 2 },
      { weightKg: 5, count: 4 },
    ];
    // 11.25kg per side isn't reachable exactly, but 10kg alone (1 plate) beats 5+5 (2 plates)
    // for reaching 10kg per side.
    const r = calculatePlatesFromInventory(42.5, 20, inventory);
    expect(r.perSide).toEqual([10]);
  });

  it("reports inexact and the best reachable weight when the target can't be hit", () => {
    const inventory = [{ weightKg: 2.5, count: 2 }];
    const r = calculatePlatesFromInventory(100, 20, inventory);
    expect(r.perSide).toEqual([2.5]);
    expect(r.achievedWeightKg).toBe(25);
    expect(r.exact).toBe(false);
  });

  it("never loads plates below the bar weight", () => {
    const r = calculatePlatesFromInventory(10, 20, [{ weightKg: 20, count: 4 }]);
    expect(r.perSide).toEqual([]);
    expect(r.achievedWeightKg).toBe(20);
  });

  it("handles an empty inventory", () => {
    const r = calculatePlatesFromInventory(100, 20, []);
    expect(r.perSide).toEqual([]);
    expect(r.achievedWeightKg).toBe(20);
    expect(r.exact).toBe(false);
  });
});
