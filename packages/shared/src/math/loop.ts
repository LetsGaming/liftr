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
/** Excursion floor, as a fraction of the chord. Scale-free by design: a fixed metre floor is a
 *  99%-of-chord detour on a 50 m loop (findings A3). */
const MIN_BULGE_RATIO = 0.15;
/** ...with a small absolute term so the very shortest loops the app allows still get a detour
 *  bigger than road-snapping noise. Only binds below a ~67 m chord, where it is still under 20%
 *  of it. */
const MIN_BULGE_ABS_M = 10;
/** Excursion ceiling, as a fraction of the chord below the knee. 1.0 is a 126.9° tangent–chord
 *  angle: enough to honour any realistic curved-street or roundabout continuation (a third-traced
 *  roundabout needs 120°), while bounding a straight out-and-back's return leg to ~2.8× the chord
 *  instead of letting tan(φ/2) run away as the heading approaches "directly away from home". */
const MAX_BULGE_RATIO = 1.0;
/** Chord length past which the ceiling grows as a square root rather than linearly. The old hard
 *  2000 m cap stopped growing entirely at 5.7 km and was 2% of a 100 km chord (findings A4). */
const BULGE_KNEE_CHORD_M = 5000;
/** Excursion as a fraction of the chord for the no-heading-signal case only — a 2-waypoint
 *  out-and-back, or an approach that runs exactly along the chord. When a heading IS available the
 *  excursion is derived from it instead (see approachBulgeM), and this value does not apply.
 *  `opts.bulgeRatio` overrides exactly this number and nothing else. */
const DEFAULT_BULGE_RATIO = 0.35;
const DEFAULT_COUNT = 3;
/** Upper bound on generated points regardless of what the caller asks for: the server's waypoint
 *  array holds 50, and two of those are the real endpoints of the chord being bridged. Independent
 *  of `maxCount`, which the one production caller always supplies but a future one might not
 *  (findings C). */
const MAX_GENERATED_COUNT = 48;

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

/**
 * How far off the chord the return leg has to swing in order to leave the final waypoint along the
 * runner's current heading and still curve back to the start.
 *
 * There is exactly one circle through P (the route's end) and Q (its start) that departs P along a
 * given heading. Its tangent–chord angle φ is the angle between that heading and the chord, and its
 * greatest distance from the chord is (chord/2)·tan(φ/2): zero when the runner is already heading
 * straight home, a clean semicircle when the start is 90° off their shoulder, and unbounded as they
 * head directly away from it. The caller clamps the unbounded end.
 *
 * With no heading signal there is nothing to derive it from, so the documented default ratio stands
 * in — see bulgeNormal and the module doc for why that case exists and why it can't be solved.
 */
function approachBulgeM(
  approach: Point2 | null,
  chordUnit: Point2,
  chordLenM: number,
  bulgeRatio: number,
): number {
  if (!approach) return bulgeRatio * chordLenM;
  const along = Math.min(1, Math.max(-1, approach.x * chordUnit.x + approach.y * chordUnit.y));
  const phi = Math.acos(along);
  if (!(phi > 0) || phi >= Math.PI) return bulgeRatio * chordLenM;
  return (chordLenM / 2) * Math.tan(phi / 2);
}

/** Holds the heading-derived excursion inside a band that stays proportionate at both ends of the
 *  scale this app actually sees — a 50 m park loop and a 40 km ultra. Below the knee the ceiling is
 *  a plain ratio of the chord; above it, growth continues as a square root (bounded, sublinear,
 *  still a visible fraction of the loop). The floor is clamped to the ceiling rather than the other
 *  way round, so the two can't cross on an absurdly long chord. */
function clampBulgeM(rawM: number, chordLenM: number): number {
  const cap = MAX_BULGE_RATIO * Math.sqrt(chordLenM * Math.min(chordLenM, BULGE_KNEE_CHORD_M));
  const floor = Math.min(cap, Math.max(MIN_BULGE_ABS_M, MIN_BULGE_RATIO * chordLenM));
  return Math.min(cap, Math.max(floor, rawM));
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

/** The server's waypoint schema is the contract on both ends of this function: it will not accept
 *  an out-of-range or non-finite coordinate on the way in, and must never be handed one on the way
 *  out. Rejecting the whole call is the right failure mode — a partial arc derived from one garbage
 *  waypoint is worse than no arc (findings C: `NaN < MIN_CHORD_M` is false, so the chord guard
 *  below never caught this and every output point came back NaN). */
function isFiniteWaypoint(w: Waypoint): boolean {
  return (
    Number.isFinite(w.lat) && Number.isFinite(w.lon) && Math.abs(w.lat) <= 90 && Math.abs(w.lon) <= 180
  );
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
  if (!waypoints.every(isFiniteWaypoint)) return [];

  const requested = Math.floor(opts?.count ?? DEFAULT_COUNT);
  const allowed = Math.floor(opts?.maxCount ?? MAX_GENERATED_COUNT);
  const count = Math.max(0, Math.min(requested, allowed, MAX_GENERATED_COUNT));
  if (count === 0) return [];

  const start = waypoints[0]!;
  const end = waypoints[waypoints.length - 1]!;
  const chordM = haversineM(end, start);
  // Inverted rather than `chordM < MIN_CHORD_M` so a NaN chord fails the guard instead of passing
  // it — belt and braces behind isFiniteWaypoint above.
  if (!(chordM >= MIN_CHORD_M)) return [];

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

  // An explicit 0 means no bulge at all — points interpolated straight along the chord — rather
  // than silently becoming the floor as it used to. Anything non-finite or negative is not a
  // meaningful ratio and falls back to the default instead of producing a mirrored or NaN arc.
  const bulgeRatio =
    opts?.bulgeRatio != null && Number.isFinite(opts.bulgeRatio) && opts.bulgeRatio >= 0
      ? opts.bulgeRatio
      : DEFAULT_BULGE_RATIO;

  if (bulgeRatio === 0) {
    const flat: Waypoint[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      flat.push(unproject({ x: p.x + chord.x * t, y: p.y + chord.y * t }));
    }
    return flat;
  }

  const rawBulgeM = approachBulgeM(approach, chordUnit, chordLenM, bulgeRatio);
  const bulgeM = clampBulgeM(rawBulgeM, chordLenM);

  // Lay the points on the circle through P and Q whose greatest distance from the chord is
  // `bulgeM` on the `normal` side — the unique circular return leg with that excursion. When
  // `bulgeM` wasn't clamped, that is exactly the circle tangent to the approach heading at P, so
  // the first thing the route asks of the runner is to keep going rather than to swing sideways
  // (findings A6). `phi` is the tangent–chord angle the clamp actually left us with; the arc
  // sweeps 2·phi, which exceeds 180° — a teardrop rather than a lens — whenever the start is
  // behind the runner, which is precisely when a lens would have been a fold-back.
  const phi = 2 * Math.atan((2 * bulgeM) / chordLenM);
  const radius = chordLenM / (2 * Math.sin(phi));
  const center = {
    x: (p.x + q.x) / 2 - normal.x * (radius - bulgeM),
    y: (p.y + q.y) / 2 - normal.y * (radius - bulgeM),
  };
  const startAngle = Math.atan2(p.y - center.y, p.x - center.x);
  // Which way round the circle: the sense that leaves P toward `normal`. `normal` is perpendicular
  // to the chord by construction, so this cross product is ±chordLenM and never zero.
  const sense = normal.x * chord.y - normal.y * chord.x >= 0 ? 1 : -1;
  const sweep = sense * 2 * phi;

  const result: Waypoint[] = [];
  for (let i = 1; i <= count; i++) {
    const angle = startAngle + sweep * (i / (count + 1));
    result.push(
      unproject({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }),
    );
  }
  return result;
}
