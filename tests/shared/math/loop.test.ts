import { describe, expect, it } from "vitest";
import { generateLoopWaypoints, haversineM, pathDistanceM } from "@liftr/shared";

describe("generateLoopWaypoints", () => {
  it("returns [] for fewer than 2 waypoints", () => {
    expect(generateLoopWaypoints([])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }])).toEqual([]);
  });

  it("returns [] when the chord is already shorter than the minimum", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.500001, lon: 13.400001 }, // a few centimeters apart
    ];
    expect(generateLoopWaypoints(waypoints)).toEqual([]);
  });

  it("returns [] when maxCount leaves no room", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.41 },
    ];
    expect(generateLoopWaypoints(waypoints, { maxCount: 0 })).toEqual([]);
  });

  it("clamps to maxCount even when it's below the default count", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.41 },
    ];
    const result = generateLoopWaypoints(waypoints, { maxCount: 1 });
    expect(result).toHaveLength(1);
  });

  it("defaults to 3 intermediate points for an ordinary route", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.505, lon: 13.41 },
      { lat: 52.51, lon: 13.42 },
    ];
    expect(generateLoopWaypoints(waypoints)).toHaveLength(3);
  });

  it("produces a lens shape (bulges to one side), not a straight line, for a 2-waypoint out-and-back", () => {
    // The degenerate case: with only 2 waypoints the centroid sits exactly on the P->Q chord, so
    // "which side to bulge" has no signal from the route shape and must fall back to a fixed side
    // rather than collapsing the arc back onto the chord.
    const start = { lat: 52.5, lon: 13.4 };
    const end = { lat: 52.5, lon: 13.41 }; // due east, same latitude — an easy line to reason about
    const arc = generateLoopWaypoints([start, end]);
    expect(arc.length).toBeGreaterThan(0);
    // Every arc point should sit off the chord's latitude (i.e. off to one side), not on it.
    for (const p of arc) {
      expect(Math.abs(p.lat - start.lat)).toBeGreaterThan(0.0001);
    }
    // All on the same side (consistent sign), not scattered across both.
    const signs = new Set(arc.map((p) => Math.sign(p.lat - start.lat)));
    expect(signs.size).toBe(1);
  });

  it("bulges to the side opposite the route's own centroid for an L-shaped route", () => {
    // An L bending "up" (north) from a west->east chord — the centroid sits north of the P->Q
    // chord, so the generated arc should bulge south of it.
    const end = { lat: 52.5, lon: 13.4 }; // last waypoint (P)
    const bend = { lat: 52.51, lon: 13.4 }; // north of both endpoints
    const start = { lat: 52.5, lon: 13.41 }; // first waypoint (Q), east of `end`
    // generateLoopWaypoints treats waypoints[0] as the loop's start and the last entry as its
    // current end — mirror that ordering here (end...start is the chord being bridged).
    const arc = generateLoopWaypoints([end, bend, start]);
    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      expect(p.lat).toBeLessThan(end.lat); // bulges south, away from the northward bend
    }
  });

  it("keeps every generated point within a sane distance of the chord it's bridging", () => {
    const start = { lat: 52.5, lon: 13.4 };
    const end = { lat: 52.52, lon: 13.42 };
    const chordM = haversineM(end, start);
    const arc = generateLoopWaypoints([start, end]);
    for (const p of arc) {
      // Rough sanity bound: no arc point should land wildly further from either endpoint than the
      // chord length itself (bulge height is capped at 2km and scaled off the chord).
      expect(haversineM(p, start)).toBeLessThan(chordM + 2100);
      expect(haversineM(p, end)).toBeLessThan(chordM + 2100);
    }
  });

  it("round-trips the projection without drifting the arc off the correct hemisphere", () => {
    // A route in the southern hemisphere, western longitudes — exercises the cos(lat) scaling and
    // negative-coordinate unprojection path.
    const start = { lat: -33.86, lon: -70.9 };
    const end = { lat: -33.85, lon: -70.88 };
    const arc = generateLoopWaypoints([start, end]);
    for (const p of arc) {
      expect(p.lat).toBeLessThan(-33);
      expect(p.lat).toBeGreaterThan(-34);
      expect(p.lon).toBeLessThan(-70);
      expect(p.lon).toBeGreaterThan(-71);
    }
  });

  it("produces an arc distinctly longer than the straight chord (a real detour, not a wiggle)", () => {
    const start = { lat: 52.5, lon: 13.4 };
    const end = { lat: 52.52, lon: 13.43 };
    const chordM = haversineM(end, start);
    const arc = generateLoopWaypoints([start, end]);
    const arcPathM = pathDistanceM([end, ...arc, start]);
    expect(arcPathM).toBeGreaterThan(chordM * 1.05);
  });

  // --- findings A2 / C: the projection layer's own correctness ---

  it("keeps an arc across the ±180° line beside the route, not on the far side of the planet", () => {
    // Taveuni area, Fiji — two taps ~5 km apart straddling the antimeridian (loop-findings.md A2).
    // haversineM already gets the distance right; it was projector()'s raw `lon * mPerDegLon`
    // that interpolated the long way around the globe and produced points 3,750-5,385 km away.
    const start = { lat: -16.841, lon: 179.97 };
    const end = { lat: -16.83, lon: -179.985 };
    const chordM = haversineM(end, start);
    expect(chordM).toBeGreaterThan(4000);
    expect(chordM).toBeLessThan(6000);

    const arc = generateLoopWaypoints([start, end]);

    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      expect(haversineM(p, start)).toBeLessThan(4 * chordM);
      expect(haversineM(p, end)).toBeLessThan(4 * chordM);
    }
  });

  it("never emits a coordinate outside the range the server's waypoint schema accepts", () => {
    // The server's zod bounds (lat [-90,90], lon [-180,180]) are the contract every generated
    // point has to satisfy. A2's antimeridian points satisfied them while being garbage; C's
    // polar case violates them outright. Both are checked here, plus an equator crossing.
    const routes = [
      [{ lat: -16.841, lon: 179.97 }, { lat: -16.83, lon: -179.985 }],
      [{ lat: 89.99, lon: 0 }, { lat: 89.98, lon: 90 }],
      [{ lat: -89.99, lon: -179.999 }, { lat: -89.98, lon: 179.999 }],
      [{ lat: 0, lon: 179.999 }, { lat: 0.01, lon: -179.999 }],
    ];
    for (const waypoints of routes) {
      for (const p of generateLoopWaypoints(waypoints)) {
        expect(Number.isFinite(p.lat)).toBe(true);
        expect(Number.isFinite(p.lon)).toBe(true);
        expect(p.lat).toBeGreaterThanOrEqual(-90);
        expect(p.lat).toBeLessThanOrEqual(90);
        expect(p.lon).toBeGreaterThanOrEqual(-180);
        expect(p.lon).toBeLessThanOrEqual(180);
      }
    }
  });
});
