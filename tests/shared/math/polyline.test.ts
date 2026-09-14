import { describe, expect, it } from "vitest";
import { downsamplePolyline } from "@liftr/shared";

describe("downsamplePolyline", () => {
  it("is a no-op when the array already fits", () => {
    const points = Array.from({ length: 10 }, (_, i) => i);
    expect(downsamplePolyline(points, 80)).toEqual(points);
  });

  it("is a no-op at the exact boundary (length === maxPoints)", () => {
    const points = Array.from({ length: 80 }, (_, i) => i);
    expect(downsamplePolyline(points, 80)).toEqual(points);
  });

  it("downsamples while always keeping the first and last point", () => {
    const points = Array.from({ length: 1000 }, (_, i) => i);
    const sampled = downsamplePolyline(points, 80);
    expect(sampled).toHaveLength(80);
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBe(999);
  });

  it("preserves ascending order (never re-samples out of sequence)", () => {
    const points = Array.from({ length: 337 }, (_, i) => i);
    const sampled = downsamplePolyline(points, 50);
    for (let i = 1; i < sampled.length; i++) {
      expect(sampled[i]).toBeGreaterThan(sampled[i - 1]!);
    }
  });

  it("handles a 2-point array unchanged", () => {
    const points = [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }];
    expect(downsamplePolyline(points, 80)).toEqual(points);
  });

  it("does not divide by zero when maxPoints < 2", () => {
    const points = Array.from({ length: 10 }, (_, i) => i);
    expect(downsamplePolyline(points, 1)).toEqual(points);
    expect(downsamplePolyline(points, 0)).toEqual(points);
  });
});
