/**
 * GPS trackpoint math for run import (audit §5 / plan Phase 4.1): smoothing, distance,
 * and pause-gap detection over a stored per-point trackpoint array. Pure functions, no I/O —
 * used by the server on import and reusable by the client for replay math.
 */

export interface RunPoint {
  /** unix ms timestamp */
  t: number;
  lat: number;
  lon: number;
  ele?: number;
  hr?: number;
  cadence?: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points, in meters. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Implausible for a run — points faster than this are dropped as GPS jitter/error. */
export const MAX_PLAUSIBLE_SPEED_M_S = 8;

/** A gap longer than this between consecutive points is treated as a pause, not distance/time. */
export const PAUSE_GAP_S = 10;

/** 5-point centered moving average on lat/lon to reduce GPS jitter before distance accumulation. */
export function smoothPoints(points: RunPoint[], window = 5): RunPoint[] {
  if (points.length <= window) return points;
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(points.length - 1, i + half);
    const slice = points.slice(lo, hi + 1);
    const lat = slice.reduce((s, q) => s + q.lat, 0) / slice.length;
    const lon = slice.reduce((s, q) => s + q.lon, 0) / slice.length;
    return { ...p, lat, lon };
  });
}

export interface RunSummary {
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
}

/**
 * Compute a run summary from a (possibly raw, un-smoothed) trackpoint array.
 * Drops implausible-speed jumps and excludes pause gaps from both distance and duration.
 * The caller is responsible for persisting `points` in full (run_points) — this function
 * only derives the cached summary; it never discards the source array.
 */
export function summarizeRun(rawPoints: RunPoint[]): RunSummary {
  if (rawPoints.length < 2) {
    return { distanceM: 0, durationS: 0, avgPaceSPerKm: null, avgHr: null, elevationGainM: null };
  }
  const points = smoothPoints(rawPoints);
  let distanceM = 0;
  let movingS = 0;
  let elevationGainM = 0;
  let hrSum = 0;
  let hrCount = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const dtS = (cur.t - prev.t) / 1000;
    if (dtS <= 0) continue;

    if (dtS > PAUSE_GAP_S) {
      // treat as a pause: skip this interval's distance and time entirely
      continue;
    }

    const dM = haversineM(prev, cur);
    const speed = dM / dtS;
    if (speed > MAX_PLAUSIBLE_SPEED_M_S) {
      // GPS jitter/error spike — skip this interval's distance, but keep the time
      movingS += dtS;
      continue;
    }

    distanceM += dM;
    movingS += dtS;
    if (prev.ele != null && cur.ele != null && cur.ele > prev.ele) {
      elevationGainM += cur.ele - prev.ele;
    }
  }

  for (const p of points) {
    if (p.hr != null) {
      hrSum += p.hr;
      hrCount++;
    }
  }

  const avgPaceSPerKm = distanceM > 0 ? movingS / (distanceM / 1000) : null;

  return {
    distanceM,
    durationS: movingS,
    avgPaceSPerKm,
    avgHr: hrCount > 0 ? hrSum / hrCount : null,
    elevationGainM: rawPoints.some((p) => p.ele != null) ? elevationGainM : null,
  };
}
