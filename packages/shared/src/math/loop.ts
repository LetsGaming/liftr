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
/** Shortest segment that still counts as an approach heading — below this a "segment" is a
 *  double-tap on the same spot, or GPS-grade jitter in a seeded track, not a direction of travel. */
const MIN_HEADING_SEGMENT_M = 1;
/** Both operands are unit vectors, so this is |sin(angle)|: the point at which two directions are
 *  numerically parallel and genuinely pick no side. Deliberately a floating-point epsilon and not
 *  a "how confident are we" threshold — see bulgeNormal's doc. */
const SIDE_EPS = 1e-6;
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

/** The direction the runner was travelling when they placed their final waypoint, as a unit vector
 *  in the projected plane. This is the input the old implementation never read (findings A6): it
 *  only ever looked at waypoints[0], waypoints[length-1], and the centroid of all of them, none of
 *  which encode a direction of travel — which is why the generated arc was provably byte-identical
 *  for two routes whose final approach differed by more than 90°. Walks backwards past sub-metre
 *  segments so a double-tap on the last point can't erase the signal. Returns null when no such
 *  segment exists, i.e. for a 2-waypoint out-and-back or a pile of identical taps. */
function approachDirection(projected: Point2[]): Point2 | null {
  const last = projected[projected.length - 1]!;
  for (let i = projected.length - 2; i >= 0; i--) {
    const v = { x: last.x - projected[i]!.x, y: last.y - projected[i]!.y };
    const len = Math.hypot(v.x, v.y);
    if (len >= MIN_HEADING_SEGMENT_M) return { x: v.x / len, y: v.y / len };
  }
  return null;
}

/** The part of `v` perpendicular to `axis`, re-normalised — or null when `v` is numerically
 *  parallel to `axis` and therefore points to neither side of it. Both arguments are unit vectors. */
function perpendicularComponent(v: Point2, axis: Point2): Point2 | null {
  const along = v.x * axis.x + v.y * axis.y;
  const perp = { x: v.x - along * axis.x, y: v.y - along * axis.y };
  const mag = Math.hypot(perp.x, perp.y);
  return mag > SIDE_EPS ? { x: perp.x / mag, y: perp.y / mag } : null;
}

/**
 * Unit normal to the chord, pointing to the side the return leg should bulge toward. Picked from
 * the strongest signal the route actually contains:
 *
 *  1. **The approach heading** — bulge toward whichever side of the chord the runner was already
 *     moving. A loop that keeps turning the way you were already turning is one you can run; one
 *     that asks for a 99° lateral swing at the last waypoint is one ORS has to reach by sending you
 *     back the way you came (findings A6).
 *  2. **Away from the route's own centroid** — the old primary rule, kept as the fallback for when
 *     the approach is exactly along the chord (a straight out-and-back). Encloses new ground rather
 *     than re-covering the outbound path.
 *  3. **A fixed compass convention** — when the route contains no preference at all.
 *
 * There is deliberately no "is the signal strong enough" threshold. The old
 * `perpDistM < DEGENERATE_SIDE_RATIO * chordM` gate threw away a perfectly usable signal on any
 * route whose bend was under 5% of the chord, and flipped the output side for a ~3 m waypoint nudge
 * at the boundary (findings A1). A sign is ambiguous only when it is zero, and at zero the two
 * candidate sides are mirror images of each other — so which one wins cannot matter.
 */
function bulgeNormal(chordUnit: Point2, approach: Point2 | null, projected: Point2[]): Point2 {
  if (approach) {
    const fromHeading = perpendicularComponent(approach, chordUnit);
    if (fromHeading) return fromHeading;
  }

  const p = projected[projected.length - 1]!;
  const centroid = {
    x: projected.reduce((s, w) => s + w.x, 0) / projected.length,
    y: projected.reduce((s, w) => s + w.y, 0) / projected.length,
  };
  const toCentroid = { x: centroid.x - p.x, y: centroid.y - p.y };
  const centroidLen = Math.hypot(toCentroid.x, toCentroid.y);
  if (centroidLen > 0) {
    const away = perpendicularComponent(
      { x: -toCentroid.x / centroidLen, y: -toCentroid.y / centroidLen },
      chordUnit,
    );
    if (away) return away;
  }

  // Nothing in the input prefers either side — see the module doc's two-waypoint limitation note.
  // Chosen by an absolute criterion (east, tie-broken north) rather than "left of the chord": the
  // candidate pair {n, -n} is the same whichever end the user tapped first, so an absolute pick is
  // tap-order invariant where a chord-relative one flips (findings A1, Fischland-Darß).
  const left = { x: -chordUnit.y, y: chordUnit.x };
  return left.x > 0 || (left.x === 0 && left.y > 0) ? left : { x: -left.x, y: -left.y };
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
 * last waypoint back toward its first, bulging toward whichever side of the chord the runner's
 * final approach heading points (see `bulgeNormal`) so the return leg encloses area instead of
 * folding back over the outbound path. Callers append these between
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
  const projected = waypoints.map(project);
  const p = projected[projected.length - 1]!; // route's current end — where the arc departs
  const q = projected[0]!; // route's start — where the arc closes
  const chord = { x: q.x - p.x, y: q.y - p.y };
  const chordLenM = Math.hypot(chord.x, chord.y);
  const chordUnit = { x: chord.x / chordLenM, y: chord.y / chordLenM };
  const approach = approachDirection(projected);
  const normal = bulgeNormal(chordUnit, approach, projected);

  const bulgeRatio = opts?.bulgeRatio ?? BULGE_RATIO;
  const bulgeM = Math.min(MAX_BULGE_M, Math.max(MIN_BULGE_M, bulgeRatio * chordM));

  const result: Waypoint[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const arcHeight = bulgeM * Math.sin(Math.PI * t);
    result.push(
      unproject({
        x: p.x + t * chord.x + normal.x * arcHeight,
        y: p.y + t * chord.y + normal.y * arcHeight,
      }),
    );
  }
  return result;
}
