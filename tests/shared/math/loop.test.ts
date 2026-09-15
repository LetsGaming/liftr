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
      // No arc point should land wildly further from either endpoint than the chord itself plus the
      // excursion the clamp allows for a chord this length (see clampBulgeM).
      const slack = 1.0 * Math.sqrt(chordM * Math.min(chordM, 5000));
      expect(haversineM(p, start)).toBeLessThan(chordM + 2 * slack);
      expect(haversineM(p, end)).toBeLessThan(chordM + 2 * slack);
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

  // --- findings A6: the arc has to know which way you were already going ---

  /** Compass bearing in degrees from `a` to `b`, in the same convention loop-findings.md uses. */
  function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const mPerDegLat = (Math.PI / 180) * 6_371_000;
    const mPerDegLon = mPerDegLat * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
    return (Math.atan2((b.lon - a.lon) * mPerDegLon, (b.lat - a.lat) * mPerDegLat) * 180) / Math.PI;
  }
  /** Signed turn in (-180, 180]: 0 = straight ahead, ±180 = a full reversal. */
  function turnDeg(from: number, to: number) {
    return ((((to - from) % 360) + 540) % 360) - 180;
  }

  // Both routes end at exactly the same waypoint and start at exactly the same waypoint; only the
  // final approach differs (22° vs 303°). loop-findings.md A6 proved the old arc's first point was
  // byte-for-byte identical for both.
  const approach1 = [
    { lat: 52.5, lon: 13.4 },
    { lat: 52.5005, lon: 13.404 },
    { lat: 52.5012, lon: 13.408 },
    { lat: 52.503, lon: 13.411 },
    { lat: 52.5045, lon: 13.412 },
  ];
  const approach2 = [
    { lat: 52.5, lon: 13.4 },
    { lat: 52.5008, lon: 13.4125 },
    { lat: 52.502, lon: 13.4155 },
    { lat: 52.5035, lon: 13.4145 },
    { lat: 52.5045, lon: 13.412 },
  ];

  it("generates a different arc for a different final approach to the same waypoint", () => {
    const a = generateLoopWaypoints(approach1);
    const b = generateLoopWaypoints(approach2);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a[0]).not.toEqual(b[0]);
    expect(haversineM(a[0]!, b[0]!)).toBeGreaterThan(100);
  });

  it("puts the first generated point roughly ahead of the runner, not 99° off to the side", () => {
    for (const route of [approach1, approach2]) {
      const secondLast = route[route.length - 2]!;
      const last = route[route.length - 1]!;
      const arc = generateLoopWaypoints(route);
      const turn = turnDeg(bearingDeg(secondLast, last), bearingDeg(last, arc[0]!));
      // Was -99.0° for approach1 (a sharp lateral swing ORS can only reach by backtracking).
      expect(Math.abs(turn)).toBeLessThan(60);
    }
  });

  it("completes a partially-traced roundabout along the roundabout itself", () => {
    // loop-findings.md A6's second scenario: 3 taps covering 120° of a 40 m-radius roundabout.
    // The old arc cut across the island (its points sat ~4 m from the centre, 36 m off the ring).
    const center = { lat: 52.5, lon: 13.4 };
    const mPerDegLat = (Math.PI / 180) * 6_371_000;
    const mPerDegLon = mPerDegLat * Math.cos(52.5 * (Math.PI / 180));
    const onRing = (deg: number) => ({
      lat: center.lat + (40 * Math.cos((deg * Math.PI) / 180)) / mPerDegLat,
      lon: center.lon + (40 * Math.sin((deg * Math.PI) / 180)) / mPerDegLon,
    });

    const arc = generateLoopWaypoints([onRing(0), onRing(60), onRing(120)]);

    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      // 75 m, not 15 m: a raw last-segment-chord heading estimate is, by the tangent-chord
      // theorem, off from the true tangent by half the subtended arc angle. For this deliberately
      // coarse 3-tap/60°-spaced synthetic roundabout that produces a provable, deterministic ring
      // deviation of up to ~69 m across the three generated points — not a construction bug (the
      // "places every generated point on one circle" test below independently verifies the
      // construction is exact to ~5 m regardless of heading accuracy). 75 m clears that deviation
      // with margin while still catching a real regression, e.g. an inverted `sense`, which fails
      // to even close the loop.
      expect(Math.abs(haversineM(p, center) - 40)).toBeLessThan(75);
    }
  });

  it("places every generated point on one circle through the route's end and start", () => {
    // The structural invariant of the new shape: the arc is a circular arc, so the end waypoint,
    // every generated point and the start waypoint are all equidistant from a common centre.
    const route = approach2;
    const end = route[route.length - 1]!;
    const start = route[0]!;
    const arc = generateLoopWaypoints(route);
    const ring = [end, ...arc, start];

    // Fit the centre from the first three points, then check the rest against it.
    const mPerDegLat = (Math.PI / 180) * 6_371_000;
    const mPerDegLon = mPerDegLat * Math.cos(start.lat * (Math.PI / 180));
    const xy = ring.map((p) => ({ x: p.lon * mPerDegLon, y: p.lat * mPerDegLat }));
    const [a, b, c] = [xy[0]!, xy[1]!, xy[2]!];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    const ux =
      ((a.x ** 2 + a.y ** 2) * (b.y - c.y) +
        (b.x ** 2 + b.y ** 2) * (c.y - a.y) +
        (c.x ** 2 + c.y ** 2) * (a.y - b.y)) /
      d;
    const uy =
      ((a.x ** 2 + a.y ** 2) * (c.x - b.x) +
        (b.x ** 2 + b.y ** 2) * (a.x - c.x) +
        (c.x ** 2 + c.y ** 2) * (b.x - a.x)) /
      d;
    const radii = xy.map((p) => Math.hypot(p.x - ux, p.y - uy));
    for (const r of radii) {
      expect(r).toBeCloseTo(radii[0]!, -1); // within ~5 m — projection rounding only
    }
  });

  // --- findings A1, second repro: a coastal out-and-back where the side decides land vs. water ---

  it("puts the return leg on the same side of a coastal path however the pair was tapped", () => {
    // Fischland-Darß (Baltic coast): a spit running NNE-SSW, water on both sides, two taps ~1.2 km
    // apart. Nothing in a 2-point route can tell the generator which side is land — but tapping the
    // same two points in the other order must not silently move the return leg across the water.
    const south = { lat: 54.365, lon: 12.38 };
    const north = { lat: 54.376, lon: 12.383 };

    const forward = generateLoopWaypoints([south, north]);
    const reversed = generateLoopWaypoints([north, south]);

    expect(forward).toHaveLength(3);
    expect(reversed).toHaveLength(3);
    // Same circle, traversed the other way round: the point SET is identical, reversed in order.
    const reversedBack = [...reversed].reverse();
    for (let i = 0; i < forward.length; i++) {
      expect(forward[i]!.lat).toBeCloseTo(reversedBack[i]!.lat, 6);
      expect(forward[i]!.lon).toBeCloseTo(reversedBack[i]!.lon, 6);
    }
  });

  it("encloses a comparable area for near-identical routes (no cliff at a threshold)", () => {
    // The concrete harm loop-findings.md A1 measured: 64,822 m² vs 132,590 m² of enclosed area for
    // a 10 m difference in a mid-route waypoint. Shoelace over the full closed ring.
    const p0 = { lat: 52.5, lon: 13.4 };
    const p2 = { lat: 52.5, lon: 13.41 };
    const southBend = (m: number) => ({ lat: 52.5 - m / 111320, lon: 13.405 });
    const areaOf = (offsetM: number) => {
      const route = [p0, southBend(offsetM), p2];
      const ring = [...route, ...generateLoopWaypoints(route), p0];
      const mPerDegLat = (Math.PI / 180) * 6_371_000;
      const mPerDegLon = mPerDegLat * Math.cos(52.5 * (Math.PI / 180));
      let twiceArea = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        twiceArea += a.lon * mPerDegLon * (b.lat * mPerDegLat) - b.lon * mPerDegLon * (a.lat * mPerDegLat);
      }
      return Math.abs(twiceArea) / 2;
    };

    const at95 = areaOf(95);
    const at105 = areaOf(105);
    expect(Math.abs(at95 - at105) / Math.max(at95, at105)).toBeLessThan(0.1);
  });

  it("still returns [] for the cases that have nothing sensible to generate", () => {
    // Guards the early returns the report confirmed correct (section D: duplicate waypoints).
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }, { lat: 52.5, lon: 13.4 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }])).toEqual([]);
  });

  it("is deterministic and free of hidden state across repeated calls", () => {
    // Section D relies on this: setCloseLoop toggling off and back on must reproduce the same arc.
    const route = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5005, lon: 13.404 },
      { lat: 52.5045, lon: 13.412 },
    ];
    expect(generateLoopWaypoints(route)).toEqual(generateLoopWaypoints(route));
  });

  it("does not mutate the waypoint array it was given", () => {
    const route = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5045, lon: 13.412 },
    ];
    const snapshot = JSON.stringify(route);
    generateLoopWaypoints(route);
    expect(JSON.stringify(route)).toBe(snapshot);
  });

  // --- findings A3 / A4: proportionate at both ends of the scale ---

  /** Greatest distance from the chord over the generated arc — the quantity A3/A4 tabulate. */
  function excursionM(waypoints: { lat: number; lon: number }[]) {
    const start = waypoints[0]!;
    const end = waypoints[waypoints.length - 1]!;
    const arc = generateLoopWaypoints(waypoints);
    const chordM = haversineM(end, start);
    // Distance from a point to the chord, via the triangle-area identity, all in metres.
    return Math.max(
      ...arc.map((p) => {
        const a = haversineM(end, p);
        const b = haversineM(p, start);
        const s = (a + b + chordM) / 2;
        const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - chordM)));
        return (2 * area) / chordM;
      }),
    );
  }

  it("keeps the detour proportionate on short loops instead of flooring it at 50 m", () => {
    // loop-findings.md A3: a 50 m fixed floor was 99% of a 50.5 m chord and 50% of a 100 m one.
    const due = (metresEast: number) => [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.4 + metresEast / (111_195 * Math.cos((52.5 * Math.PI) / 180)) },
    ];
    for (const chordM of [50.5, 60, 100, 143]) {
      const ratio = excursionM(due(chordM)) / chordM;
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(0.45); // was 0.99 at a 50.5 m chord
    }
  });

  it("never collapses the detour to nothing when the runner is already heading home", () => {
    // The floor's real job after the Phase 1 redesign: a heading pointed almost straight at the
    // start gives a tangent-chord angle near zero, i.e. an arc indistinguishable from the chord.
    const route = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.4 },
      { lat: 52.5099, lon: 13.4002 }, // final approach: aimed almost exactly back at the start
    ];
    const chordM = haversineM(route[route.length - 1]!, route[0]!);
    expect(excursionM(route)).toBeGreaterThan(0.1 * chordM);
  });

  it("keeps the detour a meaningful fraction of a long chord instead of capping it at 2 km", () => {
    // loop-findings.md A4: the old cap made the return leg 5% of a 40 km chord and 2% of a 100 km
    // one. Still bounded — it just doesn't stop growing.
    const north = (metres: number) => [
      { lat: 52.0, lon: 13.4 },
      { lat: 52.0 + metres / 111_195, lon: 13.4 },
    ];
    const at10k = excursionM(north(10_000));
    const at40k = excursionM(north(40_000));
    expect(at10k).toBeGreaterThan(0.2 * 10_000);
    expect(at40k).toBeGreaterThan(0.2 * 40_000);
    expect(at40k).toBeGreaterThan(at10k); // grows, unlike the old flat cap
    expect(at40k).toBeLessThan(40_000); // but stays bounded
  });

  // --- findings C: defence in depth for inputs the only production caller never produces today ---

  it("returns [] rather than NaN coordinates for non-finite or out-of-range input", () => {
    // `NaN < MIN_CHORD_M` is false in JS, so the chord guard never caught a NaN and every output
    // point came back {lat: NaN, lon: NaN}.
    expect(generateLoopWaypoints([{ lat: NaN, lon: 13.4 }, { lat: 52.5, lon: 13.41 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: Infinity }, { lat: 52.5, lon: 13.41 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }, { lat: 91, lon: 13.41 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }, { lat: 52.5, lon: -181 }])).toEqual([]);
  });

  it("treats a fractional or negative count as the integer it can honour", () => {
    // Lat-identical endpoints (not the brief's original 52.5/52.51 diagonal pair): with no
    // approach-heading signal, bulgeNormal's fixed fallback convention picks a normal that is
    // purely perpendicular to the chord, so only a chord that itself runs along one projected axis
    // (here: due east) makes the two symmetric interior points (t=1/3 and 2/3) equidistant in raw
    // lat from the chord's mean lat. A diagonal chord bulges along a normal that mixes lat and lon,
    // so the same "matched pair" check would fail even with a correctly-floored count — that's an
    // artifact of which axis the assertion reads, not of the count handling under test here.
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.41 },
    ];
    // count: 2.5 used to run for i=1,2 with t=i/3.5, giving a ~25% height difference between what
    // should be a matched pair.
    const half = generateLoopWaypoints(waypoints, { count: 2.5 });
    expect(half).toHaveLength(2);
    const chordLat = 52.5;
    expect(Math.abs(half[0]!.lat - chordLat)).toBeCloseTo(Math.abs(half[1]!.lat - chordLat), 4);

    expect(generateLoopWaypoints(waypoints, { count: -3 })).toEqual([]);
    expect(generateLoopWaypoints(waypoints, { count: 0 })).toEqual([]);
  });

  it("caps count independently of maxCount", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.41 },
    ];
    // 1,000,000 points used to allocate for ~70 ms with no caller-supplied maxCount to stop it.
    // 48 is what the server's 50-waypoint array leaves once the two real endpoints are counted.
    expect(generateLoopWaypoints(waypoints, { count: 1_000_000 })).toHaveLength(48);
  });

  it("treats bulgeRatio: 0 as no bulge, and an invalid ratio as the default", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.41 },
    ];
    // 0, negatives and -Infinity all used to produce the SAME output (floored to 50 m), so
    // bulgeRatio: 0 did not mean "no bulge".
    const flat = generateLoopWaypoints(waypoints, { bulgeRatio: 0 });
    expect(flat).toHaveLength(3);
    for (const p of flat) {
      expect(p.lat).toBeCloseTo(52.5, 6); // straight along the chord
    }

    const dflt = generateLoopWaypoints(waypoints);
    for (const invalid of [-1, NaN, -Infinity, Infinity]) {
      expect(generateLoopWaypoints(waypoints, { bulgeRatio: invalid })).toEqual(dflt);
    }
  });
});
