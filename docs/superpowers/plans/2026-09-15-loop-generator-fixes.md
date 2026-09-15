# Loop-generator fixes — phased implementation workplan

## Context

`docs/reference/loop-findings.md` is the output of an earlier bug-hunt session: five
agents (plus follow-up work) investigated `generateLoopWaypoints`
(`packages/shared/src/math/loop.ts`) — the function behind the running-route wizard's
"Schleife schließen" (close the loop) toggle — and its integration in
`packages/client/src/components/route-wizard/RouteWizard.vue`. That report is
findings-only; nothing was fixed. It documents 6 pure-function bugs (A1–A6), 4
integration bugs (B1–B4), a set of lower-priority robustness gaps (C), and confirmed
non-bugs (D) — every one reproduced with runnable code, not guessed.

This plan closes that report out. Scope and approach were confirmed directly with the
user before drafting:

- **Comprehensive scope** — every finding (A1–A6, B1–B4, C) gets addressed; A5 (no
  terrain/water awareness) is explicitly *not* independently fixable without a terrain
  data source this app doesn't have, so it becomes a documentation task, not a fake fix.
- **Redesign, not patch, for the shared root cause of A1 and A6.** Both trace back to
  the same defect: the function never reads `waypoints[length-2]`, so it has no notion
  of which direction the runner was already moving, and its side-selection is a hard
  5%-of-chord threshold that either trusts a noisy centroid vote or falls back to an
  arbitrary fixed side. The fix replaces both the side-selection *and* the arc shape
  with a single geometric construction driven by the runner's actual heading (detailed
  in Phase 1 below), rather than patching each symptom separately.
- **Commit a persistent plan doc.** This repo has an established convention for
  exactly this kind of document — `docs/superpowers/plans/2026-09-08-planned-routes.md`
  — and this plan follows that format precisely (flat-numbered `### Task N` sections
  with `Files`/`Interfaces`/checkbox `Steps`, grouped here under named `## Phase N`
  headings since the phased structure was explicitly requested).

The plan below was drafted by a dedicated Plan agent with the full findings report,
the exact current source of both files, `haversineM`'s implementation, the server's
waypoint zod schema, and the repo's ADR/plan-doc conventions as input. It was then
reviewed and independently checked: the core geometry (tangent–chord angle, sagitta
formula `E = (L/2)·tan(φ/2)`, radius `r = L/(2·sin φ)`, and the arc-center placement)
was re-derived from first principles and checks out. Two things were added on review,
folded into the tasks below: **(1)** the new `RouteWizard.vue` tests the plan writes
assume specific CSS selectors (`input.name-input`, `.loop-toggle input`,
`button.btn-primary`) that neither exploration pass actually confirmed against the
live template — only the script block was quoted verbatim — so Task 7 now includes an
explicit "confirm/adjust selectors against the real template" step before those tests
are trusted. **(2)** This plan document was saved directly to this repo path as part
of finalizing the plan, rather than deferred to a first execution task.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Schleife schließen" produce a return leg a runner would actually run —
one that continues the direction they were already moving, bulges to a side chosen
from real evidence instead of a coin flip, stays proportionate at both 50 m and 40 km,
survives the antimeridian, and actually gets saved when the box is checked — and cover
the whole thing with tests, including the first tests `RouteWizard.vue` has ever had.

**Architecture:** `generateLoopWaypoints` keeps its exact public signature (one
production caller, `RouteWizard.vue:93`, which only ever passes `maxCount`) but its
interior is replaced: the sine-bulge-on-a-chord with a centroid-sign side vote becomes
a **tangent-continuous circular arc** — the circle through the route's end and start
whose departure direction at the end matches the runner's last real segment, with its
excursion clamped into a scale-proportionate band. The projection layer gains
antimeridian unwrapping and a WGS84 output safety net. `RouteWizard.vue` gains an
explicit arc lifecycle (`arcDismissed`), a save-time arc flush, trailing-arc
regeneration on late taps, a client-side waypoint cap, and a save error handler that
distinguishes a 400 from a transient failure.

**Tech Stack:** TypeScript (`packages/shared`, pure functions, no dependencies beyond
`haversineM`), Vue 3 + Pinia (`packages/client`), Vitest (root-level, `tests/` mirrors
`packages/`). No DB, no server, no new dependencies.

**Spec:** `docs/reference/loop-findings.md` — every finding it lists is addressed by
exactly one task below, or explicitly recorded as not-independently-fixable. Read it
in full before starting; its repro snippets, severity notes, and measurement tables
are the source of the test scenarios quoted here.

## Global Constraints

- **The public API of `generateLoopWaypoints` does not change.**
  `generateLoopWaypoints(waypoints: Waypoint[], opts?: { count?: number; bulgeRatio?:
  number; maxCount?: number }): Waypoint[]` and the `Waypoint` interface stay exactly
  as they are, still exported from `@liftr/shared` via `packages/shared/src/index.ts`'s
  existing `export * from "./math/loop.js"`. There is exactly one production caller
  and it only ever passes `maxCount`; a signature break would buy nothing. Internal
  helpers stay module-private and are tested through the public function — do not
  export them "for testability".
- **The server's waypoint contract is a hard boundary, not a suggestion.**
  `packages/server/src/routes/plannedRoutes.ts`'s `waypointsSchema` is
  `z.array({lat: [-90,90], lon: [-180,180], gen?: boolean}).min(2).max(50)`. The
  generator must never emit a coordinate outside those lat/lon ranges (findings A2/C),
  and the client must never post an array longer than 50 (finding B4). Both are
  enforced in this plan, in both places.
- **German UI copy**, inline in the `.vue` file — no i18n convention exists for this
  component to follow. Existing vocabulary to stay consistent with: "Strecke",
  "Wegpunkt(e)", "Schleife schließen", "Speichern". New copy in this plan is specified
  verbatim; don't improvise translations.
- **Never splat the server's raw error text into a toast.** Fastify's error handler
  (`packages/server/src/app.ts:55-58`) returns `{ error: "invalid_request", detail:
  <Zod's English message> }`. The detail is diagnostic, not user copy — surface a
  German message chosen by status, and log the detail.
- `pnpm typecheck && pnpm lint && pnpm test` must be clean before any task is
  considered done. Test-file typechecking is real here: `pnpm typecheck:tests`
  type-checks `tests/shared` under `packages/shared/tsconfig.test.json` and
  `tests/client` under `packages/client/tsconfig.test.json`.
- Vitest runs from the repo root (root `package.json`'s `"test": "vitest run"`, root
  `vitest.config.ts` with `include: ["tests/**/*.{test,spec}.ts"]`). Single-file runs
  in this plan use `pnpm vitest run <path>` from the repo root.
- **`lib` is `ES2022`** (`tsconfig.base.json`). `Array.prototype.findLastIndex` is
  ES2023 and will not typecheck — use a reverse loop or `reduce` where this plan says
  so.
- **Every task touching `packages/client/src` must pass the `mobile-viewport-check`
  skill** before being reported done (per this repo's `CLAUDE.md` — Liftr is used
  primarily on mobile). That's Tasks 8–11 and Task 15.
- **Manual verification uses isolated dev sessions only**: `node scripts/dev-up.mjs
  --id <name>` … `node scripts/dev-down.mjs --id <name>`. Never bare `pnpm dev`, never
  another session's id or ports. Note the known gap in `CLAUDE.md`: the seeded DB has
  no owner password, so the dashboard opens on the first-run setup screen — set one
  once per session to reach seeded data.
- **Never hand-edit `packages/db/drizzle/`.** This plan contains no schema change, no
  `pnpm db:generate`, and no `pnpm db:migrate` — if a task seems to need one, that's a
  sign the task drifted from the plan; stop and report instead.
- **Never `git add -A` / `git add .`** — the working tree may have unrelated
  uncommitted changes at any point; stage only the exact paths each task's commit
  block lists.
- `docs/reference/loop-findings.md` is currently **untracked**. Task 14 is the task
  that commits it, together with its resolution markers. Don't commit it earlier.
- Findings in section **D** of the report were investigated and confirmed *not* bugs.
  Do not "fix" them. If a change in this plan appears to affect one (notably D's
  hydration float-equality and the toggle-off-then-on path), that's a regression to
  stop on, not an improvement. **One exception, already known and accepted:** D's "no
  literal path self-intersection" no longer holds after Phase 1 — a return leg
  sweeping past 180° is a lollipop shape and lollipops cross themselves at the stem.
  This is documented as a deliberate consequence in Task 3 and ADR-0008, not treated
  as a regression.
- **Template selectors used in the new `RouteWizard.vue` tests (Task 7 onward) are
  best-guess, not confirmed.** Neither exploration pass that fed this plan quoted the
  component's literal template markup (only its script block, verbatim). Task 7's
  first step now includes reading the real template and adjusting
  `input.name-input` / `.loop-toggle input` / `button.btn-primary` (and any other
  selector used in Tasks 7–11) to match what's actually there before trusting any test
  built on them.

---

## Phase 1: Core geometry redesign (A1, A2, A6, WGS84 safety net)

The highest-risk phase and the reason the others are cheap. Task 1 makes the
projection layer trustworthy, Task 2 fixes *which side* the arc bulges to, Task 3
fixes *what shape* it is, Task 4 is the acceptance suite built from the findings
report's own scenarios.

The design in one paragraph, so every task below reads against a shared picture: let
**P** be the route's last waypoint (where the arc starts), **Q** the route's first
(where it closes), **d = Q − P** the chord, and **û** the unit direction of the
runner's last real segment (`waypoints[n-2] → waypoints[n-1]`) — the thing the current
implementation never reads. There is exactly one circle through P and Q that leaves P
along û; its tangent–chord angle is φ = ∠(û, d) and its greatest distance from the
chord is **E = (|d|/2)·tan(φ/2)**. That single formula carries every requirement: the
side is the side of the chord û points toward, the shape is the arc of that circle,
φ→0 (already heading home) gives a flat arc, φ→180° (heading straight away from home)
gives an unbounded one that must be clamped — and clamping E is *identical* to
clamping φ, so the bulge-magnitude tuning of Phase 2 and the heading fidelity of A6
are the same knob. When û is unavailable or exactly collinear with the chord (the
2-waypoint out-and-back — see the limitation note in Task 12), E falls back to a
documented default ratio and the side falls back to the centroid, then to a fixed
compass convention.

*(Verified independently before this plan was finalized: sagitta formula
E=(L/2)tan(φ/2), radius r=L/(2 sinφ) via the chord-length relation L=2r sinφ, and the
arc-center placement `center = midpoint − normal·(r−E)` all check out algebraically
against the standard circle/chord/tangent-angle relations.)*

---

### Task 1: Antimeridian-safe projection + WGS84 output clamp in `packages/shared/src/math/loop.ts`

**Files:**
- Modify: `packages/shared/src/math/loop.ts`
- Test: `tests/shared/math/loop.test.ts`

**Interfaces:**
- Consumes: `haversineM` from `./gps.js` (unchanged).
- Produces: no new exports. Module-private `unwrapLon`, `wrapLon`,
  `MIN_M_PER_DEG_LON`, and a `projector(lat0, refLon)` whose `unproject` is now the
  single choke point guaranteeing valid WGS84 output. Tasks 2 and 3 build on
  `projector`'s new two-argument signature.

- [ ] **Step 1: Write the failing tests**

Append to `tests/shared/math/loop.test.ts`, inside the existing top-level
`describe("generateLoopWaypoints", ...)` block. The file already imports
`generateLoopWaypoints, haversineM, pathDistanceM` from `@liftr/shared`; no import
change is needed for this step.

```ts
  // --- findings A2 / C: the projection layer's own correctness ---

  it("keeps an arc across the ±180° line beside the route, not on the far side of the planet", () => {
    // Taveuni area, Fiji — two taps ~5 km apart straddling the antimeridian (loop-findings.md A2).
    // haversineM already gets the distance right; it was projector()'s raw `lon * mPerDegLon`
    // that interpolated the long way around the globe and produced points 3,750-5,385 km away.
    const start = { lat: -16.841, lon: 179.97 };
    const end = { lat: -16.83, lon: -179.985 };
    const chordM = haversineM(end, start);
    expect(chordM).toBeGreaterThan(4000);
    expect(chordM).toBeLessThan(6000);

    const arc = generateLoopWaypoints([start, end]);

    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      expect(haversineM(p, start)).toBeLessThan(4 * chordM);
      expect(haversineM(p, end)).toBeLessThan(4 * chordM);
    }
  });

  it("never emits a coordinate outside the range the server's waypoint schema accepts", () => {
    // The server's zod bounds (lat [-90,90], lon [-180,180]) are the contract every generated
    // point has to satisfy. A2's antimeridian points satisfied them while being garbage; C's
    // polar case violates them outright. Both are checked here, plus an equator crossing.
    const routes = [
      [{ lat: -16.841, lon: 179.97 }, { lat: -16.83, lon: -179.985 }],
      [{ lat: 89.99, lon: 0 }, { lat: 89.98, lon: 90 }],
      [{ lat: -89.99, lon: -179.999 }, { lat: -89.98, lon: 179.999 }],
      [{ lat: 0, lon: 179.999 }, { lat: 0.01, lon: -179.999 }],
    ];
    for (const waypoints of routes) {
      for (const p of generateLoopWaypoints(waypoints)) {
        expect(Number.isFinite(p.lat)).toBe(true);
        expect(Number.isFinite(p.lon)).toBe(true);
        expect(p.lat).toBeGreaterThanOrEqual(-90);
        expect(p.lat).toBeLessThanOrEqual(90);
        expect(p.lon).toBeGreaterThanOrEqual(-180);
        expect(p.lon).toBeLessThanOrEqual(180);
      }
    }
  });
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: both new tests FAIL. The antimeridian test fails because `projector()`
multiplies raw longitude by `mPerDegLon`, so 179.97 and −179.985 project ~24,000 km
apart and the "arc" lands near lon −90/0/+90 (the exact values the findings report
quotes). The bounds test fails on the polar route because `mPerDegLon = M_PER_DEG_LAT
* cos(89.99°)` is ~19 m/deg, so `unproject` divides by nearly nothing and produces
longitudes outside ±180° (the report confirms `lon = -198°`). Every pre-existing test
in the file must still pass at this step.

- [ ] **Step 3: Implement the unwrap/wrap/clamp layer**

In `packages/shared/src/math/loop.ts`, add next to the existing constants:

```ts
/** cos(lat) → 0 at the poles, so metres-per-degree-of-longitude → 0 and `unproject` ends up
 *  dividing by nearly nothing, throwing the output longitude far outside ±180° (findings C —
 *  confirmed up to lon = -198°). No running route gets within a kilometre of a pole, so this
 *  floor never engages in practice; it costs one Math.max and converts an impossible-to-debug
 *  garbage coordinate into a merely-distorted one. */
const MIN_M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((89.9 * Math.PI) / 180);
```

Add above `projector`:

```ts
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
```

Replace `projector` with:

```ts
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
```

Then in `generateLoopWaypoints`, take a reference longitude before projecting and
route the centroid through it too:

```ts
  // Unwrap everything relative to the loop's own start — arbitrary but consistent, and always
  // within ±180° of every other point on a route short enough to run.
  const refLon = waypoints[0]!.lon;
  const { project, unproject } = projector((end.lat + start.lat) / 2, refLon);
```

and change the centroid's longitude average to `waypoints.reduce((s, w) => s +
unwrapLon(w.lon, refLon), 0) / waypoints.length`. (Unwrapping an already-unwrapped
value against the same reference is idempotent, so the subsequent `project(centroid)`
is safe.) **Do not change the arc shape or the side logic in this task** — Tasks 2 and
3 own those.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: PASS — both new tests plus all 10 pre-existing ones. In particular
`"round-trips the projection without drifting the arc off the correct hemisphere"`
must still pass; it exercises the negative-coordinate unproject path this task just
touched.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/math/loop.ts tests/shared/math/loop.test.ts
git commit -m "fix(shared): unwrap longitudes across the antimeridian and clamp loop output to valid WGS84"
```

---

### Task 2: Heading-derived bulge side replaces the centroid coin flip in `packages/shared/src/math/loop.ts`

**Files:**
- Modify: `packages/shared/src/math/loop.ts`
- Test: `tests/shared/math/loop.test.ts` (two existing tests are **rewritten** here,
  not merely extended)

**Interfaces:**
- Consumes: `projector(lat0, refLon)` from Task 1.
- Produces: module-private `approachDirection(projected: Point2[]): Point2 | null`,
  `bulgeNormal(chordUnit, approach, projected): Point2`,
  `perpendicularComponent(v, axis): Point2 | null`, and the constants
  `MIN_HEADING_SEGMENT_M`, `SIDE_EPS`. Removes `DEGENERATE_SIDE_RATIO` entirely. Task
  3 consumes `approachDirection`'s return value for the arc's shape as well as its
  side.

**Design note (read before writing code).** Two things are being deleted and one
added:
1. `DEGENERATE_SIDE_RATIO = 0.05` goes. A threshold that says "if the signal is weaker
   than 5% of the chord, discard it and use a fixed side" is what makes a 10 m nudge
   of a mid-route waypoint double the enclosed area (A1's first repro) and what makes
   a 3 m nudge flip the side near the boundary (A1's third). A sign is only ambiguous
   when it is *zero*; at exactly zero the two candidate sides are mirror images and it
   cannot matter which wins.
2. The centroid stops being the primary signal and becomes the *second* one. The
   primary is the approach heading, because it is the thing that decides whether ORS
   can route the first leg at all (A6).
3. The no-signal fallback stops being "left of the chord" and becomes an absolute
   compass criterion. Left-of-chord flips when the user taps the two points in the
   other order, which is A1's second repro (Fischland-Darß landward vs. seaward). An
   absolute criterion cannot flip, because reversing the pair negates the chord and
   therefore maps the candidate-normal *pair* `{n, −n}` onto itself.

Verify the new rule against the two cases the report already settled, before trusting
it: for the report's Berlin south-bend, the approach heading at the last waypoint is
ENE (~74°) and the chord home points due west, so the heading's perpendicular
component is **north** — the side the report calls "the geometrically correct
behavior". For the existing L-shape test (`[end, bend, start]` with a northward bend),
the approach heading is southeast and the chord is due west, giving **south** — the
side that test already asserts. The new rule reproduces both known-good answers from a
different, better-grounded signal.

- [ ] **Step 1: Rewrite the two tests that encode the old degenerate behavior, and add the A1 scenarios**

In `tests/shared/math/loop.test.ts`, **delete** the test named `"produces a lens shape
(bulges to one side), not a straight line, for a 2-waypoint out-and-back"` and the
test named `"bulges to the side opposite the route's own centroid for an L-shaped
route"`. Both encode the current implementation's fallback as intent — the first
documents "must fall back to a fixed side", the second documents the centroid vote as
the rule. Replace them with:

```ts
  it("produces a lens shape for a 2-waypoint out-and-back, on the same side whichever end was tapped first", () => {
    // With exactly 2 waypoints there is no approach-heading signal at all: the only segment in the
    // path IS the chord, so the heading is exactly anti-parallel to it and picks no side, and the
    // centroid of two points sits exactly on the line between them. The arc still has to bulge —
    // collapsing onto the chord would make "Schleife schließen" a straight line — so a fixed
    // convention decides, and that convention is absolute (east, then north) rather than
    // "left of the chord". Tap order must not decide which side of a coastal path the return leg
    // lands on (loop-findings.md A1, Fischland-Darß).
    const a = { lat: 52.5, lon: 13.4 };
    const b = { lat: 52.5, lon: 13.41 }; // due east, same latitude — an easy line to reason about

    const forward = generateLoopWaypoints([a, b]);
    const reversed = generateLoopWaypoints([b, a]);

    expect(forward.length).toBeGreaterThan(0);
    expect(reversed.length).toBeGreaterThan(0);
    // Off the chord, all on one side, not scattered across both.
    for (const p of [...forward, ...reversed]) {
      expect(Math.abs(p.lat - a.lat)).toBeGreaterThan(0.0001);
    }
    expect(new Set(forward.map((p) => Math.sign(p.lat - a.lat))).size).toBe(1);
    expect(new Set(reversed.map((p) => Math.sign(p.lat - a.lat))).size).toBe(1);
    // ...and it is the SAME side both ways round, which is the whole point.
    expect(Math.sign(forward[0]!.lat - a.lat)).toBe(Math.sign(reversed[0]!.lat - a.lat));
  });

  it("bulges to the side the final approach heading points toward, not to a fixed fallback side", () => {
    // An L bending north: start -> north -> east. Arriving at the last waypoint the runner is
    // heading southeast; the chord home points due west; southeast is south of due west, so the
    // return leg sweeps south — enclosing the ground between it and the northward outbound leg
    // instead of folding back over it.
    const end = { lat: 52.5, lon: 13.4 }; // waypoints[0] — where the loop closes
    const bend = { lat: 52.51, lon: 13.4 };
    const start = { lat: 52.5, lon: 13.41 }; // waypoints[last] — where the arc starts
    const arc = generateLoopWaypoints([end, bend, start]);
    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      expect(p.lat).toBeLessThan(end.lat);
    }
  });

  it("does not flip the bulge side for a small change in a mid-route waypoint (findings A1)", () => {
    // The report's own repro: a 3-waypoint route with a small southward bend. At a 95 m offset the
    // old code was inside DEGENERATE_SIDE_RATIO and bulged south (same side as the bend); at 105 m
    // it was outside and bulged north. A 10 m nudge roughly doubled the enclosed area.
    const p0 = { lat: 52.5, lon: 13.4 };
    const p2 = { lat: 52.5, lon: 13.41 };
    const southBend = (m: number) => ({ lat: 52.5 - m / 111320, lon: 13.405 });

    for (const offsetM of [95, 105]) {
      const arc = generateLoopWaypoints([p0, southBend(offsetM), p2]);
      expect(arc.length).toBeGreaterThan(0);
      for (const p of arc) {
        expect(p.lat).toBeGreaterThan(52.5); // north — away from the southward bend
      }
    }
  });

  it("picks the bulge side continuously across the whole range of bend depths", () => {
    // Same route, sweeping the bend from 200 m north of the chord to 200 m south of it. The side
    // may change exactly once, where the bend crosses the chord and the two sides are genuinely
    // mirror images — never anywhere else, and never at an arbitrary fraction-of-chord threshold.
    const p0 = { lat: 52.5, lon: 13.4 };
    const p2 = { lat: 52.5, lon: 13.41 };
    const sideAt = (offsetM: number) => {
      const arc = generateLoopWaypoints([p0, { lat: 52.5 - offsetM / 111320, lon: 13.405 }, p2]);
      expect(arc.length).toBeGreaterThan(0);
      return Math.sign(arc[0]!.lat - 52.5);
    };

    for (let offsetM = 5; offsetM <= 200; offsetM += 5) {
      expect(sideAt(offsetM)).toBe(1); // bend south -> bulge north
      expect(sideAt(-offsetM)).toBe(-1); // bend north -> bulge south
    }
  });
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: the tap-order-invariance assertion FAILS (the current `leftNormal` fallback
is chord-relative, so reversing the pair mirrors the arc), the `offsetM: 95` case of
the A1 repro FAILS (it is inside the 5% degenerate threshold and bulges south), and
the continuity sweep FAILS somewhere around the 95–105 m boundary. The rewritten
L-shape test should PASS already — it asserts an outcome the old centroid rule and the
new heading rule agree on; that agreement is deliberate and is what makes it a safe
regression anchor.

- [ ] **Step 3: Implement heading extraction and side selection**

In `packages/shared/src/math/loop.ts`, **delete** the `DEGENERATE_SIDE_RATIO` constant
and its doc comment. Add:

```ts
/** Shortest segment that still counts as an approach heading — below this a "segment" is a
 *  double-tap on the same spot, or GPS-grade jitter in a seeded track, not a direction of travel. */
const MIN_HEADING_SEGMENT_M = 1;
/** Both operands are unit vectors, so this is |sin(angle)|: the point at which two directions are
 *  numerically parallel and genuinely pick no side. Deliberately a floating-point epsilon and not
 *  a "how confident are we" threshold — see bulgeNormal's doc. */
const SIDE_EPS = 1e-6;
```

Add these module-private helpers:

```ts
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
```

Rewrite the body of `generateLoopWaypoints` between the projector construction and the
bulge magnitude so it projects the whole path once and derives the frame from it.
Replace the current `const p = project(end); … const unitNormal = …` block with:

```ts
  const projected = waypoints.map(project);
  const p = projected[projected.length - 1]!; // route's current end — where the arc departs
  const q = projected[0]!; // route's start — where the arc closes
  const chord = { x: q.x - p.x, y: q.y - p.y };
  const chordLenM = Math.hypot(chord.x, chord.y);
  const chordUnit = { x: chord.x / chordLenM, y: chord.y / chordLenM };
  const approach = approachDirection(projected);
  const normal = bulgeNormal(chordUnit, approach, projected);
```

The point-generation loop keeps its current sine shape for now — only swap
`abx`/`aby` for `chord.x`/`chord.y` and `unitNormal` for `normal`. Delete the
now-unused `centroid`/`c`/`acx`/`acy`/`cross`/`perpDistM`/`leftNormal`/`rightNormal`/
`degenerate` locals and the `Point2`-typed leftovers they used. Note that the
dimensional-analysis bias listed under findings C disappears with them: the side
decision no longer divides a projected-plane cross product by a great-circle length,
because it no longer computes a cross product at all.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: PASS, all tests including the pre-existing ones. If the continuity sweep
fails at a single offset, check `SIDE_EPS` against the bend depth it failed at before
touching anything else — a real bend of 5 m over a 678 m chord is `|sin| ≈ 0.007`,
four orders of magnitude above the epsilon, so a failure there means the frame is
wrong, not the epsilon.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/math/loop.ts tests/shared/math/loop.test.ts
git commit -m "fix(shared): pick the loop bulge side from the approach heading instead of a thresholded centroid vote"
```

---

### Task 3: Tangent-continuous circular arc replaces the sine bulge in `packages/shared/src/math/loop.ts`

**Files:**
- Modify: `packages/shared/src/math/loop.ts`
- Test: `tests/shared/math/loop.test.ts`

**Interfaces:**
- Consumes: `approachDirection`, `bulgeNormal`, the projected frame from Task 2.
- Produces: module-private `approachBulgeM(approach, chordUnit, chordLenM,
  bulgeRatio): number`; renames the constant `BULGE_RATIO` to `DEFAULT_BULGE_RATIO`
  (its meaning narrows — see below). Phase 2's `clampBulgeM` slots into exactly one
  line of this task's output.

**Design note.** The sine-bulge parameterisation cannot be fixed, only replaced. Its
tangent at t=0 is `chord + π·bulge·n̂`, whose component *along the chord* is locked to
the chord itself — so no bulge magnitude can ever make the first generated point lie
ahead of a runner whose heading is more than 90° off the chord, which is the normal
case (you run out, so the chord home points roughly backwards). That is the mechanism
behind the report's measured 99° turn.

A cubic Hermite/Bézier matching both end tangents was evaluated and rejected: in the
exact case that matters most — a straight out-and-back, where the approach heading,
the chord and the outbound departure direction are all collinear — every control point
lies on one line and the curve degenerates to a straight overshoot-and-return with no
enclosed area at all. It would need a normal-offset correction bolted on top, at which
point it is two shapes in a trenchcoat with two magnitudes to tune.

The circular arc has none of that. Given P, Q and a departure direction, exactly one
circle satisfies all three, its excursion is a closed-form `E = (|d|/2)·tan(φ/2)`, and
clamping E is the same operation as clamping φ — one knob, one shape, one formula,
degenerate only where the heading itself is degenerate. It also produces the
exactly-right answer for the report's roundabout example: for waypoints traced on a
circle, the reconstructed circle *is* that circle.

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe` block in `tests/shared/math/loop.test.ts`. Note the
two local helpers — the test file has no shared helper module and these mirror the
metrics the findings report quotes.

```ts
  // --- findings A6: the arc has to know which way you were already going ---

  /** Compass bearing in degrees from `a` to `b`, in the same convention loop-findings.md uses. */
  function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const mPerDegLat = (Math.PI / 180) * 6_371_000;
    const mPerDegLon = mPerDegLat * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
    return (Math.atan2((b.lon - a.lon) * mPerDegLon, (b.lat - a.lat) * mPerDegLat) * 180) / Math.PI;
  }
  /** Signed turn in (-180, 180]: 0 = straight ahead, ±180 = a full reversal. */
  function turnDeg(from: number, to: number) {
    return ((((to - from) % 360) + 540) % 360) - 180;
  }

  // Both routes end at exactly the same waypoint and start at exactly the same waypoint; only the
  // final approach differs (22° vs 303°). loop-findings.md A6 proved the old arc's first point was
  // byte-for-byte identical for both.
  const approach1 = [
    { lat: 52.5, lon: 13.4 },
    { lat: 52.5005, lon: 13.404 },
    { lat: 52.5012, lon: 13.408 },
    { lat: 52.503, lon: 13.411 },
    { lat: 52.5045, lon: 13.412 },
  ];
  const approach2 = [
    { lat: 52.5, lon: 13.4 },
    { lat: 52.5008, lon: 13.4125 },
    { lat: 52.502, lon: 13.4155 },
    { lat: 52.5035, lon: 13.4145 },
    { lat: 52.5045, lon: 13.412 },
  ];

  it("generates a different arc for a different final approach to the same waypoint", () => {
    const a = generateLoopWaypoints(approach1);
    const b = generateLoopWaypoints(approach2);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a[0]).not.toEqual(b[0]);
    expect(haversineM(a[0]!, b[0]!)).toBeGreaterThan(100);
  });

  it("puts the first generated point roughly ahead of the runner, not 99° off to the side", () => {
    for (const route of [approach1, approach2]) {
      const secondLast = route[route.length - 2]!;
      const last = route[route.length - 1]!;
      const arc = generateLoopWaypoints(route);
      const turn = turnDeg(bearingDeg(secondLast, last), bearingDeg(last, arc[0]!));
      // Was -99.0° for approach1 (a sharp lateral swing ORS can only reach by backtracking).
      expect(Math.abs(turn)).toBeLessThan(60);
    }
  });

  it("completes a partially-traced roundabout along the roundabout itself", () => {
    // loop-findings.md A6's second scenario: 3 taps covering 120° of a 40 m-radius roundabout.
    // The old arc cut across the island (its points sat ~4 m from the centre, 36 m off the ring).
    const center = { lat: 52.5, lon: 13.4 };
    const mPerDegLat = (Math.PI / 180) * 6_371_000;
    const mPerDegLon = mPerDegLat * Math.cos(52.5 * (Math.PI / 180));
    const onRing = (deg: number) => ({
      lat: center.lat + (40 * Math.cos((deg * Math.PI) / 180)) / mPerDegLat,
      lon: center.lon + (40 * Math.sin((deg * Math.PI) / 180)) / mPerDegLon,
    });

    const arc = generateLoopWaypoints([onRing(0), onRing(60), onRing(120)]);

    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) {
      expect(Math.abs(haversineM(p, center) - 40)).toBeLessThan(15);
    }
  });

  it("places every generated point on one circle through the route's end and start", () => {
    // The structural invariant of the new shape: the arc is a circular arc, so the end waypoint,
    // every generated point and the start waypoint are all equidistant from a common centre.
    const route = approach2;
    const end = route[route.length - 1]!;
    const start = route[0]!;
    const arc = generateLoopWaypoints(route);
    const ring = [end, ...arc, start];

    // Fit the centre from the first three points, then check the rest against it.
    const mPerDegLat = (Math.PI / 180) * 6_371_000;
    const mPerDegLon = mPerDegLat * Math.cos(start.lat * (Math.PI / 180));
    const xy = ring.map((p) => ({ x: p.lon * mPerDegLon, y: p.lat * mPerDegLat }));
    const [a, b, c] = [xy[0]!, xy[1]!, xy[2]!];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    const ux =
      ((a.x ** 2 + a.y ** 2) * (b.y - c.y) +
        (b.x ** 2 + b.y ** 2) * (c.y - a.y) +
        (c.x ** 2 + c.y ** 2) * (a.y - b.y)) /
      d;
    const uy =
      ((a.x ** 2 + a.y ** 2) * (c.x - b.x) +
        (b.x ** 2 + b.y ** 2) * (a.x - c.x) +
        (c.x ** 2 + c.y ** 2) * (b.x - a.x)) /
      d;
    const radii = xy.map((p) => Math.hypot(p.x - ux, p.y - uy));
    for (const r of radii) {
      expect(r).toBeCloseTo(radii[0]!, -1); // within ~5 m — projection rounding only
    }
  });
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: all four new tests FAIL. `"generates a different arc"` fails because after
Task 2 the *side* now depends on heading but the *shape* still doesn't — both
approaches happen to bulge northwest, so the arcs may still be close; if it happens to
pass at this point, that is luck, not coverage, and the remaining three still fail.
The 99° test fails (the sine tangent is structurally ~48° off the chord regardless of
heading). The roundabout test fails by ~36 m. The circle-fit test fails because a sine
bulge is not an arc of a circle.

- [ ] **Step 3: Implement the circular arc**

In `packages/shared/src/math/loop.ts`, rename `BULGE_RATIO` to `DEFAULT_BULGE_RATIO`
and give it its narrowed doc:

```ts
/** Excursion as a fraction of the chord for the no-heading-signal case only — a 2-waypoint
 *  out-and-back, or an approach that runs exactly along the chord. When a heading IS available the
 *  excursion is derived from it instead (see approachBulgeM), and this value does not apply.
 *  `opts.bulgeRatio` overrides exactly this number and nothing else. */
const DEFAULT_BULGE_RATIO = 0.35;
```

Add:

```ts
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
```

Replace the bulge magnitude line and the whole point-generation loop with:

```ts
  const bulgeRatio = opts?.bulgeRatio ?? DEFAULT_BULGE_RATIO;
  const rawBulgeM = approachBulgeM(approach, chordUnit, chordLenM, bulgeRatio);
  const bulgeM = Math.min(MAX_BULGE_M, Math.max(MIN_BULGE_M, rawBulgeM)); // Phase 2 replaces this line

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
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: PASS, all tests. Two pre-existing tests deserve a look even though they
should pass: `"keeps every generated point within a sane distance of the chord it's
bridging"` (2-waypoint route, so the degenerate default ratio applies and the arc
stays inside the old `+2100` slack — Task 5 retires that magic number) and `"produces
an arc distinctly longer than the straight chord"` (the arc is now genuinely longer,
not shorter).

If the roundabout test is close but outside 15 m, do **not** loosen the assertion —
check `sense` first. An inverted travel sense produces a plausible-looking arc on the
correct side that sweeps the wrong way round, and the roundabout test is the one test
that catches it.

- [ ] **Step 5: Note the deliberate behavioural changes**

Record these in the task report (they become ADR-0008's Consequences in Task 13;
don't fix them):
- **The return leg may now self-intersect the outbound path.** Finding D noted the old
  arc never did. A sweep past 180° is a lollipop, and a lollipop crosses itself at the
  stem. This is correct behaviour, not a regression.
- **Loops get bigger** for routes that end heading away from the start. Worst case the
  arc length is ~2.77× the chord (at the clamp limit) versus ~1.3× before. For the
  most common case — a 2-waypoint out-and-back, which has no heading signal — the
  scale is unchanged at ~1.3×.
- **Three interior points over a sweep that can reach 250° is coarse.** Sampling the
  arc adaptively (more points for a bigger sweep) is a real improvement and is
  deliberately **not** done here: it spends the server's 50-waypoint budget that
  finding B4 is already fighting over. Deferred, noted in the ADR.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/math/loop.ts tests/shared/math/loop.test.ts
git commit -m "fix(shared): close loops with a heading-tangent circular arc instead of a symmetric sine bulge"
```

---

### Task 4: Findings-report acceptance suite in `tests/shared/math/loop.test.ts`

**Files:**
- Test: `tests/shared/math/loop.test.ts`

**Interfaces:**
- Consumes: `generateLoopWaypoints`, `haversineM`, `pathDistanceM` from
  `@liftr/shared`.
- Produces: no source changes. This task is an **acceptance/characterisation task**,
  not a red-green cycle: Tasks 1–3 already implemented the behaviour, and the point of
  this task is to pin the report's remaining named scenarios so a future change can't
  quietly un-fix them. Steps 2 and 3 are therefore inverted relative to the other
  tasks — the tests are expected to pass on first run, and a failure here is a real
  defect in Tasks 1–3 to be fixed *in this task* before committing.

- [ ] **Step 1: Write the scenario tests**

Append inside the same `describe` block:

```ts
  // --- findings A1, second repro: a coastal out-and-back where the side decides land vs. water ---

  it("puts the return leg on the same side of a coastal path however the pair was tapped", () => {
    // Fischland-Darß (Baltic coast): a spit running NNE-SSW, water on both sides, two taps ~1.2 km
    // apart. Nothing in a 2-point route can tell the generator which side is land — but tapping the
    // same two points in the other order must not silently move the return leg across the water.
    const south = { lat: 54.365, lon: 12.38 };
    const north = { lat: 54.376, lon: 12.383 };

    const forward = generateLoopWaypoints([south, north]);
    const reversed = generateLoopWaypoints([north, south]);

    expect(forward).toHaveLength(3);
    expect(reversed).toHaveLength(3);
    // Same circle, traversed the other way round: the point SET is identical, reversed in order.
    const reversedBack = [...reversed].reverse();
    for (let i = 0; i < forward.length; i++) {
      expect(forward[i]!.lat).toBeCloseTo(reversedBack[i]!.lat, 6);
      expect(forward[i]!.lon).toBeCloseTo(reversedBack[i]!.lon, 6);
    }
  });

  it("encloses a comparable area for near-identical routes (no cliff at a threshold)", () => {
    // The concrete harm loop-findings.md A1 measured: 64,822 m² vs 132,590 m² of enclosed area for
    // a 10 m difference in a mid-route waypoint. Shoelace over the full closed ring.
    const p0 = { lat: 52.5, lon: 13.4 };
    const p2 = { lat: 52.5, lon: 13.41 };
    const southBend = (m: number) => ({ lat: 52.5 - m / 111320, lon: 13.405 });
    const areaOf = (offsetM: number) => {
      const route = [p0, southBend(offsetM), p2];
      const ring = [...route, ...generateLoopWaypoints(route), p0];
      const mPerDegLat = (Math.PI / 180) * 6_371_000;
      const mPerDegLon = mPerDegLat * Math.cos(52.5 * (Math.PI / 180));
      let twiceArea = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        twiceArea += a.lon * mPerDegLon * (b.lat * mPerDegLat) - b.lon * mPerDegLon * (a.lat * mPerDegLat);
      }
      return Math.abs(twiceArea) / 2;
    };

    const at95 = areaOf(95);
    const at105 = areaOf(105);
    expect(Math.abs(at95 - at105) / Math.max(at95, at105)).toBeLessThan(0.1);
  });

  it("still returns [] for the cases that have nothing sensible to generate", () => {
    // Guards the early returns the report confirmed correct (section D: duplicate waypoints).
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }, { lat: 52.5, lon: 13.4 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }])).toEqual([]);
  });

  it("is deterministic and free of hidden state across repeated calls", () => {
    // Section D relies on this: setCloseLoop toggling off and back on must reproduce the same arc.
    const route = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5005, lon: 13.404 },
      { lat: 52.5045, lon: 13.412 },
    ];
    expect(generateLoopWaypoints(route)).toEqual(generateLoopWaypoints(route));
  });

  it("does not mutate the waypoint array it was given", () => {
    const route = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5045, lon: 13.412 },
    ];
    const snapshot = JSON.stringify(route);
    generateLoopWaypoints(route);
    expect(JSON.stringify(route)).toBe(snapshot);
  });
```

- [ ] **Step 2: Run the suite, expect it to pass**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: PASS. Unlike the other tasks in this plan there is no red step — the
implementation these tests describe landed in Tasks 1–3. A failure is a genuine
defect in one of those tasks; fix it here (in `loop.ts`) rather than adjusting the
assertion, and say which task's change was responsible in the report.

- [ ] **Step 3: Run the full shared suite and typecheck**

Run: `pnpm vitest run tests/shared && pnpm typecheck`
Expected: clean. `pnpm typecheck` covers `tests/shared` through
`packages/shared/tsconfig.test.json`, which matters because the local helpers added in
Tasks 3–4 are real typed code.

- [ ] **Step 4: Commit**

```bash
git add tests/shared/math/loop.test.ts
git commit -m "test(shared): pin the loop generator's behaviour on the bug-hunt report's named scenarios"
```

---

## Phase 2: Bulge-shape tuning (A3, A4)

One task. A3 and A4 are the two ends of the same clamp expression (`Math.min(MAX_BULGE_M,
Math.max(MIN_BULGE_M, …))`), they are validated against the same two tables in the
findings report, and splitting them would mean two commits editing the same three
lines.

---

### Task 5: `clampBulgeM` — proportional floor and square-root-compressed cap

**Files:**
- Modify: `packages/shared/src/math/loop.ts`
- Test: `tests/shared/math/loop.test.ts`

**Interfaces:**
- Consumes: `chordLenM` and `rawBulgeM` from Task 3.
- Produces: module-private `clampBulgeM(rawM, chordLenM): number`. Removes
  `MIN_BULGE_M` and `MAX_BULGE_M`; adds `MIN_BULGE_ABS_M`, `MIN_BULGE_RATIO`,
  `MAX_BULGE_RATIO`, `BULGE_KNEE_CHORD_M`.

**The numbers, argued from the report's own tables.**

*Floor (A3).* The 50 m fixed floor made the return leg 99% of a 50.5 m chord, 83% of a
60 m one, 50% of a 100 m one — a detour longer than the gap it closes, "easily enough
to land outside a small park or across a street." Most of that problem simply
evaporates with Task 3: for the 2-waypoint case the report's repro describes ("any two
waypoints 51–150 m apart, default options") the excursion is now a plain `0.35 ×
chord` — 17.7 m at a 50.5 m chord, 35 m at 100 m, 50 m at 143 m. Uniformly 35%, no
floor involved. The floor's job is now different: it guarantees a real detour when the
*heading* says the runner is already pointed home (φ→0 ⇒ E→0, an arc
indistinguishable from a straight line). A ratio is the scale-free way to express
that; the absolute term only binds below a 67 m chord, where it is still under 20% of
it:

| chord | old floor | new `max(10, 0.15·L)` | new % of chord |
|---|---|---|---|
| 50.5 m | 50.0 m (99.0%) | 10.0 m | 19.8% |
| 60 m | 50.0 m (83.3%) | 10.0 m | 16.7% |
| 100 m | 50.0 m (50.0%) | 15.0 m | 15.0% |
| 143 m | 50.0 m (35.0%) | 21.5 m | 15.0% |

*Cap (A4).* The 2000 m cap engaged at exactly `2000/0.35 = 5714 m` of chord and then
stopped growing, so the detour decayed to 5% of a 40 km ultra chord and 2% of a 100 km
one — "the stated purpose quietly stops being true well before the ultra distances
this app's running-rank system already models." Growth continues past the knee as a
square root: still bounded, still sublinear, but proportionate.

| chord | old cap | new `1.0·√(L·min(L, 5000))` | new % of chord |
|---|---|---|---|
| 5.71 km | 2000 m (35.0%) | 5346 m | 93.6% |
| 10 km | 2000 m (20.0%) | 7071 m | 70.7% |
| 25 km | 2000 m (8.0%) | 11,180 m | 44.7% |
| 40 km | 2000 m (5.0%) | 14,142 m | 35.4% |
| 100 km | 2000 m (2.0%) | 22,360 m | 22.4% |

*Why `MAX_BULGE_RATIO = 1.0` and not the old 0.35.* The cap is no longer "how big
should the bulge be" — Task 3's heading already answers that — it is "how far will we
let a heading push it". `E/L = tan(φ/2)/2`, so a ratio of 1.0 is a tangent–chord angle
of 126.9°. That keeps every realistic curved-route continuation unclamped (a
half-traced roundabout needs 90°, a third-traced one 120°), keeps the clean semicircle
case (φ=90°, E=0.5L) comfortably inside, and bounds the worst case — a dead-straight
out-and-back, φ→180° — to a return leg ~2.77× the chord instead of unbounded. A ratio
of 0.35 would clamp the roundabout case back down to 70° and re-break A6 for exactly
the example the report used to demonstrate it. The residual cost is that a route
ending 143° away from home turns ~17° more sharply than the ideal; that is the honest
trade and it belongs in the ADR, not in a tighter constant.

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe` block:

```ts
  // --- findings A3 / A4: proportionate at both ends of the scale ---

  /** Greatest distance from the chord over the generated arc — the quantity A3/A4 tabulate. */
  function excursionM(waypoints: { lat: number; lon: number }[]) {
    const start = waypoints[0]!;
    const end = waypoints[waypoints.length - 1]!;
    const arc = generateLoopWaypoints(waypoints);
    const chordM = haversineM(end, start);
    // Distance from a point to the chord, via the triangle-area identity, all in metres.
    return Math.max(
      ...arc.map((p) => {
        const a = haversineM(end, p);
        const b = haversineM(p, start);
        const s = (a + b + chordM) / 2;
        const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - chordM)));
        return (2 * area) / chordM;
      }),
    );
  }

  it("keeps the detour proportionate on short loops instead of flooring it at 50 m", () => {
    // loop-findings.md A3: a 50 m fixed floor was 99% of a 50.5 m chord and 50% of a 100 m one.
    const due = (metresEast: number) => [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.4 + metresEast / (111_195 * Math.cos((52.5 * Math.PI) / 180)) },
    ];
    for (const chordM of [50.5, 60, 100, 143]) {
      const ratio = excursionM(due(chordM)) / chordM;
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(0.45); // was 0.99 at a 50.5 m chord
    }
  });

  it("never collapses the detour to nothing when the runner is already heading home", () => {
    // The floor's real job after the Phase 1 redesign: a heading pointed almost straight at the
    // start gives a tangent-chord angle near zero, i.e. an arc indistinguishable from the chord.
    const route = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.4 },
      { lat: 52.5099, lon: 13.4002 }, // final approach: aimed almost exactly back at the start
    ];
    const chordM = haversineM(route[route.length - 1]!, route[0]!);
    expect(excursionM(route)).toBeGreaterThan(0.1 * chordM);
  });

  it("keeps the detour a meaningful fraction of a long chord instead of capping it at 2 km", () => {
    // loop-findings.md A4: the old cap made the return leg 5% of a 40 km chord and 2% of a 100 km
    // one. Still bounded — it just doesn't stop growing.
    const north = (metres: number) => [
      { lat: 52.0, lon: 13.4 },
      { lat: 52.0 + metres / 111_195, lon: 13.4 },
    ];
    const at10k = excursionM(north(10_000));
    const at40k = excursionM(north(40_000));
    expect(at10k).toBeGreaterThan(0.2 * 10_000);
    expect(at40k).toBeGreaterThan(0.2 * 40_000);
    expect(at40k).toBeGreaterThan(at10k); // grows, unlike the old flat cap
    expect(at40k).toBeLessThan(40_000); // but stays bounded
  });
```

Also update the pre-existing test `"keeps every generated point within a sane distance
of the chord it's bridging"`: its `chordM + 2100` slack is `MAX_BULGE_M + 100` and
that constant is being deleted. Replace its two assertions and the comment with:

```ts
    for (const p of arc) {
      // No arc point should land wildly further from either endpoint than the chord itself plus the
      // excursion the clamp allows for a chord this length (see clampBulgeM).
      const slack = 1.0 * Math.sqrt(chordM * Math.min(chordM, 5000));
      expect(haversineM(p, start)).toBeLessThan(chordM + 2 * slack);
      expect(haversineM(p, end)).toBeLessThan(chordM + 2 * slack);
    }
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: the A3 test FAILS at the 50.5 m and 60 m chords (ratio 0.99 and 0.83, above
the 0.45 bound). The A4 test FAILS at both distances (2000 m is 20% of 10 km and 5% of
40 km, and `at40k === at10k` because the cap is flat). The "already heading home" test
may pass by accident on the old 50 m floor — it is still worth writing, because it is
what will fail if someone later deletes the floor as redundant.

- [ ] **Step 3: Implement**

Replace `MIN_BULGE_M` / `MAX_BULGE_M` with:

```ts
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
```

Add:

```ts
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
```

Replace the placeholder line from Task 3 with:

```ts
  const bulgeM = clampBulgeM(rawBulgeM, chordLenM);
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: PASS, all tests. Re-check the roundabout test from Task 3 specifically — it
is the one most sensitive to `MAX_BULGE_RATIO`, and dropping that constant below ~0.9
will break it. If it breaks, the constant is wrong, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/math/loop.ts tests/shared/math/loop.test.ts
git commit -m "fix(shared): scale the loop detour with the chord instead of a 50 m floor and 2 km cap"
```

---

## Phase 3: Defensive hardening (C)

One task. Every item in the report's section C is a guard on the same function's
entry and options, and none of them is reachable from the UI today — they belong in
one commit that a reader can take or leave as a unit.

Two of section C's six items are **already resolved by Phase 1** and should be
confirmed rather than re-fixed:
- *Dimensional-analysis bias in the degenerate-side calculation* — gone with Task 2.
  The side decision no longer divides a projected-plane cross product by a
  great-circle haversine length, because it no longer computes a cross product;
  everything in `bulgeNormal` lives in the projected plane.
- *Polar-latitude longitude blowup* — gone with Task 1's `MIN_M_PER_DEG_LON` floor
  plus the clamp/wrap in `unproject`, and covered by the WGS84-bounds test.

Verify both while implementing this task and say so in the report; do not add
redundant guards for them.

---

### Task 6: Input and option validation in `packages/shared/src/math/loop.ts`

**Files:**
- Modify: `packages/shared/src/math/loop.ts`
- Test: `tests/shared/math/loop.test.ts`

**Interfaces:**
- Produces: module-private `isFiniteWaypoint(w): boolean` and the constant
  `MAX_GENERATED_COUNT`. No signature change; `opts.bulgeRatio`'s documented
  semantics change (see below) and that change is recorded in Task 12's JSDoc and
  Task 13's ADR.

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe` block:

```ts
  // --- findings C: defence in depth for inputs the only production caller never produces today ---

  it("returns [] rather than NaN coordinates for non-finite or out-of-range input", () => {
    // `NaN < MIN_CHORD_M` is false in JS, so the chord guard never caught a NaN and every output
    // point came back {lat: NaN, lon: NaN}.
    expect(generateLoopWaypoints([{ lat: NaN, lon: 13.4 }, { lat: 52.5, lon: 13.41 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: Infinity }, { lat: 52.5, lon: 13.41 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }, { lat: 91, lon: 13.41 }])).toEqual([]);
    expect(generateLoopWaypoints([{ lat: 52.5, lon: 13.4 }, { lat: 52.5, lon: -181 }])).toEqual([]);
  });

  it("treats a fractional or negative count as the integer it can honour", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.41 },
    ];
    // count: 2.5 used to run for i=1,2 with t=i/3.5, giving a ~25% height difference between what
    // should be a matched pair.
    const half = generateLoopWaypoints(waypoints, { count: 2.5 });
    expect(half).toHaveLength(2);
    const chordLat = (52.5 + 52.51) / 2;
    expect(Math.abs(half[0]!.lat - chordLat)).toBeCloseTo(Math.abs(half[1]!.lat - chordLat), 4);

    expect(generateLoopWaypoints(waypoints, { count: -3 })).toEqual([]);
    expect(generateLoopWaypoints(waypoints, { count: 0 })).toEqual([]);
  });

  it("caps count independently of maxCount", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.41 },
    ];
    // 1,000,000 points used to allocate for ~70 ms with no caller-supplied maxCount to stop it.
    // 48 is what the server's 50-waypoint array leaves once the two real endpoints are counted.
    expect(generateLoopWaypoints(waypoints, { count: 1_000_000 })).toHaveLength(48);
  });

  it("treats bulgeRatio: 0 as no bulge, and an invalid ratio as the default", () => {
    const waypoints = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.41 },
    ];
    // 0, negatives and -Infinity all used to produce the SAME output (floored to 50 m), so
    // bulgeRatio: 0 did not mean "no bulge".
    const flat = generateLoopWaypoints(waypoints, { bulgeRatio: 0 });
    expect(flat).toHaveLength(3);
    for (const p of flat) {
      expect(p.lat).toBeCloseTo(52.5, 6); // straight along the chord
    }

    const dflt = generateLoopWaypoints(waypoints);
    for (const invalid of [-1, NaN, -Infinity, Infinity]) {
      expect(generateLoopWaypoints(waypoints, { bulgeRatio: invalid })).toEqual(dflt);
    }
  });
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/shared/math/loop.test.ts`
Expected: all four FAIL — NaN propagates to NaN output instead of `[]`, `count: 2.5`
yields an asymmetric pair, `count: 1_000_000` yields a million points, and
`bulgeRatio: 0` yields the same lens as `bulgeRatio: -1`.

- [ ] **Step 3: Implement**

Add near the other constants:

```ts
/** Upper bound on generated points regardless of what the caller asks for: the server's waypoint
 *  array holds 50, and two of those are the real endpoints of the chord being bridged. Independent
 *  of `maxCount`, which the one production caller always supplies but a future one might not
 *  (findings C). */
const MAX_GENERATED_COUNT = 48;
```

Add:

```ts
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
```

Rewrite the top of `generateLoopWaypoints`:

```ts
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
```

Replace the `bulgeRatio` resolution with:

```ts
  // An explicit 0 means no bulge at all — points interpolated straight along the chord — rather
  // than silently becoming the floor as it used to. Anything non-finite or negative is not a
  // meaningful ratio and falls back to the default instead of producing a mirrored or NaN arc.
  const bulgeRatio =
    opts?.bulgeRatio != null && Number.isFinite(opts.bulgeRatio) && opts.bulgeRatio >= 0
      ? opts.bulgeRatio
      : DEFAULT_BULGE_RATIO;
```

and short-circuit the flat case immediately before the `phi`/`radius` computation (a
zero excursion would make `phi` zero, `radius` infinite and every point NaN):

```ts
  if (bulgeRatio === 0) {
    const flat: Waypoint[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      flat.push(unproject({ x: p.x + chord.x * t, y: p.y + chord.y * t }));
    }
    return flat;
  }
```

- [ ] **Step 4: Run the tests, verify they pass, and confirm the two subsumed C items**

Run: `pnpm vitest run tests/shared/math/loop.test.ts && pnpm typecheck`
Expected: PASS. Then confirm by reading the current `loop.ts` that (a) no expression
divides a projected-plane quantity by `chordM` (the haversine one) any more, and (b)
`unproject` is the only exit for coordinates and both clamps are in place. Record both
confirmations in the task report — they are the evidence that C's dimensional-bias and
polar items are closed rather than forgotten.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/math/loop.ts tests/shared/math/loop.test.ts
git commit -m "fix(shared): reject non-finite loop input and give count/bulgeRatio predictable edge behaviour"
```

---

## Phase 4: RouteWizard integration (B1–B4)

`packages/client/src/components/route-wizard/RouteWizard.vue` has **zero** test
coverage today — there is no `tests/client/components/route-wizard/` directory at
all. Task 7 builds the harness; Tasks 8–11 each use it for one red-green cycle. All
four are client changes, so all four carry a `mobile-viewport-check` obligation.

---

### Task 7: Test harness for `RouteWizard.vue`

**Files:**
- Create: `tests/client/components/route-wizard/RouteWizard.test.ts` (new directory)
- Modify: `tests/client/components/run/RunDetail.test.ts` (one misleading comment)

**Interfaces:**
- Consumes: `RouteWizard` from `~client/components/route-wizard/RouteWizard.vue`;
  `mountWithProviders` from `tests/client/helpers/mountWithProviders`; the real
  `generateLoopWaypoints` from `@liftr/shared` (deliberately not mocked — Phase 1's
  geometry is the thing being integrated).
- Produces: the mount helper, stubs and fake-timer conventions Tasks 8–11 build on.
  Closest existing pattern to copy:
  `tests/client/components/routine-wizard/RoutineWizard.test.ts` (`vi.hoisted` mock
  fns, `vi.mock` of the store, a `SheetModalStub` with a `dismiss()` method,
  `mountWithProviders`). This file additionally needs `vi.useFakeTimers()` to drive
  the 400 ms debounce and a `RouteMapEditor` stub, because the real one imports
  `leaflet`.

**Before writing any test: confirm the real template selectors.** Everything below
uses `input.name-input`, `.loop-toggle input`, and `button.btn-primary` as the name
field, loop checkbox, and save button — these are inferred from the component's
purpose and German copy ("Speichern", "Schleife schließen"), not confirmed against
the live template, since neither exploration pass that fed this plan quoted the
template block verbatim (only the script section was). **First action of this task:**
open `packages/client/src/components/route-wizard/RouteWizard.vue`'s `<template>`
block and read the actual markup around the name `<input>`, the loop `<input
type="checkbox">`, and the save `<button>`. If the real classes/structure differ from
the three selectors above, update every occurrence in this task and Tasks 8–11 to
match — do not adjust the plan's intent (which element each selector targets), only
the literal selector string.

**Characterisation, not TDD.** Like Task 4, this task's tests are expected to pass on
arrival — they pin the behaviour Tasks 8–11 must *not* break while they change four
other behaviours. The red step for those four lives in their own tasks.

- [ ] **Step 1: Write the harness and the characterisation tests**

Create `tests/client/components/route-wizard/RouteWizard.test.ts`:

```ts
// RouteWizard.vue owns a debounced lifecycle (400 ms) across three collaborators: the loop
// generator (@liftr/shared, left REAL here — the point of this file is the integration), the
// planned-route API (mocked: previewPlannedRoute and getPlannedRouteDetail both hit the network)
// and the planned-route store (mocked: create/update hit the network and reload the list).
// RouteMapEditor is stubbed because the real one imports leaflet and needs a live DOM map; only its
// add/move/remove emit contract matters to this component's logic. SheetModal is stubbed the same
// way RoutineWizard.test.ts and RunDetail.test.ts stub it — see tests/README.md on stubbing an
// Ionic-backed element rather than loading the real Stencil runtime.
//
// Fake timers are load-bearing, not a speed-up: the 400 ms debounce is exactly what findings B1-B3
// are about, and every test here needs to control whether it has fired.
//
// Selectors below (input.name-input, .loop-toggle input, button.btn-primary) were confirmed
// against the real template as this task's first step — see the task's own note if they ever
// drift from the component again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import RouteWizard from "~client/components/route-wizard/RouteWizard.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const { createMock, updateMock, previewMock, detailMock, sheetDismissSpy } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  previewMock: vi.fn(),
  detailMock: vi.fn(),
  sheetDismissSpy: vi.fn(),
}));

vi.mock("~client/stores/plannedRouteStore", () => ({
  usePlannedRouteStore: () => ({ create: createMock, update: updateMock }),
}));
vi.mock("~client/services/plannedRouteService", () => ({
  previewPlannedRoute: previewMock,
  getPlannedRouteDetail: detailMock,
}));

const SheetModalStub = defineComponent({
  emits: ["close"],
  methods: {
    dismiss() {
      sheetDismissSpy();
      this.$emit("close");
    },
  },
  template: `<div class="sheet-stub"><slot name="header" /><div class="sheet-body"><slot /></div></div>`,
});

const RouteMapEditorStub = defineComponent({
  name: "RouteMapEditor",
  props: ["waypoints", "routedPoints", "approximate", "initialCenter"],
  emits: ["add", "move", "remove"],
  template: `<div class="map-stub" :data-count="waypoints.length"></div>`,
});

function mountWizard(props: Record<string, unknown> = {}) {
  return mountWithProviders(RouteWizard, {
    props,
    global: { stubs: { SheetModal: SheetModalStub, RouteMapEditor: RouteMapEditorStub } },
  });
}

/** ~700 m apart in Berlin — comfortably over the generator's 50 m minimum chord. */
const A = { lat: 52.5, lon: 13.4 };
const B = { lat: 52.5045, lon: 13.412 };
const C = { lat: 52.506, lon: 13.4 };

type Wrapper = ReturnType<typeof mountWizard>;

function map(wrapper: Wrapper) {
  return wrapper.findComponent(RouteMapEditorStub);
}
function waypointsOf(wrapper: Wrapper): { lat: number; lon: number; gen?: boolean }[] {
  return map(wrapper).props("waypoints") as { lat: number; lon: number; gen?: boolean }[];
}
async function tap(wrapper: Wrapper, waypoint: { lat: number; lon: number }) {
  map(wrapper).vm.$emit("add", waypoint);
  await wrapper.vm.$nextTick();
}
async function settle(wrapper: Wrapper) {
  await vi.advanceTimersByTimeAsync(400);
  await wrapper.vm.$nextTick();
}
async function setName(wrapper: Wrapper, value: string) {
  await wrapper.find("input.name-input").setValue(value);
}

beforeEach(() => {
  vi.useFakeTimers();
  createMock.mockReset().mockResolvedValue({ id: "route-1" });
  updateMock.mockReset().mockResolvedValue(undefined);
  previewMock.mockReset().mockResolvedValue({
    points: [],
    distanceM: 1234,
    elevationGainM: null,
    geometrySource: "straight",
  });
  detailMock.mockReset().mockResolvedValue({ points: [] });
  sheetDismissSpy.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("RouteWizard loop arc lifecycle", () => {
  it("generates the arc once the debounce settles, not on the tap itself", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    expect(waypointsOf(wrapper).filter((w) => w.gen)).toHaveLength(0);

    await settle(wrapper);

    expect(waypointsOf(wrapper).filter((w) => w.gen).length).toBeGreaterThan(0);
  });

  it("waits for the user to stop tapping before deciding what the arc bridges", async () => {
    // Why generateArcIfNeeded rides the debounce at all: closeLoop defaults to true, so generating
    // on the 2nd tap would bridge only the first two points and ignore everything placed after.
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await vi.advanceTimersByTimeAsync(200);
    await tap(wrapper, B);
    await vi.advanceTimersByTimeAsync(200);
    expect(waypointsOf(wrapper).filter((w) => w.gen)).toHaveLength(0);

    await tap(wrapper, C);
    await settle(wrapper);

    const generated = waypointsOf(wrapper).filter((w) => w.gen);
    expect(generated.length).toBeGreaterThan(0);
    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(3);
  });

  it("strips the generated points when the loop toggle is switched off", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(true);

    await wrapper.find(".loop-toggle input").setValue(false);

    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(false);
  });

  it("saves the user's waypoints, the generated arc, and a closing copy of the first point", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Feierabendrunde");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    const [name, saved] = createMock.mock.calls[0]!;
    expect(name).toBe("Feierabendrunde");
    expect(saved.length).toBeGreaterThan(3);
    expect(saved[0]).toMatchObject({ lat: A.lat, lon: A.lon });
    expect(saved[saved.length - 1]).toMatchObject({ lat: A.lat, lon: A.lon });
  });

  it("hydrates a saved closed loop by stripping the duplicate closing point", async () => {
    const wrapper = mountWizard({
      route: {
        id: "route-1",
        name: "Gespeichert",
        orderIndex: 0,
        waypoints: [A, B, { ...A }],
        distanceM: 2000,
        elevationGainM: null,
        geometrySource: "straight",
        computedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        polyline: [],
      },
    });
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    expect(waypointsOf(wrapper)).toHaveLength(2);
    expect((wrapper.find(".loop-toggle input").element as HTMLInputElement).checked).toBe(true);
  });
});
```

- [ ] **Step 2: Run the file, expect it to pass**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: PASS. If the hydrate test hangs or the checkbox assertion fails, check the
`detailMock` resolution first — `hydrateFrom` awaits `getPlannedRouteDetail` and
swallows its rejection, so an unmocked rejection is silent. Getting this harness
genuinely green is the entire deliverable of this task; do not proceed to Task 8 with
a skipped test in it.

- [ ] **Step 3: Fix the now-outdated comment in `RunDetail.test.ts`**

`tests/client/components/run/RunDetail.test.ts:96` claims the wizard is "covered by
RouteWizard's own tests" — which was false when written (no such file existed) and
becomes true as of Step 1. Update it to point at the real file:

```ts
// RouteWizard.vue pulls in plannedRouteStore/RouteMapEditor/leaflet — stubbed here since this
// file only tests that RunDetail opens it with the right seed props, not the wizard itself
// (covered by tests/client/components/route-wizard/RouteWizard.test.ts).
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean. The new file is type-checked by `packages/client/tsconfig.test.json`
(`include: ["src", "../../tests/client"]`), so `props("waypoints")` casts and stub
prop types are real errors here, not warnings.

- [ ] **Step 5: Commit**

```bash
git add tests/client/components/route-wizard/RouteWizard.test.ts tests/client/components/run/RunDetail.test.ts
git commit -m "test(client): add the first RouteWizard tests and correct RunDetail's coverage note"
```

---

### Task 8: B1 — `save()` guarantees the arc exists before building the payload

**Files:**
- Modify: `packages/client/src/components/route-wizard/RouteWizard.vue`
- Test: `tests/client/components/route-wizard/RouteWizard.test.ts`

**Interfaces:**
- Consumes: the harness from Task 7, `generateArcIfNeeded()` (existing, unchanged
  behaviour).
- Produces: no new exports. One added call at the top of `save()`.

**Design note.** The debounce exists for a reason worth preserving, spelled out in
`generateArcIfNeeded`'s own doc comment: `closeLoop` defaults to true on a new route,
so generating eagerly on the second tap would bridge only the first two waypoints and
ignore every point placed afterwards, because gen points once present are never
regenerated. That reason is about *taps still to come*. At the moment the user clicks
"Speichern" there are none — so flushing the arc there doesn't weaken the debounce, it
completes it. `generateArcIfNeeded` is already idempotent (it no-ops when a gen point
exists), so the pending timer is deliberately left running: cancelling it would also
cancel the `runPreview()` the user still wants if the save fails and they stay in the
sheet.

- [ ] **Step 1: Write the failing test**

Append to `tests/client/components/route-wizard/RouteWizard.test.ts`:

```ts
describe("RouteWizard save (findings B1)", () => {
  it("generates the arc before saving when the user saves inside the debounce window", async () => {
    // A completely normal quick-create: two taps and Speichern within 400 ms. The old save() read
    // effectiveWaypoints synchronously while the arc's timer was still pending, so the route
    // persisted as [A, B, copyOfA] — a straight closing line with the box checked. Permanent,
    // because hydrateFrom deliberately never synthesises a missing arc on reload.
    const wrapper = mountWizard();
    await setName(wrapper, "Schnellrunde");
    await tap(wrapper, A);
    await tap(wrapper, B);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    const saved = createMock.mock.calls[0]![1] as { gen?: boolean }[];
    expect(saved.filter((w) => w.gen).length).toBeGreaterThan(0);
    expect(saved.length).toBeGreaterThan(3);
  });

  it("does not generate a second arc when one already exists at save time", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Schon fertig");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const beforeSave = waypointsOf(wrapper).filter((w) => w.gen).length;

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    const saved = createMock.mock.calls[0]![1] as { gen?: boolean }[];
    expect(saved.filter((w) => w.gen)).toHaveLength(beforeSave);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: the first test FAILS — `createMock` receives 3 waypoints with no `gen: true`
among them. The second should already PASS (it guards the idempotence the fix relies
on).

- [ ] **Step 3: Implement**

In `packages/client/src/components/route-wizard/RouteWizard.vue`, in `save()`,
immediately after the `canSave` guard:

```ts
async function save() {
  if (!canSave.value) return;
  // The arc normally lands on the 400 ms debounce (see generateArcIfNeeded's doc for why it can't
  // fire straight from onAdd). Saving is the one moment where waiting for it is pointless — there
  // are no more taps coming — and where skipping it is destructive: effectiveWaypoints would be
  // read with the timer still pending and the route would persist as a straight closing line with
  // "Schleife schließen" checked, which hydrateFrom then never repairs (findings B1). This call is
  // a no-op when an arc already exists, and the pending timer is deliberately left running so its
  // runPreview() still refreshes the sheet if the save fails.
  generateArcIfNeeded();
  saving.value = true;
  // ...unchanged from here
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: PASS, including every Task 7 characterisation test.

- [ ] **Step 5: Manual verification + mobile-viewport-check**

Run `node scripts/dev-up.mjs --id loop-b1-save`, set the owner password on the
first-run screen, open the Strecken tab, tap "Neue Strecke", type a name, place two
waypoints and hit "Speichern" **immediately** (inside 400 ms). Reopen the saved route
and confirm the map shows a bulging return leg with outlined (generated) markers, not
a straight line back. Then `node scripts/dev-down.mjs --id loop-b1-save`. Run the
**mobile-viewport-check** skill on `RouteWizard.vue` — this task changes no template
or style, so the check is confirming nothing regressed at 375×667, not reviewing a new
layout.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/route-wizard/RouteWizard.vue tests/client/components/route-wizard/RouteWizard.test.ts
git commit -m "fix(client): generate the loop arc before saving instead of racing the preview debounce"
```

---

### Task 9: B2 — a deleted arc stays deleted

**Files:**
- Modify: `packages/client/src/components/route-wizard/RouteWizard.vue`
- Test: `tests/client/components/route-wizard/RouteWizard.test.ts`

**Interfaces:**
- Produces: a new `const arcDismissed = ref(false)` with a defined lifecycle;
  `generateArcIfNeeded` and `onRemove` and `setCloseLoop` and `hydrateFrom` all
  participate in it. Task 10's `onAdd` reads it.

**Design note — the state and its lifecycle.** The current guard is
`waypoints.value.some(w => w.gen)`, which conflates two different situations: *no arc
exists yet* (generate one) and *the user removed the arc* (don't). One boolean
separates them.

- **Set to `true`** in `onRemove`, when the removed waypoint had `gen: true`. Removing
  *any* generated point — not just the last one — is the user editing the arc, and an
  edited arc must not be silently replaced. This is stricter than the minimum needed
  to fix the reported symptom, and deliberately so: the reported repro only removes
  the last one, but replacing two remaining hand-kept points would be the same
  violation of the code's own promise ("gen points, once present, are never
  regenerated").
- **Reset to `false`** in exactly two places: `hydrateFrom` (a different route, or a
  reset to a blank one, starts a fresh lifecycle) and `setCloseLoop(true)` (the user
  explicitly asking for a loop again). The toggle is the discoverable affordance for
  "give me the arc back" — it already exists, it is already labelled, and it already
  strips on the way off, so off-then-on is a natural "regenerate" gesture.
- **Not reset** by adding, moving, or removing user waypoints. A dismissal is a
  statement about the loop feature, not about that particular arc.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("RouteWizard arc dismissal (findings B2)", () => {
  async function removeAt(wrapper: Wrapper, index: number) {
    map(wrapper).vm.$emit("remove", index);
    await wrapper.vm.$nextTick();
  }

  it("does not regenerate the arc after the user deletes its points one by one", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const withArc = waypointsOf(wrapper);
    const genCount = withArc.filter((w) => w.gen).length;
    expect(genCount).toBeGreaterThan(0);

    // Remove every generated point, pausing long enough between each for the debounce to settle —
    // exactly the pattern in the report. The old guard flipped the moment the last one went and a
    // brand-new arc appeared ~400 ms later, silently undoing the deletions.
    for (let i = 0; i < genCount; i++) {
      const idx = waypointsOf(wrapper).findIndex((w) => w.gen);
      await removeAt(wrapper, idx);
      await settle(wrapper);
    }

    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(false);
    expect(waypointsOf(wrapper)).toHaveLength(2);
  });

  it("keeps the points the user chose to keep when they delete only part of the arc", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const genCount = waypointsOf(wrapper).filter((w) => w.gen).length;

    await removeAt(wrapper, waypointsOf(wrapper).findIndex((w) => w.gen));
    await settle(wrapper);

    expect(waypointsOf(wrapper).filter((w) => w.gen)).toHaveLength(genCount - 1);
  });

  it("brings a fresh arc back when the user toggles the loop off and on again", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    await removeAt(wrapper, waypointsOf(wrapper).findIndex((w) => w.gen));
    await settle(wrapper);

    await wrapper.find(".loop-toggle input").setValue(false);
    await wrapper.find(".loop-toggle input").setValue(true);
    await settle(wrapper);

    expect(waypointsOf(wrapper).filter((w) => w.gen).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: the first test FAILS (after the last gen point is removed, `settle`
regenerates a full arc, so the final array has 5 entries, not 2). The second and
third should pass already — they are the regressions the fix must not cause.

- [ ] **Step 3: Implement**

In `RouteWizard.vue`, add next to `closeLoop`:

```ts
/** Set once the user removes a generated point, which is the only way to tell "no arc has been
 *  generated yet" apart from "the user looked at the arc and threw it away". Without the
 *  distinction, `generateArcIfNeeded`'s `some(w => w.gen)` guard flips back the moment the last
 *  generated point is deleted and a brand-new arc reappears ~400 ms later, silently undoing the
 *  deletion and contradicting this file's own promise that gen points are never regenerated
 *  (findings B2). Cleared only by hydrating a different route, or by the user explicitly asking for
 *  a loop again via the toggle — not by further tapping, since a dismissal is a statement about the
 *  feature, not about one particular arc. */
const arcDismissed = ref(false);
```

Change the guard:

```ts
function generateArcIfNeeded() {
  if (!closeLoop.value || arcDismissed.value || waypoints.value.some((w) => w.gen)) return;
```

Change `onRemove`:

```ts
function onRemove(index: number) {
  if (waypoints.value[index]?.gen) arcDismissed.value = true;
  waypoints.value = waypoints.value.filter((_, i) => i !== index);
  schedulePreview();
}
```

In `setCloseLoop`, clear the flag on the way on:

```ts
function setCloseLoop(checked: boolean) {
  closeLoop.value = checked;
  if (checked) {
    // Ticking the box is the user asking for a loop, which overrides an earlier dismissal — it's
    // also the only affordance in this sheet for getting a discarded arc back.
    arcDismissed.value = false;
    generateArcIfNeeded();
  } else if (waypoints.value.some((w) => w.gen)) {
    waypoints.value = waypoints.value.filter((w) => !w.gen);
  }
}
```

In `hydrateFrom`, reset it in **both** branches — immediately after `name.value =
props.seedName ?? ""` in the null branch, and immediately after `name.value =
route.name` in the loaded branch:

```ts
  arcDismissed.value = false;
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Manual verification + mobile-viewport-check**

`node scripts/dev-up.mjs --id loop-b2-dismiss`: create a route with two waypoints,
wait for the arc, tap each outlined generated marker twice (tap-to-arm,
tap-to-confirm) to remove them one at a time with a pause between each, and confirm
none reappear. Then untick and re-tick "Schleife schließen" and confirm a fresh arc
appears. `node scripts/dev-down.mjs --id loop-b2-dismiss`. Run the
**mobile-viewport-check** skill.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/route-wizard/RouteWizard.vue tests/client/components/route-wizard/RouteWizard.test.ts
git commit -m "fix(client): stop regenerating the loop arc after the user deletes it"
```

---

### Task 10: B3 — late taps rebuild the trailing arc instead of landing behind it

**Files:**
- Modify: `packages/client/src/components/route-wizard/RouteWizard.vue`
- Test: `tests/client/components/route-wizard/RouteWizard.test.ts`

**Interfaces:**
- Consumes: `arcDismissed` from Task 9.
- Produces: a rewritten `onAdd`. No new exports.

**Design note.** `onAdd` appends unconditionally, so a tap that lands after the arc
has generated produces `[user, user, gen, gen, gen, user, user]` — the route visits
the arc, jumps back out to the newer taps, then closes. Two rules fix it:
1. **If an arc exists and wasn't dismissed:** strip the whole generated block and
   append the new point. The debounce then rebuilds the arc from the full updated
   path, which is strictly better than keeping a stale one — it was computed from a
   different final waypoint and therefore a different approach heading.
2. **If the arc was dismissed:** the remaining generated points are ones the user
   deliberately kept, so they are now effectively the user's own return leg and must
   not be destroyed. Insert the new tap *after the last non-generated waypoint*
   instead, which keeps the ordering sane without touching them.

Rule 2's index scan must use a reverse loop or `reduce` — `Array.prototype.
findLastIndex` is ES2023 and `lib` is ES2022.

Deliberately **not** changed here: `onMove`. Dragging the last user waypoint also
invalidates the arc's approach heading, but no finding reports it, and regenerating on
drag would fight the "place once, then edit freely" model the module doc describes.
Left alone on purpose; note it in the report.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("RouteWizard late taps (findings B3)", () => {
  async function removeAt(wrapper: Wrapper, index: number) {
    map(wrapper).vm.$emit("remove", index);
    await wrapper.vm.$nextTick();
  }

  it("never leaves a generated point ahead of a user-placed one", async () => {
    // tap, tap, pause (arc generates), tap again — the old onAdd appended after the gen block and
    // generateArcIfNeeded no-opped for the rest of the session, producing a visible zigzag that
    // saved without error.
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    expect(waypointsOf(wrapper).some((w) => w.gen)).toBe(true);

    await tap(wrapper, C);
    await settle(wrapper);

    const list = waypointsOf(wrapper);
    const lastUser = list.reduce((acc, w, i) => (w.gen ? acc : i), -1);
    const firstGen = list.findIndex((w) => w.gen);
    expect(firstGen).toBeGreaterThan(lastUser);
    expect(list.filter((w) => !w.gen)).toHaveLength(3);
  });

  it("rebuilds the arc from the updated path rather than keeping the stale one", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const before = waypointsOf(wrapper).filter((w) => w.gen);

    await tap(wrapper, C);
    await settle(wrapper);
    const after = waypointsOf(wrapper).filter((w) => w.gen);

    expect(after.length).toBeGreaterThan(0);
    expect(after[0]).not.toEqual(before[0]);
  });

  it("keeps a dismissed arc's surviving points in place when a new waypoint is tapped", async () => {
    const wrapper = mountWizard();
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);
    const genCount = waypointsOf(wrapper).filter((w) => w.gen).length;
    await removeAt(wrapper, waypointsOf(wrapper).findIndex((w) => w.gen));
    await settle(wrapper);

    await tap(wrapper, C);
    await settle(wrapper);

    const list = waypointsOf(wrapper);
    expect(list.filter((w) => w.gen)).toHaveLength(genCount - 1);
    const lastUser = list.reduce((acc, w, i) => (w.gen ? acc : i), -1);
    const firstGen = list.findIndex((w) => w.gen);
    expect(firstGen).toBeGreaterThan(lastUser);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: the first two FAIL (the new tap lands at the end, so `firstGen < lastUser`,
and the gen block is unchanged). The third FAILS too, for the same ordering reason.

- [ ] **Step 3: Implement**

Replace `onAdd` in `RouteWizard.vue`:

```ts
function onAdd(waypoint: Waypoint) {
  if (!arcDismissed.value && waypoints.value.some((w) => w.gen)) {
    // A new tap after the arc has already generated invalidates it twice over: appending behind it
    // would make the route visit the arc and then jump back out to the new point (a zigzag that
    // saves without complaint — findings B3), and the arc was computed from a different final
    // waypoint and therefore a different approach heading. Drop it; the debounce rebuilds it from
    // the full updated path.
    waypoints.value = [...waypoints.value.filter((w) => !w.gen), waypoint];
  } else {
    // The arc was dismissed, so any surviving generated points are ones the user deliberately kept
    // — effectively their own return leg now. Slot the new tap in after the last point they placed
    // rather than destroying them. (reduce, not findLastIndex: lib is ES2022.)
    const lastUserIdx = waypoints.value.reduce((acc, w, i) => (w.gen ? acc : i), -1);
    waypoints.value = [
      ...waypoints.value.slice(0, lastUserIdx + 1),
      waypoint,
      ...waypoints.value.slice(lastUserIdx + 1),
    ];
  }
  schedulePreview();
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: PASS, all tests. The Task 7 test `"waits for the user to stop tapping"` is
the important regression anchor here — the strip-and-rebuild path must not fire
before an arc exists.

- [ ] **Step 5: Manual verification + mobile-viewport-check**

`node scripts/dev-up.mjs --id loop-b3-latetap`: place two waypoints, wait for the arc
to appear, then place two more. Confirm the drawn line runs through all four user
markers *first* and only then through the outlined generated ones — no jump back out.
`node scripts/dev-down.mjs --id loop-b3-latetap`. Run the **mobile-viewport-check**
skill.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/route-wizard/RouteWizard.vue tests/client/components/route-wizard/RouteWizard.test.ts
git commit -m "fix(client): rebuild the trailing loop arc when new waypoints are tapped after it"
```

---

### Task 11: B4 — client-side waypoint cap and a save error that says something true

**Files:**
- Modify: `packages/client/src/components/route-wizard/RouteWizard.vue`
- Test: `tests/client/components/route-wizard/RouteWizard.test.ts`

**Interfaces:**
- Consumes: `ApiError` from `~client/lib/api` (already carries `status` and the
  server's `detail` — `packages/client/src/lib/api.ts:24-34`, and `AuthGate.vue`
  already uses it exactly this way).
- Produces: `maxUserWaypoints` computed; a widened `canSave`; a rejecting `onAdd`; a
  `saveErrorMessage(err)` helper. Template gains a `n/max` counter with a `.warn`
  class.

**Design note.** Two halves, and the first makes the second nearly unreachable —
which is the point.

*Soft cap.* The server accepts 50 waypoints. `effectiveWaypoints` adds one closing
point, and the loop generator wants 3 more, so the honest user-facing budget is `50 −
1 − 3 = 46` with the loop on and `50` with it off. Between ~46 and 49 user points
today the arc silently shrinks to nothing while the box stays checked; at 50 the save
fails with a 400. Rejecting the 47th tap with a named limit replaces a silent
degradation with a statement. `canSave` additionally refuses to submit an over-length
array at all, which covers the path where a user toggles the loop *on* with 48 points
already placed.

*Error copy.* The server's `detail` is Zod's English message — diagnostic, not user
copy, and this is a German UI. So: branch on status, give each a German sentence that
is actually true for that case, and `console.warn` the detail for anyone debugging.
The generic "bitte erneut versuchen" stays only for the case where retrying might
genuinely help; on a 400 it never will, which is precisely what made the old message
"actively wrong".

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("RouteWizard waypoint cap and save errors (findings B4)", () => {
  async function tapMany(wrapper: Wrapper, n: number) {
    for (let i = 0; i < n; i++) {
      // A grid of distinct points, all well inside Berlin and all >50 m apart.
      await tap(wrapper, { lat: 52.5 + i * 0.001, lon: 13.4 + (i % 7) * 0.001 });
    }
  }

  it("refuses the tap that would exceed the waypoint budget and says so", async () => {
    const wrapper = mountWizard();
    await tapMany(wrapper, 46);
    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(46);

    await tap(wrapper, { lat: 52.6, lon: 13.5 });

    expect(waypointsOf(wrapper).filter((w) => !w.gen)).toHaveLength(46);
    expect(wrapper.text()).toContain("46");
  });

  it("never builds a payload longer than the server's 50-waypoint limit", async () => {
    const wrapper = mountWizard();
    await setName(wrapper, "Lang");
    await tapMany(wrapper, 46);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect((createMock.mock.calls[0]![1] as unknown[]).length).toBeLessThanOrEqual(50);
  });

  it("tells the user a rejected save will not succeed on retry", async () => {
    const { ApiError } = await import("~client/lib/api");
    createMock.mockRejectedValue(new ApiError("POST failed: 400", 400, "Array must contain at most 50 element(s)"));
    const wrapper = mountWizard();
    await setName(wrapper, "Abgelehnt");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    const { toasts } = await import("~client/composables/useToast").then((m) => m.useToast());
    expect(toasts.map((t) => t.text).join(" ")).toContain("abgelehnt");
    expect(toasts.map((t) => t.text).join(" ")).not.toContain("bitte erneut versuchen");
  });

  it("still offers a retry for a transient failure", async () => {
    createMock.mockRejectedValue(new Error("network down"));
    const wrapper = mountWizard();
    await setName(wrapper, "Netzfehler");
    await tap(wrapper, A);
    await tap(wrapper, B);
    await settle(wrapper);

    await wrapper.find("button.btn-primary").trigger("click");
    await vi.runAllTimersAsync();

    const { toasts } = await import("~client/composables/useToast").then((m) => m.useToast());
    expect(toasts.map((t) => t.text).join(" ")).toContain("bitte erneut versuchen");
  });
});
```

Note: `useToast`'s `toasts` is module-level reactive state shared across tests (same
pattern `RoutineWizard.test.ts` uses). If the toast assertions bleed between tests,
splice the array in `beforeEach` rather than restructuring the tests.

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts`
Expected: the cap test FAILS (nothing caps tapping — the 47th point lands), and the
400 test FAILS (the generic toast fires for every error). The payload-length and
transient-failure tests should pass already.

- [ ] **Step 3: Implement**

In `RouteWizard.vue`, extend the import from `../../lib/api`:

```ts
import { ApiError } from "../../lib/api";
```

Add below `SERVER_MAX_WAYPOINTS`:

```ts
/** How many points the generator asks for by default — mirrors @liftr/shared's DEFAULT_COUNT.
 *  Reserved out of the budget below so the return-leg bulge doesn't silently thin out and vanish
 *  as the user approaches the server's cap (findings B4). */
const RESERVED_ARC_WAYPOINTS = 3;

/** The user's own budget: the server's 50 minus the synthetic closing point and the arc's own
 *  points when the loop is on. Enforced on the way in (onAdd below) rather than discovered on the
 *  way out as a 400 that no amount of retrying will fix. */
const maxUserWaypoints = computed(() =>
  closeLoop.value ? SERVER_MAX_WAYPOINTS - 1 - RESERVED_ARC_WAYPOINTS : SERVER_MAX_WAYPOINTS,
);
const userWaypointCount = computed(() => waypoints.value.filter((w) => !w.gen).length);
```

Widen `canSave` — this is the backstop for the path where the loop is toggled *on*
over an already-long route:

```ts
const canSave = computed(
  () => name.value.trim().length > 0 && userWaypointCount.value >= 2 && effectiveWaypoints.value.length <= SERVER_MAX_WAYPOINTS,
);
```

Guard `onAdd` (first statement in the function, before either branch):

```ts
  if (userWaypointCount.value >= maxUserWaypoints.value) {
    toast(`Maximal ${maxUserWaypoints.value} Wegpunkte — entferne zuerst einen Punkt.`);
    return;
  }
```

Add the error mapper next to `save()`:

```ts
/** The server's 400 body carries Zod's own English message as `detail` (see app.ts's error
 *  handler) — diagnostic, not user copy, and this UI is German. So: a German sentence chosen by
 *  status, and the detail to the console for whoever is debugging. The old catch-all told the user
 *  to try again for every failure, which is actively wrong on a 400: the same waypoints fail
 *  identically every time (findings B4). */
function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detail) console.warn("Strecke abgelehnt:", err.status, err.detail);
    if (err.status === 400) return "Strecke abgelehnt — zu viele oder ungültige Wegpunkte.";
    if (err.status === 429) return "Zu viele Anfragen — bitte kurz warten.";
  }
  return "Speichern fehlgeschlagen — bitte erneut versuchen.";
}
```

and use it: `} catch (err) { toast(saveErrorMessage(err)); }`.

In the template, replace the waypoint-count stat:

```vue
          <span :class="{ 'stat-warn': userWaypointCount >= maxUserWaypoints - 5 }">
            {{ userWaypointCount >= maxUserWaypoints - 5 ? `${userWaypointCount}/${maxUserWaypoints}` : userWaypointCount }}
            Wegpunkte
          </span>
```

and add to the scoped styles, beside `.stats`:

```css
/* Only appears in the last five waypoints before the cap — the footer row is tight on a 375px
   viewport, so the counter stays a plain number until the limit is actually relevant. */
.stat-warn {
  color: var(--danger);
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm vitest run tests/client/components/route-wizard/RouteWizard.test.ts && pnpm typecheck && pnpm lint`
Expected: all clean.

- [ ] **Step 5: Manual verification + mobile-viewport-check**

`node scripts/dev-up.mjs --id loop-b4-cap`: tap rapidly until the counter switches to
`41/46` in red, keep going to `46/46`, and confirm the next tap is refused with the
toast rather than silently added. Untick "Schleife schließen" and confirm the budget
rises to 50. Check the footer row at 375×667 — the counter, the "Schleife schließen"
label and its 44 px tap target all have to stay on one line without wrapping or
clipping. Then `node scripts/dev-down.mjs --id loop-b4-cap`. Run the
**mobile-viewport-check** skill on `RouteWizard.vue`; this is the one task in Phase 4
with a real template and style change, so this check is a review, not just a
confirmation.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/route-wizard/RouteWizard.vue tests/client/components/route-wizard/RouteWizard.test.ts
git commit -m "fix(client): cap waypoints before the server does and report why a save was rejected"
```

---

## Phase 5: Documentation

Three tasks: the honest write-up of what the function still cannot do (A5 and the
two-waypoint case), the ADR for the algorithm change, and closing out the findings
report itself.

---

### Task 12: Module documentation for `loop.ts` — including what it still can't do (A5)

**Files:**
- Modify: `packages/shared/src/math/loop.ts` (comments only — **no behaviour change
  in this task**)

**Interfaces:**
- Produces: a rewritten module header and a rewritten `generateLoopWaypoints` JSDoc.
  No code.

**Design note — A5 is a documentation task on purpose.** The report is explicit: the
generator "only knows lat/lon in a flat local plane; it has no concept of 'is this
walkable'", and the Chiemsee (all three points in open lake water) and Lauterbrunnen
(points 1,473 m up a valley wall) reproductions are not arithmetic errors. Fixing them
needs a terrain/water data source — OSM water polygons or a DEM — which this app does
not have and which is not something to fake with a heuristic. A plausible-looking
"avoid water" guess that is wrong half the time is worse than a documented limitation,
because it removes the user's reason to check. So: write it down, in the place the
next person will read, and stop.

- [ ] **Step 1: Rewrite the module header**

Replace the file's opening block comment in `packages/shared/src/math/loop.ts`:

```ts
/**
 * Generates the intermediate waypoints for a "close the loop" return leg — placed once, then
 * edited like any other waypoint (dragged, removed) rather than regenerated live. Used by the
 * route wizard's "Schleife schließen" toggle: without this, closing a loop was a single synthetic
 * point back at the start, which OpenRouteService then routed as the shortest path home — usually
 * the same roads walked out on, not a loop at all.
 *
 * ## The shape
 *
 * The return leg is a **circular arc**, and the circle is picked by the runner's own heading. Let P
 * be the route's last waypoint, Q its first, and û the direction of the last real segment of the
 * path (waypoints[n-2] → waypoints[n-1]). There is exactly one circle through P and Q that leaves P
 * along û; the arc of that circle is the return leg. Its tangent–chord angle φ = ∠(û, chord) also
 * gives its greatest distance from the chord in closed form, (chord/2)·tan(φ/2), which is the one
 * knob this module tunes: zero when the runner is already heading home, a clean semicircle when the
 * start is 90° off their shoulder, and clamped (see clampBulgeM) as it runs away toward "heading
 * directly away from home".
 *
 * That single construction decides both things the previous implementation decided separately and
 * badly: which side of the chord to bulge toward (the side û points to) and what shape to bulge in
 * (an arc that departs along û rather than a symmetric sine hump ignoring it). A route traced
 * partway around a roundabout closes along the roundabout, because the reconstructed circle IS the
 * roundabout.
 *
 * ## The plane
 *
 * Works in a local metric plane (an equirectangular approximation centered on the chord it's
 * bridging) rather than directly in lat/lon degrees, since a degree of longitude shrinks with
 * latitude — arithmetic in raw degrees would bulge east-west loops the wrong amount as you move
 * away from the equator. Longitudes are unwrapped around the route's own start before projecting
 * and wrapped back afterwards, so a route across the ±180° line stays next to itself. The
 * projection is only ever used internally here; every public lat/lon in and out is a real WGS84
 * coordinate, clamped to the ranges the server's waypoint schema accepts.
 *
 * ## What this cannot do
 *
 * **No terrain or water awareness.** This module knows two-dimensional geometry and nothing else —
 * not where the lake is, not where the valley floor ends, not whether there is a bridge. A ferry
 * route across the Chiemsee gets a return leg in open water; an out-and-back along the Lauterbrunnen
 * valley floor gets one part-way up the valley wall. Fixing that needs a real data source (OSM water
 * polygons, a DEM) that this app does not have, and guessing is worse than not guessing: a
 * heuristic that looks plausible removes the user's reason to check the map. The generated points
 * are therefore ordinary editable waypoints by design — the route wizard renders them with a
 * distinct outlined marker and the user can drag or delete any of them.
 *
 * **Two waypoints carry no heading signal.** With exactly two waypoints the only segment in the path
 * IS the chord, so û is exactly anti-parallel to it and points to neither side, and the centroid of
 * two points lies exactly on the line between them. Nothing in the input prefers either side, and no
 * arithmetic can invent a preference. The side is therefore decided by a fixed compass convention
 * (see bulgeNormal), chosen to be tap-order invariant so the same two taps at least always produce
 * the same loop — but which side that is remains arbitrary with respect to the ground. On a coastal
 * path or a riverside route it is a coin flip between open ground and water. A "flip the loop"
 * affordance in the wizard would be the real fix and does not exist yet.
 */
```

- [ ] **Step 2: Rewrite the `generateLoopWaypoints` JSDoc**

```ts
/**
 * Generates `count` waypoints (excluding both endpoints) forming the return leg from the route's
 * last waypoint back toward its first — a circular arc that departs along the direction the runner
 * was already moving and curves back to the start, so the loop encloses new ground instead of
 * folding back over the outbound path. Callers append these between the existing waypoints and the
 * closing point back at the start (mirrors RouteWizard.vue's `effectiveWaypoints` — this function
 * only produces the new interior points). Pure and deterministic: the same input always produces
 * the same output, and the input array is never mutated.
 *
 * Returns `[]` when there's nothing sensible to generate: fewer than 2 input waypoints, any
 * non-finite or out-of-WGS84-range coordinate, a chord shorter than `MIN_CHORD_M`, or a `count`/
 * `maxCount` that leaves no room (the server's 50-waypoint cap, minus the input waypoints and the
 * eventual closing point, already spoken for).
 *
 * @param opts.count      How many interior points to generate. Floored to an integer, clamped to
 *                        `maxCount` and to `MAX_GENERATED_COUNT`.
 * @param opts.maxCount   Upper bound from the caller's own waypoint budget.
 * @param opts.bulgeRatio Excursion as a fraction of the chord, used **only** when the route carries
 *                        no approach-heading signal (a 2-waypoint out-and-back, or an approach
 *                        exactly along the chord). When a heading is available the excursion comes
 *                        from it instead. An explicit `0` means no bulge at all — points
 *                        interpolated straight along the chord; anything negative or non-finite is
 *                        ignored in favour of the default.
 */
```

- [ ] **Step 3: Verify nothing changed but comments**

Run: `git diff --stat packages/shared/src/math/loop.ts && pnpm vitest run tests/shared/math/loop.test.ts && pnpm lint`
Expected: tests PASS unchanged (this task touches no executable line — if a test's
behaviour changes, something other than a comment was edited) and lint clean.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/math/loop.ts
git commit -m "docs(shared): document the heading-tangent loop algorithm and its terrain/two-point limits"
```

---

### Task 13: ADR 0008 — heading-aware circular loop closure

**Files:**
- Create: `docs/adr/0008-heading-aware-loop-closure.md`
- Modify: `docs/adr/README.md` (Index table)

**Interfaces:**
- Produces: `docs/adr/0008-heading-aware-loop-closure.md` and one new row in
  `docs/adr/README.md`'s `## Index` table.

**Does this warrant an ADR?** Yes. `docs/adr/README.md` sets the bar at "anything that
would be painful or awkward to reverse later", and this is a replacement of a
documented heuristic with a different one that changes the shape and the size of every
generated loop — user-visible, argued from a specific trade-off (heading fidelity
against detour size), and carrying a tunable constant (`MAX_BULGE_RATIO`) whose value
only makes sense if you know what it is trading. Without the ADR, the next person to
see a 2.8×-chord return leg will "fix" it by tightening that constant and silently
re-break A6 for the roundabout case.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0008-heading-aware-loop-closure.md`, following the exact format
`docs/adr/README.md` specifies (`# NNNN. Title`, `**Date:**`, `**Status:**`,
`## Context`, `## Decision`, `## Consequences`) and matching the terseness of
`docs/adr/0007-openrouteservice-external-routing-exception.md` — read that file first.
Content:

- **Date:** the date the task is executed. **Status:** Accepted.
- **Context.** "Schleife schließen" generated its return leg as a symmetric sine hump
  across the chord from the route's end back to its start, bulging away from the
  centroid of all waypoints, with a fixed fallback side whenever the centroid sat
  within 5% of the chord. A five-agent bug hunt (`docs/reference/loop-findings.md`)
  found this failed on both of the commonest route shapes: every 2-waypoint
  out-and-back hit the fallback (the centroid of two points is on the chord by
  definition, so tap order decided which side of a coastal path the return leg landed
  on), and ordinary gently-bent routes flipped sides for a 10 m nudge of a mid-route
  waypoint, halving or doubling the enclosed area. Separately and more fundamentally,
  the function never read `waypoints[length-2]` at all, so it had no notion of the
  runner's approach direction — proven structurally: two routes with final approaches
  90° apart, identical start and end, produced byte-identical arcs. The first
  generated point could sit 99° off the runner's heading, which ORS can only reach by
  routing them backwards — the concrete mechanism behind "the loop function just
  sends me backwards".
- **Decision.** Derive the approach heading from the last real segment of the path
  and use it for both the side and the shape: the return leg is the arc of the unique
  circle through the route's end and start that departs the end along that heading.
  Its excursion from the chord is `(chord/2)·tan(φ/2)` for tangent–chord angle φ,
  clamped into a band that is a plain ratio of the chord below a 5 km knee and a
  square root above it. Side selection cascades heading → centroid → a fixed,
  tap-order-invariant compass convention, with no "is the signal strong enough"
  threshold — a sign is ambiguous only at zero, where the two sides are mirror
  images. The public signature is unchanged.
- **Consequences.** Spell out, one short paragraph each: (1) loops get bigger for
  routes ending away from the start — worst case ~2.8× the chord versus ~1.3× before —
  and that is the point, but it will surprise anyone used to the old lens; (2)
  `MAX_BULGE_RATIO = 1.0` is a deliberate trade and tightening it toward the old 0.35
  re-breaks the roundabout continuation the redesign exists to fix; (3) the return leg
  may now self-intersect the outbound path, which a lollipop-shaped loop legitimately
  does; (4) `opts.bulgeRatio` now applies only to the no-heading case, and `0` now
  means zero rather than the old floor; (5) terrain and water are still invisible to
  the generator, and no amount of geometry fixes that — the Chiemsee and
  Lauterbrunnen cases from the findings report stand, which is why generated points
  remain ordinary editable waypoints and why a "flip the loop" affordance in the
  wizard is the outstanding real fix for the two-waypoint case; (6) sampling the arc
  adaptively (more points for a bigger sweep) was deliberately deferred because it
  spends the server's 50-waypoint budget the wizard is already rationing.

- [ ] **Step 2: Add the index row**

In `docs/adr/README.md`'s `## Index` table, append after the 0007 row:

```markdown
| [0008](0008-heading-aware-loop-closure.md) | Heading-aware circular arc for closing a running loop |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0008-heading-aware-loop-closure.md docs/adr/README.md
git commit -m "docs(adr): record the heading-aware circular loop closure decision"
```

---

### Task 14: Close out `docs/reference/loop-findings.md`

**Files:**
- Modify: `docs/reference/loop-findings.md` (currently **untracked** — this task is
  the one that commits it)
- Modify: `docs/features.md`

**Interfaces:**
- Produces: a resolution status against every finding in the report, so the document
  stops reading as an open bug list.

- [ ] **Step 1: Add a resolution note to the report's header**

Immediately after the existing intro paragraph in `docs/reference/loop-findings.md`
(the one ending "it exists to guide a follow-up fix pass"), add:

```markdown
> **Status:** closed out by `docs/superpowers/plans/2026-09-15-loop-generator-fixes.md`. Every
> finding below carries a resolution line. The report itself is left unedited otherwise — its
> measurements, repro snippets and tables are the evidence the fixes were argued and tested from,
> and several of them are quoted directly in `tests/shared/math/loop.test.ts`. See
> `docs/adr/0008-heading-aware-loop-closure.md` for the algorithm decision.
```

- [ ] **Step 2: Mark each finding**

Add one bold **Resolution:** line at the end of each finding's section, stating what
changed and where. Do not edit the findings' bodies. Use these:

- **A1** — Fixed (Phase 1 Tasks 2–3). `DEGENERATE_SIDE_RATIO` deleted; the side comes
  from the approach heading, falls back to the centroid, then to a tap-order-invariant
  compass convention. Covered by the bend-continuity sweep and the Fischland
  tap-order test.
- **A2** — Fixed (Task 1). Longitudes unwrapped around the route's start before
  projecting and wrapped back after; the Taveuni repro is a test.
- **A3** — Fixed (Task 5). The 50 m floor is now `max(10 m, 0.15·chord)`, and for the
  2-waypoint case in the repro the excursion is a plain 35% of the chord with no
  floor involved at all.
- **A4** — Fixed (Task 5). The flat 2000 m cap grows as a square root past a 5 km
  knee: 35% of a 40 km chord instead of 5%.
- **A5** — **Not fixed, by decision.** Documented as an inherent limitation in
  `loop.ts`'s module header and in ADR-0008's consequences. Needs a terrain/water
  data source this app does not have; a heuristic guess would be worse than the
  honest gap.
- **A6** — Fixed (Task 3). The return leg is the circular arc tangent to the approach
  heading; the structural-proof repro is inverted into a test asserting the two
  approaches now produce *different* arcs, and the roundabout case is completed
  along the roundabout.
- **B1** — Fixed (Task 8). `save()` calls `generateArcIfNeeded()` before reading
  `effectiveWaypoints`.
- **B2** — Fixed (Task 9). A new `arcDismissed` flag distinguishes "no arc yet" from
  "the user threw the arc away"; cleared only by hydration or by ticking the toggle
  again.
- **B3** — Fixed (Task 10). `onAdd` strips and rebuilds the trailing arc, or inserts
  after the last user point when the arc was dismissed.
- **B4** — Fixed (Task 11). A 46-waypoint client cap with a German toast and a footer
  counter, plus a status-aware save error that stops telling the user to retry
  something that cannot succeed.
- **C** — Fixed (Task 6) for NaN/Infinity, fractional/negative `count`, `bulgeRatio`
  edge values and the missing upper `count` cap. The dimensional-analysis bias and
  the polar blowup were **subsumed** by Phase 1: the side decision no longer mixes
  projected-plane and great-circle quantities, and `unproject` now floors
  metres-per-degree-of-longitude and clamps its output.
- **D** — Unchanged; still not bugs. `tests/shared/math/loop.test.ts` now pins the
  determinism and duplicate-waypoint cases D depends on. Note the one D item the
  redesign *does* invalidate: "no literal path self-intersection detected" no longer
  holds, because a return leg sweeping past 180° is a lollipop — see ADR-0008.

- [ ] **Step 3: Extend the features doc**

`docs/features.md:120-121` describes planned routes but not the loop toggle. Match
its existing bullet style and append one sentence to that bullet: `Mit „Schleife
schließen" ergänzt die App eine Rückweg-Kurve, die in der Richtung weiterläuft, in der
du unterwegs warst — die gesetzten Punkte lassen sich danach frei verschieben oder
löschen.`

- [ ] **Step 4: Commit**

```bash
git add docs/reference/loop-findings.md docs/features.md
git commit -m "docs: close out the loop-generator findings report and document the loop toggle"
```

---

## Phase 6: Full verification

---

### Task 15: Full verification

**Files:** none (no code changes — this task runs the suite and the manual matrix,
and only touches files if it finds something the review loop should have caught
instead).

- [ ] **Step 1: Full automated suite**

Run, from the repo root: `pnpm typecheck && pnpm lint && pnpm test`.
Expected: all clean. Any failure here is a real regression from one of Tasks 1–14 —
do not silence it; identify which task's change is responsible and treat it as a
finding against that task. Pay particular attention to
`tests/client/components/run/RunDetail.test.ts` (Task 7 edited a comment in it) and
to any other client test that mounts `RouteWizard` transitively.

- [ ] **Step 2: Mobile viewport check**

Run the **mobile-viewport-check** skill across `RouteWizard.vue`'s full surface, even
though Tasks 8–11 each ran it: the footer row now carries a conditional `n/max`
counter beside the "Schleife schließen" label and the whole row has to hold at
375×667 with the 44 px tap targets intact. Confirm the map still fills the remaining
height (the `fill-body` behaviour the component's own header comment depends on) and
that the sheet itself never scrolls.

- [ ] **Step 3: End-to-end walkthrough via `dev-up.mjs`**

Run `node scripts/dev-up.mjs --id loop-fixes-final` (no `LIFTR_ORS_API_KEY` set — a
fresh session exercises the straight-line fallback, which is enough for every row
below; the waypoints the generator produces are what is being checked, not ORS's
rendering of them). Set the owner password on the first-run screen, then walk this
matrix:

| scenario | expected |
|---|---|
| 2 taps, save immediately (<400 ms) | saved route reopens with an outlined arc, not a straight closing line (B1) |
| 2 taps, wait, observe the arc | a lens off to one side; delete and re-tap the same two points in the reverse order → the arc lands on the **same** side (A1) |
| 4 taps curving left, then wait | the arc leaves the last marker roughly continuing that curve, not swinging ~90° across it (A6) |
| trace ~⅓ of a real roundabout, 3 taps | the arc follows the roundabout rather than cutting across its island (A6) |
| delete every generated point, pausing between each | none reappear; untick + re-tick "Schleife schließen" brings a fresh arc back (B2) |
| 2 taps, wait for the arc, then 2 more taps | the drawn line visits all four user markers before any outlined one (B3) |
| tap toward the cap | counter turns red at 41/46, the 47th tap is refused with the German toast; unticking the loop raises the budget to 50 (B4) |
| a ~60 m loop (two taps just over the minimum chord) | the return leg is a modest bulge, not a detour longer than the gap it closes (A3) |
| toggle "Schleife schließen" off then on repeatedly | no duplicated arcs, no leftover generated points (section D must still hold) |
| edit a saved loop, change nothing, save | waypoint count unchanged — no second closing point compounded (section D's hydration case) |

Then `node scripts/dev-down.mjs --id loop-fixes-final`.

Two rows cannot be walked in this environment and must not be claimed: the
**antimeridian** case (A2) and the **polar** case (C) have no reachable UI path — a
map tap near ±180° would require panning the seeded map across the Pacific. Both are
covered by `tests/shared/math/loop.test.ts` only; say so explicitly rather than
implying a manual check.

- [ ] **Step 4: Report**

Summarize: the automated suite's status; which viewports were checked and what the
footer row looked like at each; which rows of the matrix were walked and their
outcome, naming the two that were deliberately left to the unit tests; whether any
finding in `docs/reference/loop-findings.md` is still open after the walkthrough; and
the three behaviour changes from Task 3's Step 5 (bigger loops, possible
self-intersection, coarse sampling on wide sweeps) as known, accepted consequences
rather than defects.

---

### Critical Files for Implementation

- `/home/kirchner/Dokumente/github/liftr/packages/shared/src/math/loop.ts`
- `/home/kirchner/Dokumente/github/liftr/tests/shared/math/loop.test.ts`
- `/home/kirchner/Dokumente/github/liftr/packages/client/src/components/route-wizard/RouteWizard.vue`
- `/home/kirchner/Dokumente/github/liftr/tests/client/components/route-wizard/RouteWizard.test.ts` (to be created)
- `/home/kirchner/Dokumente/github/liftr/docs/reference/loop-findings.md`
