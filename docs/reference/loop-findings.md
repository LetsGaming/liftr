# Loop-generator bug hunt findings

Investigation of `generateLoopWaypoints` (`packages/shared/src/math/loop.ts`) and its
integration in the route wizard (`packages/client/src/components/route-wizard/RouteWizard.vue`).
This is a **findings-only report** — nothing here has been fixed; it exists to guide a follow-up
fix pass.

> **Status:** closed out by `docs/superpowers/plans/2026-09-15-loop-generator-fixes.md`. Every
> finding below carries a resolution line. The report itself is left unedited otherwise — its
> measurements, repro snippets and tables are the evidence the fixes were argued and tested from,
> and several of them are quoted directly in `tests/shared/math/loop.test.ts`. See
> `docs/adr/0008-heading-aware-loop-closure.md` for the algorithm decision.

## Scope and method

Five agents investigated independently and in parallel: two ran realistic user-story scenarios
(a German-city-runner persona and an awkward-geography persona covering coastlines, lakes,
valleys, and high latitudes), one adversarially probed numerical/geometric edge cases, one traced
the `RouteWizard.vue` integration lifecycle, and the coordinating session cross-checked results
and independently re-reproduced the three highest-severity claims before writing this report.
Every finding below was reproduced by actually running code against the real, unmodified source —
either a throwaway `npx tsx` script against `loop.ts` directly, or a traced execution path through
`RouteWizard.vue`'s real current source. No repository files were changed to produce this report.
Finding A6 was added afterward in response to a specific follow-up question and was not part of the
original four-agent sweep — it's included here because it was verified with the same rigor and
turned out to be one of the most significant findings.

For each finding: **Reachable** states whether a real user hits it through the actual UI (the only
production caller, `RouteWizard.vue:93`, always passes real Leaflet-tap coordinates and only ever
sets `opts.maxCount` — never `count` or `bulgeRatio`), or whether it only appears when the function
is called directly with contrived inputs no caller produces today.

---

## A — Pure-function bugs (`packages/shared/src/math/loop.ts`)

### A1. Degenerate-side "coin flip" — wrong or lopsided bulge on ordinary routes

**Severity: high · Reachable: yes, very commonly**

The single most corroborated finding — three agents found the same root cause from three different
angles and all three reproductions agree.

The function picks which side of the chord to bulge toward using `perpDistM < DEGENERATE_SIDE_RATIO
* chordM` (loop.ts:98) — below that threshold (5% of chord length) it gives up on using the route's
own shape and always uses a fixed `leftNormal`, with no regard for which way the route actually
bends or which way is "away from the existing path" (the function's own stated purpose).

Two concrete, reproduced consequences:

- **Ordinary slightly-bent routes flip to the wrong side about half the time.** A 3-waypoint route
  with a small southward bend: at a 95 m offset (still inside the degenerate threshold) the arc
  bulges to the *same* side as the bend; at 105 m (just outside it) the arc bulges to the *opposite*
  side — the geometrically correct behavior. The area enclosed by the resulting loop roughly
  doubles between these two cases (64,822 m² vs. 132,590 m², shoelace-formula measurement) for a
  10 m difference in a mid-route waypoint's position. Reproduced independently by the coordinating
  session:
  ```
  bend 95m (degenerate):     {"lat":52.49849,"lon":13.4075}   — same side as bend
  bend 105m (non-degenerate): {"lat":52.50151,"lon":13.4075}  — opposite side (correct)
  ```
- **The most common wizard usage — a plain 2-waypoint out-and-back — has zero geographic
  awareness.** With exactly 2 waypoints the centroid always sits exactly on the chord, so the
  degenerate branch *always* fires, and the side is decided purely by which point the user tapped
  first. Reproduced on a real Fischland-Darß (Baltic coast) waypoint pair — reversing tap order
  flips the arc from the landward side to the seaward side:
  ```
  forward:  {"lat":54.37004,"lon":12.39496}   (east/seaward)
  reversed: {"lat":54.37086,"lon":12.36694}   (west/landward)
  ```
  Same effect independently reproduced on a Spree riverside route (Berlin) and an Isar riverside
  route (Munich) — tap order alone decides whether the generated return leg lands on open ground or
  across a river with no nearby bridge.

A third, narrower manifestation: the 5%-of-chord threshold is a hard edge, so even in the
*non-degenerate* branch a waypoint move of only ~3 m near the boundary (e.g. 1,499 m vs. 1,501 m
perpendicular offset on a 1 km chord) flips the classification and the output side.

**Why it matters**: this is the core mechanism the whole feature exists to get right — bulge away
from the already-covered path — and for the two most common shapes of user-drawn route (a 2-point
out-and-back, or an ordinary route with a gentle real-world bend) it currently has no reliable way
to do that.

**Repro** (`packages/shared/src/math/loop.ts`):
```ts
import { generateLoopWaypoints } from "@liftr/shared";
const p0 = { lat: 52.5, lon: 13.4 }, p2 = { lat: 52.5, lon: 13.41 };
const southBend = (m: number) => ({ lat: 52.5 - m / 111320, lon: 13.405 });
generateLoopWaypoints([p0, southBend(95), p2]);   // bulges south (wrong side)
generateLoopWaypoints([p0, southBend(105), p2]);  // bulges north (correct side)
```

**Resolution:** Fixed (Phase 1 Tasks 2–3). `DEGENERATE_SIDE_RATIO` deleted; the side comes from the approach heading, falls back to the centroid, then to a tap-order-invariant compass convention. Covered by the bend-continuity sweep and the Fischland tap-order test.

### A2. Antimeridian crossing — silent multi-thousand-km corruption

**Severity: high · Reachable: yes, for routes near ±180° longitude (Fiji, Chukotka, Kiribati, parts of NZ)**

`haversineM` correctly reports a short distance across the ±180° line, but `projector()`
(loop.ts:42-48) does raw `lon * mPerDegLon` linear interpolation with no antimeridian unwrapping.
The result: for two points ~5 km apart straddling the line, the generated arc lands on the
*opposite side of the planet*. Independently reproduced:
```
Taveuni-area (Fiji), chord ≈ 4943 m:
  arc → (-16.822, -89.996), (-16.820, -0.007), (-16.827, 89.981)
```
That's 3,750–5,385 km from where the real return leg should be. The generated points still satisfy
`lat ∈ [-90,90]`, `lon ∈ [-180,180]` — the server's zod validation has no reason to reject them —
so this **saves successfully as silently corrupted data**, not a visible error.

**Reachable**: `closeLoop` defaults to `true` on every new route, and Fiji/Chukotka/Kiribati are
real places people run. Narrower than A1 (needs a route actually near the antimeridian) but more
severe per-incident (garbage data persists silently rather than degrading visually).

**Repro**:
```ts
generateLoopWaypoints([{ lat: -16.841, lon: 179.97 }, { lat: -16.83, lon: -179.985 }]);
```

**Resolution:** Fixed (Task 1). Longitudes unwrapped around the route's start before projecting and wrapped back after; the Taveuni repro is a test.

### A3. `MIN_BULGE_M = 50` fixed floor — disproportionate detour on short loops

**Severity: medium · Reachable: yes, for any loop with a 50–143 m chord (small park loops, track re-use)**

`bulgeM = min(MAX_BULGE_M, max(MIN_BULGE_M, bulgeRatio * chordM))` (loop.ts:104) floors the bulge
at 50 m regardless of how small the chord is. Two agents independently measured the same numbers:

| chord | bulge | bulge as % of chord |
|---|---|---|
| 50.5 m | 50.0 m | 99.0% |
| 60 m | 50.0 m | 83.3% |
| 100 m | 50.0 m | 50.0% |
| 143 m | 50.0 m | 35.0% (ratio crossover point) |

For the smallest loops the app allows (just above the 50 m `MIN_CHORD_M` cutoff), the "return leg"
detour is comparable to or larger than the gap it's closing — easily enough to land outside a small
park or across a street.

**Repro**: any two waypoints 51–150 m apart, default options.

**Resolution:** Fixed (Task 5). The 50 m floor is now `max(10 m, 0.15·chord)`, and for the 2-waypoint case in the repro the excursion is a plain 35% of the chord with no floor involved at all.

### A4. `MAX_BULGE_M = 2000` cap — return leg becomes negligible on long/ultra routes

**Severity: low-medium · Reachable: yes, for any route with a chord over ~5.7 km**

Two agents independently measured matching numbers. The cap engages at exactly `chord =
MAX_BULGE_M / BULGE_RATIO = 5714.3 m`; above that, the detour shrinks as a fraction of the loop:

| chord | bulge | bulge as % of chord |
|---|---|---|
| 5.71 km | 2000 m | 35.0% (cap boundary) |
| 10 km | 2000 m | 20.0% |
| 25 km | 2000 m | 8.0% |
| 40 km (ultra) | 2000 m | 5.0% |
| 100 km | 2000 m | 2.0% |

Not a crash or corruption — likely an intentional safety cap — but it means the stated purpose
("encloses new ground instead of re-covering the outbound path") quietly stops being true well
before the ultra distances this app's running-rank system already models.

**Resolution:** Fixed (Task 5). The flat 2000 m cap grows as a square root past a 5 km knee: 35% of a 40 km chord instead of 5%.

### A5. No terrain/water awareness (design limitation, not a fixable arithmetic bug)

**Severity: informational · Reachable: yes, for lakeside/riverside/valley routes**

The function only knows lat/lon in a flat local plane; it has no concept of "is this walkable."
Two concrete reproductions:
- A Chiemsee (Bavaria) ferry-crossing route: all 3 generated points land in open lake water, ~well
  inside the lake's bounding box.
- A Lauterbrunnen valley (Switzerland) out-and-back: the fixed-side bulge (same mechanism as A1's
  2-waypoint case) pushes generated points up to 1,473 m off the ~800 m–1.2 km-wide valley floor —
  onto the valley wall.

This isn't independently fixable without a terrain/water data source (OSM water polygons, a DEM);
recorded here as a known limitation rather than a bug with a clear code-level fix.

**Resolution:** **Not fixed, by decision.** Documented as an inherent limitation in `loop.ts`'s module header and in ADR-0008's consequences. Needs a terrain/water data source this app does not have; a heuristic guess would be worse than the honest gap.

### A6. No heading continuity — the arc ignores which direction you were already moving

**Severity: high · Reachable: yes, for essentially any multi-waypoint route with an established approach direction**

*(Added after the initial four-agent hunt, in response to a follow-up user question — not part of
the original parallel investigation, but verified with the same rigor.)*

The function's only inputs are `waypoints[0]` (start), `waypoints[length-1]` (end), and the average
of *all* waypoints (centroid) — `loop.ts:69,82-85`. It never reads `waypoints[length-2]`, which is
the only thing that encodes *which direction the user was moving in* when they placed their last
waypoint. Side-selection (A1) and heading-continuity are two separate problems, and the function
only ever solves the first one — so even when A1's logic picks the geometrically "correct" side, the
arc can still demand an unnatural turn relative to how the user was actually approaching that point.

**Structural proof that heading is ignored entirely.** A route approaching a landmark was built with
two different final-approach directions (22° vs. 303° — a 90°+ difference) while holding the exact
same start and end waypoints fixed:
```
New heading approaching the landmark: 303.3°  (was 22.1°)
New heading toward first generated point: 283.1°  (identical, byte-for-byte)
Did the arc's direction change at all? false
```
The generated arc's first point didn't move at all, despite the approach direction changing by over
90°. Confirms the arc has no dependency on approach heading whatsoever — only on the position of
the endpoints and centroid.

**Landmark scenario** (a realistic "run to a landmark, then loop back" route curving toward the
destination): the approach arrives heading 22° (roughly NNE); the first generated point requires a
**99° turn** off that heading — not a smooth continuation, a sharp lateral swing:
```
Heading approaching the landmark:         22.1°
Heading toward the first generated point: 283.1°
Turn required (0=straight ahead, ±180=full reversal): -99.0°
```

**Roundabout scenario** (your second example — waypoints traced partway around a 40 m-radius
roundabout, then "Schleife schließen" checked): whether the generated arc happens to continue the
curve turns out to be geometric coincidence, not design. For a large, nearly-complete sweep the
centroid sits close to the roundabout's true center, so "bulge away from centroid" happens to point
roughly tangent to the circle — but this degrades quickly for smaller, more realistic tapping
patterns:

| how much of the roundabout was traced | turn required from your heading | deviation from "just continue the curve" |
|---|---|---|
| 3/5 (216°), 10 taps | 22° | 2° off |
| 1/2 (180°) | 47° | 11° off |
| 1/3 (120°) | 68° | 44° off |
| 1/4 (90°) | 76° | 58° off |
| 3 taps only (a realistic minimal tapping pattern) | 64° | 44° off |

**Why it matters**: ORS can't route through a roundabout's island or teleport sideways — it has to
find an actual routable path to whatever point the arc places, which on a roundabout or any curved
street very often *is* backtracking (or looping most of the way around again) before it can reach a
point 90-100° off from the direction the user was already heading. This is very likely the concrete
mechanism behind "the loop function just sends me backwards" as a user-facing experience, even
though the raw geometric error is "only" ~90-100° rather than a literal 180° reversal.

**Repro**:
```ts
import { generateLoopWaypoints } from "@liftr/shared";
// Same start+end waypoint, two completely different approach headings —
// the generated arc's first point is identical either way.
const approach1 = [
  { lat: 52.500, lon: 13.400 }, { lat: 52.5005, lon: 13.404 },
  { lat: 52.5012, lon: 13.408 }, { lat: 52.5030, lon: 13.411 }, { lat: 52.5045, lon: 13.412 },
];
const approach2 = [
  { lat: 52.500, lon: 13.400 }, { lat: 52.5008, lon: 13.4125 },
  { lat: 52.5020, lon: 13.4155 }, { lat: 52.5035, lon: 13.4145 }, { lat: 52.5045, lon: 13.412 },
];
generateLoopWaypoints(approach1)[0]; // identical to the line below
generateLoopWaypoints(approach2)[0];
```

**Resolution:** Fixed (Task 3). The return leg is the circular arc tangent to the approach heading; the structural-proof repro is inverted into a test asserting the two approaches now produce *different* arcs, and the roundabout case is completed along the roundabout.

---

## B — Integration bugs (`RouteWizard.vue`)

### B1. Save-before-debounce — checked "Schleife schließen" silently saves a straight line

**Severity: high · Reachable: yes, on a very plausible fast-create flow**

`generateArcIfNeeded()` only runs inside the 400 ms debounced `schedulePreview()` callback
(RouteWizard.vue:153-161, 90-95). `save()` (RouteWizard.vue:204-220) has no dependency on that timer
— it reads `effectiveWaypoints.value` immediately on click. A user who taps two waypoints and hits
"Speichern" within 400 ms (a completely normal "quick loop" flow) saves before the arc has ever
been generated: the route persists as `[A, B, copyOfA]`, a plain straight closing line, despite the
checkbox being checked. Because `hydrateFrom` deliberately never synthesizes a missing arc on
reload, this is **permanent** — reopening the route later shows the box checked but the loop stays
arc-less with no way to fix it except manually unchecking and rechecking.

**Trace**: `RouteWizard.vue:181-184` (`onAdd`) → `schedulePreview()` → 400 ms timer *pending* →
user clicks "Speichern" → `save()` reads `effectiveWaypoints.value` synchronously, arc never ran.

**Resolution:** Fixed (Task 8). `save()` calls `generateArcIfNeeded()` before reading `effectiveWaypoints`.

### B2. Arc silently regenerates after the user deletes it

**Severity: medium-high · Reachable: yes, whenever a user dislikes the generated arc and removes it**

`generateArcIfNeeded`'s guard is `waypoints.value.some(w => w.gen)` (RouteWizard.vue:91) — it only
skips generating when *any* `gen` point still exists. A user who removes the generated arc points
one at a time (via "Letzten Punkt entfernen" or tap-to-remove), pausing between each so the 400 ms
debounce settles, finds that the moment the *last* `gen` point is removed, the guard condition
flips and a brand-new 3-point arc is generated right back — the user's deletions are silently
undone about 400 ms after they finish. This directly contradicts the code's own doc comment ("gen
points, once present, are never regenerated").

**Trace**: `onRemove` (RouteWizard.vue:189-192) → `schedulePreview()` → `generateArcIfNeeded()`
(90-95) — guard passes once no `gen` point remains, closeLoop is still true.

**Resolution:** Fixed (Task 9). A new `arcDismissed` flag distinguishes "no arc yet" from "the user threw the arc away"; cleared only by hydration or by ticking the toggle again.

### B3. Arc lands mid-list after a pause-then-continue tapping pattern

**Severity: medium · Reachable: yes, for a common "tap, pause, tap more" pattern**

`onAdd` (RouteWizard.vue:181-184) always appends to the end of the array. If a user taps some
waypoints, pauses long enough for the arc to generate, then taps more waypoints, the new points land
*after* the already-generated `gen` block — because `generateArcIfNeeded`'s guard sees the existing
`gen` points and no-ops for the rest of the session. Result: the waypoint order becomes
`[user, user, gen, gen, gen, user, user]`, so the route visits the generated arc, jumps back out to
the newer taps, then closes — a visibly wrong zigzag rather than a clean loop, saved without error.

**Resolution:** Fixed (Task 10). `onAdd` strips and rebuilds the trailing arc, or inserts after the last user point when the arc was dismissed.

### B4. 50-waypoint cap: silent degradation, then a misleading generic error

**Severity: medium · Reachable: yes, for long/detailed routes**

Nothing in `RouteMapEditor.vue` or `canSave` (RouteWizard.vue:73) caps how many waypoints a user can
tap. `generateArcIfNeeded`'s `maxCount = max(0, 50 - 1 - waypoints.length)` correctly shrinks the
generated arc as the user approaches the cap — but with no messaging, so between ~46 and 49
waypoints the loop's return-leg bulge silently gets thinner and eventually disappears while the
checkbox stays checked. At exactly 50 user-placed waypoints, `effectiveWaypoints` totals 51 (50 +
the synthetic closing point), which exceeds the server's `waypointsSchema.max(50)` and the whole
save is rejected with a 400. The client's catch-all error handler (RouteWizard.vue:215-217) discards
the server's actual validation detail and shows a generic "Speichern fehlgeschlagen — bitte erneut
versuchen." — advice that is actively wrong here, since retrying with the same waypoints fails
identically every time.

**Resolution:** Fixed (Task 11). A 46-waypoint client cap with a German toast and a footer counter, plus a status-aware save error that stops telling the user to retry something that cannot succeed.

---

## C — Robustness gaps (real, but currently unreachable from the UI)

These are genuine defects in `generateLoopWaypoints` itself, confirmed by direct function calls, but
the only production caller never supplies the inputs that trigger them, and where they'd matter the
server's `lat/lon` and array-length validation contains the damage. Worth fixing for defense-in-depth,
not urgent.

- **NaN/Infinity propagate silently.** `NaN < MIN_CHORD_M` is `false` in JS, so the early-return guard
  doesn't catch a NaN chord; every output point comes back `{lat: NaN, lon: NaN}`. No caller passes
  NaN today; Leaflet always emits real numbers.
- **Fractional `count` produces an asymmetric arc.** `count: 2.5` runs the loop for `i=1,2` with
  `t = i/3.5`, giving a ~25% height difference between what should be a matched pair of points. Only
  reachable by calling the function directly with a non-integer `count` — the only caller always
  passes an integer `maxCount` and never sets `count`.
- **`bulgeRatio` edge values surprise.** `0`, any negative value, and `-Infinity` all produce the
  *same* output (floored to `MIN_BULGE_M = 50 m`) — `bulgeRatio: 0` does not mean "no bulge," which
  may surprise a future caller. Never reachable today (only `maxCount` is passed).
- **Polar-latitude longitude blowup.** Only within roughly 0.001–0.01° of the true geographic poles
  does `mPerDegLon → 0` cause `unproject`'s output longitude to exceed valid WGS84 range (confirmed
  up to `lon = -198°`). Realistic high-latitude towns (Svalbard 78°N, Alert 82.5°N) show no
  distortion at all — no real running route exists near enough to the pole to trigger this.
- **Dimensional-analysis bias in the degenerate-side calculation.** `cross` (loop.ts:89) is computed
  in projected-plane m², but divided by `chordM` (the great-circle haversine distance) rather than
  the dimensionally-matched projected chord length — measured bias up to 0.12% at 80°N with
  unrealistically wide (10°) waypoint spacing; negligible (<0.001%) at realistic route scales. This
  compounds A1's degenerate-threshold sensitivity slightly but isn't independently significant.
- **No upper sanity cap on `count` independent of `maxCount`.** `count: 1_000_000` with no
  `maxCount` allocates a million points in ~70 ms — not a meaningful DoS, and unreachable since the
  only caller always supplies `maxCount`.

**Resolution:** Fixed (Task 6) for NaN/Infinity, fractional/negative `count`, `bulgeRatio` edge values and the missing upper `count` cap. The dimensional-analysis bias and the polar blowup were **subsumed** by Phase 1: the side decision no longer mixes projected-plane and great-circle quantities, and `unproject` now floors metres-per-degree-of-longitude and clamps its output.

---

## D — Investigated and confirmed NOT bugs

Recorded so a future investigation doesn't re-tread this ground.

- **Hydration float-equality** (`RouteWizard.vue`'s `hydrateFrom` comparing first/last waypoint with
  exact `===`): safe in practice — the synthetic closing point is always an exact object-spread copy
  of the first waypoint, never independently recomputed or re-projected, and the server round-trips
  waypoints through plain JSON with no lossy math in between.
- **Toggle "Schleife schließen" off then back on**: `generateLoopWaypoints` is pure/deterministic (no
  `Math.random`), and `setCloseLoop` runs synchronously rather than through the debounced path, so
  rapid toggling can't race a pending timer.
- **High-latitude equirectangular drift**: measured under 100 m even at 70°N for any realistic loop
  length (≤40 km) — dwarfed by findings A3/A4 and within GPS/road-snapping noise. Only reaches
  hundreds of meters at a 100 km chord, which is already degenerate territory per A4.
- **Equator crossing and southern-hemisphere sign**: no discontinuity or sign flip found at lat=0,
  or across -33°/-50°/-70°.
- **Ring-path continuation and self-crossing**: simulated both directions around a Tempelhofer-Feld-
  style ring path — the arc correctly stays outside the ring radius; no literal path self-intersection
  detected on any doubling-back or zigzag route tested.
- **Duplicate/identical waypoints**: chord correctly evaluates to 0, early-return `[]` fires as
  designed.

**Resolution:** Unchanged; still not bugs. `tests/shared/math/loop.test.ts` now pins the determinism and duplicate-waypoint cases D depends on. Note the one D item the redesign *does* invalidate: "no literal path self-intersection detected" no longer holds, because a return leg sweeping past 180° is a lollipop — see ADR-0008.

---

## Findings ranked by (severity × real-world reachability)

1. **A1** — degenerate-side coin flip (wrong/lopsided bulge on ordinary bent routes and every plain
   2-waypoint out-and-back)
2. **A6** — no heading continuity (arc ignores the direction you were already moving; structurally
   proven to be independent of approach direction, likely the real mechanism behind "it just sends
   me backwards")
3. **B1** — save-before-debounce silently persists a straight line despite the checked loop box
4. **A2** — antimeridian crossing silently corrupts saved data by thousands of km
5. **B2** — deleted arc silently regenerates ~400 ms later
6. **A3** — `MIN_BULGE_M` floor disproportionate on short (50–150 m) loops
7. **B4** — 50-waypoint cap: silent degradation then a misleading generic save error
8. **B3** — pause-then-continue tapping produces a mid-list arc / zigzag route
9. **A4** — `MAX_BULGE_M` cap makes the return leg negligible past ~5.7 km chord
10. **A5** — no terrain/water awareness (Chiemsee, Alpine valley) — design limitation
11. **C** (all) — robustness gaps, real but currently unreachable through the UI
