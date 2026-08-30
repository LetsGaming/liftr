import { describe, expect, it } from "vitest";
import { haversineM, summarizeRun, type RunPoint } from "./gps.js";

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
