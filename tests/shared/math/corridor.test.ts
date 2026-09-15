import { describe, expect, it } from "vitest";
import { buildAvoidCorridor, haversineM } from "@liftr/shared";

describe("buildAvoidCorridor", () => {
  it("returns null for fewer than 2 waypoints", () => {
    expect(buildAvoidCorridor([])).toBeNull();
    expect(buildAvoidCorridor([{ lat: 52.5, lon: 13.4 }])).toBeNull();
  });

  it("returns null for a non-finite or out-of-range coordinate", () => {
    const withNaN = [
      { lat: 52.5, lon: 13.4 },
      { lat: NaN, lon: 13.41 },
    ];
    const outOfRange = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 200 },
    ];
    expect(buildAvoidCorridor(withNaN)).toBeNull();
    expect(buildAvoidCorridor(outOfRange)).toBeNull();
  });

  it("returns null when the path is shorter than the trimmed ends", () => {
    // ~100 m apart, well under the default 2*120m = 240m needed to leave anything after trimming.
    const path = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5009, lon: 13.4 },
    ];
    expect(buildAvoidCorridor(path)).toBeNull();
  });

  it("builds one rectangle per surviving segment", () => {
    // A ~2km straight path (roughly north), no end-trimming so every segment survives.
    const path = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.509, lon: 13.4 },
      { lat: 52.518, lon: 13.4 },
    ];
    const rings = buildAvoidCorridor(path, { trimEndsM: 0 });
    expect(rings).not.toBeNull();
    expect(rings).toHaveLength(2);
    for (const ring of rings!) {
      expect(ring).toHaveLength(5); // 4 corners + closing repeat
      expect(ring[0]).toEqual(ring[4]);
    }
  });

  it("builds rings at the requested width", () => {
    const path = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.509, lon: 13.4 },
    ];
    const rings = buildAvoidCorridor(path, { widthM: 30, trimEndsM: 0 });
    expect(rings).toHaveLength(1);
    // Corners 0 and 3 are the two long edges' endpoints at the same end of the segment —
    // haversineM between them should be close to the requested width.
    const ring = rings![0]!;
    expect(haversineM(ring[0]!, ring[3]!)).toBeGreaterThan(28);
    expect(haversineM(ring[0]!, ring[3]!)).toBeLessThan(32);
  });

  it("skips zero-length (duplicate) segments without producing NaN coordinates", () => {
    const path = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.4 }, // duplicate tap
      { lat: 52.509, lon: 13.4 },
    ];
    const rings = buildAvoidCorridor(path, { trimEndsM: 0 });
    expect(rings).toHaveLength(1); // one real segment, the duplicate-duplicate segment skipped
    for (const ring of rings!) {
      for (const p of ring) {
        expect(Number.isFinite(p.lat)).toBe(true);
        expect(Number.isFinite(p.lon)).toBe(true);
      }
    }
  });

  it("leaves the ends unavoided", () => {
    // A long straight path so trimming both ends still leaves plenty in the middle.
    const path = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.518, lon: 13.4 }, // ~2 km north
    ];
    const rings = buildAvoidCorridor(path, { trimEndsM: 120 });
    expect(rings).not.toBeNull();
    // Every ring vertex should be at least ~100m from the path's own start/end (well short of the
    // full 120m to allow for the rectangle's own half-width reaching slightly back along the edge).
    for (const ring of rings!) {
      for (const p of ring) {
        expect(haversineM(p, path[0]!)).toBeGreaterThan(90);
        expect(haversineM(p, path[1]!)).toBeGreaterThan(90);
      }
    }
  });

  it("caps the number of rings for a very dense path", () => {
    const path = Array.from({ length: 2000 }, (_, i) => ({ lat: 52.5 + i * 0.0001, lon: 13.4 }));
    const rings = buildAvoidCorridor(path, { trimEndsM: 0 });
    expect(rings).not.toBeNull();
    expect(rings!.length).toBeLessThanOrEqual(200);
  });

  it("drops a ring that itself crosses the antimeridian, keeping the rest of the corridor accurate", () => {
    // Segment 0 stays entirely east of the line (survives); segment 1 crosses it, which its own
    // rectangle can't represent without wrapping around the planet, so it's dropped rather than
    // shipped as garbage geometry — the same "reject rather than guess" stance as loop.ts.
    const path = [
      { lat: 10, lon: 179.99 },
      { lat: 10, lon: 179.995 },
      { lat: 10, lon: -179.99 },
    ];
    const rings = buildAvoidCorridor(path, { trimEndsM: 0 });
    expect(rings).not.toBeNull();
    expect(rings).toHaveLength(1); // only the non-crossing segment survives
    for (const p of rings![0]!) {
      // A torn (unwrapped) ring would land ~40,000 km away on the opposite side of the planet —
      // the surviving ring's vertices stay within a couple of km of the segment they buffer.
      const distToEither = Math.min(haversineM(p, path[0]!), haversineM(p, path[1]!));
      expect(distToEither).toBeLessThan(2000);
    }
  });

  it("does not mutate its input", () => {
    const path = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.509, lon: 13.4 },
    ];
    const snapshot = JSON.parse(JSON.stringify(path));
    buildAvoidCorridor(path);
    expect(path).toEqual(snapshot);
  });
});
