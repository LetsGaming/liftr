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

  it("produces a lens shape for a 2-waypoint out-and-back, on the same side whichever end was tapped first", () => {
    // With exactly 2 waypoints there is no approach-heading signal at all: the only segment in the
    // path IS the chord, so the heading is exactly anti-parallel to it and picks no side, and the
    // centroid of two points sits exactly on the line between them. The arc still has to bulge —
    // collapsing onto the chord would make "Schleife schließen" a straight line — so a fixed
    // convention decides, and that convention is absolute (east, then north) rather than
    // "left of the chord". Tap order must not decide which side of a coastal path the return leg
    // lands on (loop-findings.md A1, Fischland-Darß).
    const a = { lat: 52.5, lon: 13.4 };
    const b = { lat: 52.5, lon: 13.41 }; // due east, same latitude — an easy line to reason about

    const forward = generateLoopWaypoints([a, b]);
    const reversed = generateLoopWaypoints([b, a]);

    expect(forward.length).toBeGreaterThan(0);
    expect(reversed.length).toBeGreaterThan(0);
    // Off the chord, all on one side, not scattered across both.
    for (const p of [...forward, ...reversed]) {
      expect(Math.abs(p.lat - a.lat)).toBeGreaterThan(0.0001);
    }
    expect(new Set(forward.map((p) => Math.sign(p.lat - a.lat))).size).toBe(1);
    expect(new Set(reversed.map((p) => Math.sign(p.lat - a.lat))).size).toBe(1);
    // ...and it is the SAME side both ways round, which is the whole point.
    expect(Math.sign(forward[0]!.lat - a.lat)).toBe(Math.sign(reversed[0]!.lat - a.lat));
  });

  it("bulges to the side the final approach heading points toward, not to a fixed fallback side", () => {
    // An L bending north: start -> north -> east. Arriving at the last waypoint the runner is
    // heading southeast; the chord home points due west; southeast is south of due west, so the
    // return leg sweeps south — enclosing the ground between it and the northward outbound leg
    // instead of folding back over it.
    const end = { lat: 52.5, lon: 13.4 }; // waypoints[0] — where the loop closes
    const bend = { lat: 52.51, lon: 13.4 };
    const start = { lat: 52.5, lon: 13.41 }; // waypoints[last] — where the arc starts
    const arc = generateLoopWaypoints([end, bend, start]);
    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      expect(p.lat).toBeLessThan(end.lat);
    }
  });

  it("does not flip the bulge side for a small change in a mid-route waypoint (findings A1)", () => {
    // The report's own repro: a 3-waypoint route with a small southward bend. At a 95 m offset the
    // old code was inside DEGENERATE_SIDE_RATIO and bulged south (same side as the bend); at 105 m
    // it was outside and bulged north. A 10 m nudge roughly doubled the enclosed area.
    const p0 = { lat: 52.5, lon: 13.4 };
    const p2 = { lat: 52.5, lon: 13.41 };
    const southBend = (m: number) => ({ lat: 52.5 - m / 111320, lon: 13.405 });

    for (const offsetM of [95, 105]) {
      const arc = generateLoopWaypoints([p0, southBend(offsetM), p2]);
      expect(arc.length).toBeGreaterThan(0);
      for (const p of arc) {
        expect(p.lat).toBeGreaterThan(52.5); // north — away from the southward bend
      }
    }
  });

  it("picks the bulge side continuously across the whole range of bend depths", () => {
    // Same route, sweeping the bend from 200 m north of the chord to 200 m south of it. The side
    // may change exactly once, where the bend crosses the chord and the two sides are genuinely
    // mirror images — never anywhere else, and never at an arbitrary fraction-of-chord threshold.
    const p0 = { lat: 52.5, lon: 13.4 };
    const p2 = { lat: 52.5, lon: 13.41 };
    const sideAt = (offsetM: number) => {
      const arc = generateLoopWaypoints([p0, { lat: 52.5 - offsetM / 111320, lon: 13.405 }, p2]);
      expect(arc.length).toBeGreaterThan(0);
      return Math.sign(arc[0]!.lat - 52.5);
    };

    for (let offsetM = 5; offsetM <= 200; offsetM += 5) {
      expect(sideAt(offsetM)).toBe(1); // bend south -> bulge north
      expect(sideAt(-offsetM)).toBe(-1); // bend north -> bulge south
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
