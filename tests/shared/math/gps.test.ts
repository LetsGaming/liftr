import { describe, expect, it } from "vitest";
import { haversineM, summarizeRun, elevationGainFrom, pathDistanceM, type RunPoint } from "@liftr/shared";

describe("haversineM", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineM({ lat: 52.52, lon: 13.4 }, { lat: 52.52, lon: 13.4 })).toBeCloseTo(0, 3);
  });
  it("returns a plausible distance for a known 1-degree-lat delta (~111km)", () => {
    const d = haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

function fixtureRun(): RunPoint[] {
  const points: RunPoint[] = [];
  const start = Date.now();
  // ~1km straight line north over 5 minutes, 1 point/sec, with HR present
  for (let i = 0; i < 300; i++) {
    points.push({ t: start + i * 1000, lat: 52.5 + i * 0.00003, lon: 13.4, hr: 140 + (i % 10) });
  }
  return points;
}

describe("summarizeRun", () => {
  it("computes distance/duration/pace/hr for a clean fixture run", () => {
    const s = summarizeRun(fixtureRun());
    expect(s.distanceM).toBeGreaterThan(900);
    expect(s.distanceM).toBeLessThan(1100);
    expect(s.durationS).toBeCloseTo(299, 0);
    expect(s.avgPaceSPerKm).not.toBeNull();
    expect(s.avgHr).toBeGreaterThan(130);
  });

  it("excludes a pause gap from distance and duration", () => {
    const points = fixtureRun();
    // splice a 60s pause with no movement into the middle
    const spliced = [
      ...points.slice(0, 150),
      ...points.slice(150).map((p) => ({ ...p, t: p.t + 60_000 })),
    ];
    const withGap = summarizeRun(spliced);
    const clean = summarizeRun(points);
    // the paused interval itself (1s of "normal" time in the clean run) is dropped entirely,
    // not just the 60s gap, so duration comes in a hair under clean's — that's the point of
    // the pause-gap rule (audit §5), not a bug: don't count "in transit through the gap" time.
    expect(withGap.durationS).toBeLessThanOrEqual(clean.durationS);
    expect(clean.durationS - withGap.durationS).toBeLessThan(2);
  });

  it("returns null avgHr when no points carry HR", () => {
    const points = fixtureRun().map(({ hr: _hr, ...rest }) => rest);
    expect(summarizeRun(points).avgHr).toBeNull();
  });
});

describe("pathDistanceM", () => {
  it("returns 0 for fewer than 2 points", () => {
    expect(pathDistanceM([])).toBe(0);
    expect(pathDistanceM([{ lat: 52.5, lon: 13.4 }])).toBe(0);
  });

  it("sums haversine distance over consecutive waypoints", () => {
    const points = [
      { lat: 52.4732, lon: 13.4021 },
      { lat: 52.475, lon: 13.4021 },
      { lat: 52.475, lon: 13.405 },
    ];
    const total = pathDistanceM(points);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeCloseTo(
      haversineM(points[0]!, points[1]!) + haversineM(points[1]!, points[2]!),
      3,
    );
  });
});

describe("elevationGainFrom", () => {
  it("returns null when no point carries elevation", () => {
    expect(elevationGainFrom([{}, {}])).toBeNull();
  });

  it("sums only positive deltas between consecutive points", () => {
    const gain = elevationGainFrom([{ ele: 10 }, { ele: 15 }, { ele: 12 }, { ele: 20 }]);
    expect(gain).toBe(5 + 8); // 10->15 (+5), 15->12 (skip, descent), 12->20 (+8)
  });

  it("treats a missing ele on either side of a pair as a gap, not a drop", () => {
    const gain = elevationGainFrom([{ ele: 10 }, {}, { ele: 20 }]);
    expect(gain).toBe(0);
  });
});
