/**
 * Buffers an already-travelled path into a set of rectangles a router can be told to avoid, so a
 * loop's return leg is forced to find different streets instead of retracing the ones just
 * walked. Used by the server's planned-route geometry service to build OpenRouteService's
 * `options.avoid_polygons` for a closed loop's closing leg (see plannedRouteService.ts).
 *
 * Unlike loop.ts this does not guess where the route should go — it only says where it should
 * not, and leaves finding a real street entirely to the router. Consumes and emits {lat, lon}, the
 * same order as everything else in this codebase; the `[lon, lat]` swap GeoJSON and ORS want stays
 * quarantined to openRouteService.ts, the one place allowed to know about it.
 *
 * Works in the same local metric plane as loop.ts — see ./localPlane.ts.
 */
import { isFiniteWaypoint, projector, type Point2, type Waypoint } from "./localPlane.js";

/** A closed ring (first point repeated as last), in {lat, lon} order. One ring per surviving path
 *  segment — the caller (openRouteService.ts) treats each as its own polygon rather than this
 *  module attempting to union overlapping rectangles into one clean shape, which buys nothing: a
 *  router excludes graph edges inside ANY of a MultiPolygon's parts regardless of overlap. */
export type CorridorRing = Waypoint[];

/** Total corridor width. Half of it (15 m) is one carriageway plus verges in a European town:
 *  wide enough that the router can't "avoid" the outbound street by taking its opposite sidewalk
 *  — which is the same street and the exact complaint this exists to fix — and narrow enough that
 *  the next parallel street in a 60-120 m city block stays available. Widening this does not make
 *  loops better, it makes them impossible: every metre of width is graph edges deleted, and past
 *  ~40 m the retry-without-avoidance path becomes the normal path. */
const DEFAULT_WIDTH_M = 30;

/** Length of outbound path left UNAVOIDED at each end. The closing leg starts and ends on the
 *  outbound path's own endpoints; a router deletes avoided edges before snapping, so a start point
 *  whose only nearby edges are deleted comes back as "point not routable" rather than as a
 *  detour. ~120 m is roughly one short block of slack — enough to attach to, small enough that the
 *  bulk of the walked route stays excluded. */
const DEFAULT_TRIM_ENDS_M = 120;

/** Below this a "segment" is duplicate geometry, not a direction — buffering it would produce a
 *  zero-area rectangle with a degenerate (NaN) normal. */
const MIN_SEGMENT_M = 0.5;

/** ponytail: fixed-stride decimation, upgrade to Douglas-Peucker if corridors get visibly lumpy.
 *  A 10 km ORS geometry is 1000+ points, and shipping one rectangle per point would mean 1000
 *  polygons in the request body and 1000 polygon checks in the router's graph prune. Decimating to
 *  at most this many segments cuts corners slightly (the rectangle chords the real bend), which
 *  errs toward avoiding MORE ground than the walked path, not less — the safe direction to be
 *  wrong in. */
const MAX_SEGMENTS = 200;

interface ProjectedPoint {
  cumLenM: number;
  pt: Point2;
}

/** Cumulative-length walk of a projected polyline, used by both end-trimming passes below —
 *  avoids computing segment lengths twice. */
function withCumulativeLength(pts: Point2[]): ProjectedPoint[] {
  const out: ProjectedPoint[] = [{ cumLenM: 0, pt: pts[0]! }];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    out.push({ cumLenM: out[i - 1]!.cumLenM + segLen, pt: cur });
  }
  return out;
}

/** Drops the first/last `trimM` metres of a cumulative-length polyline, interpolating the exact
 *  cut point rather than snapping to the nearest existing vertex — so a handful of widely-spaced
 *  waypoints still gets a precise trim instead of one lumpy segment either chopped entirely or not
 *  trimmed at all. Returns `null` when trimming both ends leaves nothing (the path is shorter than
 *  `2 * trimM`) — a loop that small has no meaningful "already walked this" corridor to build. */
function trimEnds(withLen: ProjectedPoint[], trimM: number): Point2[] | null {
  const totalLenM = withLen[withLen.length - 1]!.cumLenM;
  if (totalLenM <= 2 * trimM) return null;

  function cutAt(targetLenM: number): Point2 {
    for (let i = 1; i < withLen.length; i++) {
      if (withLen[i]!.cumLenM >= targetLenM) {
        const a = withLen[i - 1]!;
        const b = withLen[i]!;
        const span = b.cumLenM - a.cumLenM;
        const t = span > 0 ? (targetLenM - a.cumLenM) / span : 0;
        return { x: a.pt.x + (b.pt.x - a.pt.x) * t, y: a.pt.y + (b.pt.y - a.pt.y) * t };
      }
    }
    return withLen[withLen.length - 1]!.pt;
  }

  const startCut = cutAt(trimM);
  const endCut = cutAt(totalLenM - trimM);
  const interior = withLen.filter((p) => p.cumLenM > trimM && p.cumLenM < totalLenM - trimM).map((p) => p.pt);
  return [startCut, ...interior, endCut];
}

/** Keeps at most `maxSegments + 1` points via fixed-stride sampling, always keeping the last
 *  point so the trimmed end isn't silently dropped. */
function decimate(pts: Point2[], maxSegments: number): Point2[] {
  const stride = Math.ceil((pts.length - 1) / maxSegments);
  if (stride <= 1) return pts;
  const out: Point2[] = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]!);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]!);
  return out;
}

/**
 * Buffers `path` into a set of rectangular avoid-polygons, one per surviving segment after
 * end-trimming and decimation. Pure and deterministic; never mutates its input.
 *
 * Returns `null` — never `[]` — when there's nothing sensible to build: fewer than 2 waypoints,
 * any non-finite or out-of-WGS84-range coordinate, or a path shorter than `2 * trimEndsM` once
 * both ends are trimmed. Callers branch on `null` directly rather than checking array length.
 *
 * @param opts.widthM     Total corridor width in metres, centered on the path. Defaults to
 *                         `DEFAULT_WIDTH_M`.
 * @param opts.trimEndsM  Length left unavoided at each end of `path`, in metres. Defaults to
 *                         `DEFAULT_TRIM_ENDS_M`.
 */
export function buildAvoidCorridor(
  path: Waypoint[],
  opts?: { widthM?: number; trimEndsM?: number },
): CorridorRing[] | null {
  if (path.length < 2) return null;
  if (!path.every(isFiniteWaypoint)) return null;

  const widthM = opts?.widthM != null && Number.isFinite(opts.widthM) && opts.widthM > 0 ? opts.widthM : DEFAULT_WIDTH_M;
  const trimEndsM =
    opts?.trimEndsM != null && Number.isFinite(opts.trimEndsM) && opts.trimEndsM >= 0
      ? opts.trimEndsM
      : DEFAULT_TRIM_ENDS_M;

  // Unwrap relative to the path's own start — same convention as loop.ts, always within ±180° of
  // every other point on a path short enough to run.
  const refLon = path[0]!.lon;
  const lat0 = (path[0]!.lat + path[path.length - 1]!.lat) / 2;
  const { project, unproject } = projector(lat0, refLon);
  const projected = path.map(project);

  const trimmed = trimEnds(withCumulativeLength(projected), trimEndsM);
  if (!trimmed || trimmed.length < 2) return null;

  const decimated = decimate(trimmed, MAX_SEGMENTS);

  const halfWidth = widthM / 2;
  const rings: CorridorRing[] = [];
  for (let i = 1; i < decimated.length; i++) {
    const p = decimated[i - 1]!;
    const q = decimated[i]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < MIN_SEGMENT_M) continue;

    // Left-hand normal, scaled to half the corridor width — consistent winding isn't required by
    // the router (each ring is its own independent polygon), just a deterministic choice.
    const nx = (-(q.y - p.y) / len) * halfWidth;
    const ny = ((q.x - p.x) / len) * halfWidth;
    const corners: Point2[] = [
      { x: p.x + nx, y: p.y + ny },
      { x: q.x + nx, y: q.y + ny },
      { x: q.x - nx, y: q.y - ny },
      { x: p.x - nx, y: p.y - ny },
    ];
    const ring = [...corners, corners[0]!].map(unproject);

    // A rectangle a few dozen metres wide can only straddle the antimeridian if the path itself
    // sits on the line — dropping that one ring rather than shipping a wrapped-around-the-planet
    // polygon costs nothing out of up to 200 rings (same class of bug loop.ts's own antimeridian
    // handling exists for — see localPlane.ts).
    const lons = ring.map((r) => r.lon);
    if (Math.max(...lons) - Math.min(...lons) > 1) continue;

    rings.push(ring);
  }

  return rings.length > 0 ? rings : null;
}
