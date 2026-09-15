/**
 * Local metric plane used by loop.ts (and corridor.ts) instead of arithmetic directly in lat/lon
 * degrees, since a degree of longitude shrinks with latitude — arithmetic in raw degrees would
 * scale east-west shapes wrong as you move away from the equator. This is an equirectangular
 * approximation centered on whatever reference point the caller supplies (e.g. the midpoint of
 * the chord a loop bridges, or a corridor's own path) — good over the short distances a running
 * route spans, not a general-purpose projection.
 *
 * Longitudes must be unwrapped around a caller-chosen reference point before projecting and
 * wrapped back afterwards, so a route across the ±180° line stays next to itself instead of
 * jumping to the opposite side of the planet. The projection is only ever used internally by its
 * callers; every public lat/lon in and out of them is a real WGS84 coordinate.
 */

export interface Waypoint {
  lat: number;
  lon: number;
}

export interface Point2 {
  x: number;
  y: number;
}

export const EARTH_RADIUS_M = 6_371_000;
export const M_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

/** cos(lat) → 0 at the poles, so metres-per-degree-of-longitude → 0 and `unproject` ends up
 *  dividing by nearly nothing, throwing the output longitude far outside ±180° (loop.ts findings
 *  C — confirmed up to lon = -198°). No running route gets within a kilometre of a pole, so this
 *  floor never engages in practice; it costs one Math.max and converts an impossible-to-debug
 *  garbage coordinate into a merely-distorted one. */
const MIN_M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((89.9 * Math.PI) / 180);

/** Longitude is discontinuous at ±180°: 179.99 and -179.99 are 2 km apart on the ground but
 *  359.98 degrees apart numerically, and the local-plane projection below is plain linear
 *  arithmetic with no way to know that. Unwrapping every longitude into one continuous run around
 *  a single reference point before projecting — and wrapping the result back afterwards — is what
 *  keeps a shape that crosses the antimeridian next to the route instead of on the opposite side
 *  of the planet (loop.ts findings A2, which saved as silently corrupted data because the
 *  wrong-side points still satisfied the server's lat/lon bounds). */
export function unwrapLon(lon: number, refLon: number): number {
  return lon - 360 * Math.round((lon - refLon) / 360);
}

export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function projector(lat0: number, refLon: number) {
  const mPerDegLon = Math.max(MIN_M_PER_DEG_LON, M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180));
  return {
    project: (p: Waypoint): Point2 => ({
      x: unwrapLon(p.lon, refLon) * mPerDegLon,
      y: p.lat * M_PER_DEG_LAT,
    }),
    /** Every public coordinate a caller returns should pass through here, which makes it the one
     *  place that can guarantee the WGS84 contract the server's zod schema enforces. Clamping and
     *  wrapping rather than throwing: a slightly-clamped point is a draggable annoyance, a
     *  rejected save is a dead end for the user. */
    unproject: (p: Point2): Waypoint => ({
      lat: Math.min(90, Math.max(-90, p.y / M_PER_DEG_LAT)),
      lon: wrapLon(p.x / mPerDegLon),
    }),
  };
}

/** The server's waypoint schema is the contract on both ends of any function built on this plane:
 *  it will not accept an out-of-range or non-finite coordinate on the way in, and must never be
 *  handed one on the way out. Rejecting the whole call is the right failure mode — a partial
 *  result derived from one garbage waypoint is worse than no result (loop.ts findings C: `NaN <
 *  MIN_CHORD_M` is false, so a naive chord guard never caught this and every output point came
 *  back NaN). */
export function isFiniteWaypoint(w: Waypoint): boolean {
  return (
    Number.isFinite(w.lat) && Number.isFinite(w.lon) && Math.abs(w.lat) <= 90 && Math.abs(w.lon) <= 180
  );
}
