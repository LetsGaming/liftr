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

function projector(lat0: number) {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return {
    project: (p: Waypoint): Point2 => ({ x: p.lon * mPerDegLon, y: p.lat * M_PER_DEG_LAT }),
    unproject: (p: Point2): Waypoint => ({ lat: p.y / M_PER_DEG_LAT, lon: p.x / mPerDegLon }),
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

  // Project about the chord's own midpoint latitude — keeps the local longitude scale accurate
  // for the specific stretch being bridged, rather than drifting for loops far from the equator.
  const { project, unproject } = projector((end.lat + start.lat) / 2);
  const p = project(end);
  const q = project(start);
  const abx = q.x - p.x;
  const aby = q.y - p.y;

  const centroid = {
    lat: waypoints.reduce((s, w) => s + w.lat, 0) / waypoints.length,
    lon: waypoints.reduce((s, w) => s + w.lon, 0) / waypoints.length,
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
