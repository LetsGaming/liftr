/**
 * Generates the intermediate waypoints for a "close the loop" return leg — placed once, then
 * edited like any other waypoint (dragged, removed) rather than regenerated live. Used by the
 * route wizard's "Schleife schließen" toggle: without this, closing a loop was a single synthetic
 * point back at the start, which OpenRouteService then routed as the shortest path home — usually
 * the same roads walked out on, not a loop at all.
 *
 * Works in a local metric plane (an equirectangular approximation centered on the chord it's
 * bridging) rather than directly in lat/lon degrees, since a degree of longitude shrinks with
 * latitude — arithmetic in raw degrees would bulge east-west loops the wrong amount as you move
 * away from the equator. The projection is only ever used internally here; every public
 * lat/lon in and out is a real WGS84 coordinate.
 */
import { haversineM } from "./gps.js";

export interface Waypoint {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_000;
const M_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

/** cos(lat) → 0 at the poles, so metres-per-degree-of-longitude → 0 and `unproject` ends up
 *  dividing by nearly nothing, throwing the output longitude far outside ±180° (findings C —
 *  confirmed up to lon = -198°). No running route gets within a kilometre of a pole, so this
 *  floor never engages in practice; it costs one Math.max and converts an impossible-to-debug
 *  garbage coordinate into a merely-distorted one. */
const MIN_M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((89.9 * Math.PI) / 180);

/** A loop shorter than this is already closed for practical purposes — bulging an arc across a
 *  near-zero chord would just create a tiny, meaningless zigzag. */
const MIN_CHORD_M = 50;
/** Below this fraction of the chord length, the centroid sits close enough to the P→Q line that
 *  "which side is the centroid on" is numerically noisy (an out-and-back with 2 waypoints is
 *  exactly this case — the centroid sits ON the line). Falls back to a fixed side rather than a
 *  sign that could flip between near-identical inputs. */
const DEGENERATE_SIDE_RATIO = 0.05;
const MIN_BULGE_M = 50;
const MAX_BULGE_M = 2000;
const BULGE_RATIO = 0.35;
const DEFAULT_COUNT = 3;

interface Point2 {
  x: number;
  y: number;
}

/** Longitude is discontinuous at ±180°: 179.99 and -179.99 are 2 km apart on the ground but
 *  359.98 degrees apart numerically, and the local-plane projection below is plain linear
 *  arithmetic with no way to know that. Unwrapping every longitude into one continuous run around
 *  a single reference point before projecting — and wrapping the result back afterwards — is what
 *  keeps an arc that crosses the antimeridian next to the route instead of on the opposite side of
 *  the planet (findings A2, which saved as silently corrupted data because the wrong-side points
 *  still satisfied the server's lat/lon bounds). */
function unwrapLon(lon: number, refLon: number): number {
  return lon - 360 * Math.round((lon - refLon) / 360);
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function projector(lat0: number, refLon: number) {
  const mPerDegLon = Math.max(MIN_M_PER_DEG_LON, M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180));
  return {
    project: (p: Waypoint): Point2 => ({
      x: unwrapLon(p.lon, refLon) * mPerDegLon,
      y: p.lat * M_PER_DEG_LAT,
    }),
    /** Every public coordinate this module returns passes through here, which makes it the one
     *  place that can guarantee the WGS84 contract the server's zod schema enforces. Clamping and
     *  wrapping rather than throwing: a slightly-clamped point is a draggable annoyance, a
     *  rejected save is a dead end for the user. */
    unproject: (p: Point2): Waypoint => ({
      lat: Math.min(90, Math.max(-90, p.y / M_PER_DEG_LAT)),
      lon: wrapLon(p.x / mPerDegLon),
    }),
  };
}

/**
 * Generates `count` waypoints (excluding both endpoints) forming a smooth arc from the route's
 * last waypoint back toward its first, bulging away from the route's own centroid so the return
 * leg encloses area instead of folding back over the outbound path. Callers append these between
 * the existing waypoints and the closing point back at the start (mirrors RouteWizard.vue's
 * existing `effectiveWaypoints` — this function only produces the new interior points).
 *
 * Returns `[]` when there's nothing sensible to generate: fewer than 2 input waypoints, a chord
 * shorter than `MIN_CHORD_M`, or `maxCount` leaves no room (the server's 50-waypoint cap, minus
 * the input waypoints and the eventual closing point, already spoken for).
 */
export function generateLoopWaypoints(
  waypoints: Waypoint[],
  opts?: { count?: number; bulgeRatio?: number; maxCount?: number },
): Waypoint[] {
  if (waypoints.length < 2) return [];
  const count = Math.max(0, Math.min(opts?.count ?? DEFAULT_COUNT, opts?.maxCount ?? Infinity));
  if (count === 0) return [];

  const start = waypoints[0]!;
  const end = waypoints[waypoints.length - 1]!;
  const chordM = haversineM(end, start);
  if (chordM < MIN_CHORD_M) return [];

  // Unwrap everything relative to the loop's own start — arbitrary but consistent, and always
  // within ±180° of every other point on a route short enough to run.
  const refLon = waypoints[0]!.lon;
  const { project, unproject } = projector((end.lat + start.lat) / 2, refLon);
  const p = project(end);
  const q = project(start);
  const abx = q.x - p.x;
  const aby = q.y - p.y;

  const centroid = {
    lat: waypoints.reduce((s, w) => s + w.lat, 0) / waypoints.length,
    lon: waypoints.reduce((s, w) => s + unwrapLon(w.lon, refLon), 0) / waypoints.length,
  };
  const c = project(centroid);
  const acx = c.x - p.x;
  const acy = c.y - p.y;
  const cross = abx * acy - aby * acx;
  const perpDistM = Math.abs(cross) / chordM;

  // Rotate the chord vector ±90° for the two candidate bulge directions, then pick whichever
  // points away from the centroid — a loop should enclose new ground, not re-cover the outbound
  // path. Below the degenerate threshold (centroid ~on the chord, e.g. a 2-waypoint out-and-back)
  // the sign is meaningless noise, so a fixed direction is used instead.
  const leftNormal = { x: -aby, y: abx };
  const rightNormal = { x: aby, y: -abx };
  const degenerate = perpDistM < DEGENERATE_SIDE_RATIO * chordM;
  const normal = degenerate ? leftNormal : cross > 0 ? rightNormal : leftNormal;
  const normalLen = Math.hypot(normal.x, normal.y) || 1;
  const unitNormal = { x: normal.x / normalLen, y: normal.y / normalLen };

  const bulgeRatio = opts?.bulgeRatio ?? BULGE_RATIO;
  const bulgeM = Math.min(MAX_BULGE_M, Math.max(MIN_BULGE_M, bulgeRatio * chordM));

  const result: Waypoint[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const arcHeight = bulgeM * Math.sin(Math.PI * t);
    result.push(
      unproject({
        x: p.x + t * abx + unitNormal.x * arcHeight,
        y: p.y + t * aby + unitNormal.y * arcHeight,
      }),
    );
  }
  return result;
}
