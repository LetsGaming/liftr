/**
 * Downsampling a stored route's full point array for a lightweight list-response payload (e.g.
 * a route-card map thumbnail) — the client never needs the full road-snapped geometry just to
 * draw a small preview, only enough points to trace a recognizable shape. Deliberately even-
 * stride sampling, not Douglas-Peucker: at thumbnail scale (roughly 80x80px) the two are visually
 * indistinguishable, and even-stride is a few lines with no recursion/state to get wrong, unlike
 * a real simplification algorithm.
 */

/** Evenly samples `points` down to at most `maxPoints`, always keeping the first and last point
 *  so the shape's start/end never drifts. A no-op when `points` already fits. */
export function downsamplePolyline<T>(points: T[], maxPoints = 80): T[] {
  if (points.length <= maxPoints || maxPoints < 2) return points;
  const stride = (points.length - 1) / (maxPoints - 1);
  const sampled: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.round(i * stride)]!);
  }
  return sampled;
}
