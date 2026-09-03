# Plan C — Full New UI Rebuild for Liftr

A phase-driven plan for building a genuinely new interface for Liftr, rather than patching
the existing one. This is one of three parallel plans; the other two address engagement
additions and standards-fixes to the *existing* UI. This plan is deliberately independent
of the current implementation.

---

## 0. Disclosure

Consistent with `audit/research/lens-2-blind-system-design.md`'s own disclosure, this plan
was written without opening any `.vue` file, any CSS/design-token file, and without driving
or viewing the running Liftr application in a browser. No claim below describes, contrasts
against, or speculates about what the current interface looks like. Where a current-build
failure mode is referenced, it is cited explicitly to `lens-3-design-critique.md`, which
*did* view the live app, as an evidence source this plan is designing away from — never
as "better than what exists," since that comparison was never made.

Screenshots at `examples/liftr/lens-1/*` and `examples/liftr/lens-3/*` were viewed only for
grounding facts (real German copy strings, real content scale — exercise-name length, stat
counts, empty-state copy) as permitted by the task brief, not as a visual spec.

---

## 1. Evidence synthesis

**Primary foundation — `lens-2-blind-system-design.md`:**
Lens-2 derived, purely from schema/services/stores (never from any `.vue`/CSS file or the
running app), a complete product model, IA, screen inventory, density rules, motion system,
engagement model, and state-handling rules. This plan treats lens-2 §2 (product model),
§3 (IA/screen inventory), §4 (density rules), §5 (motion system), §6 (engagement model),
and §7 (onboarding/empty/loading/error/offline states) as the specification to build
against, not to re-derive. Every phase below cites the specific lens-2 section and, where
relevant, the specific schema/service fact underneath it.

Two structural facts from lens-2 anchor the whole plan:
- The codebase enforces, architecturally, a hard split between a "sacred," dozens-per-
  session logging loop (offline-first, fire-and-forget except `finish`) and infrequent
  "planning-desk" actions (online-only, form-like) — lens-2 §2.6, §8.1. This is the spine
  of the IA (§3 below) and the density rules (§4).
- Three data sources are fully modeled and persisted server-side but have **zero client
  consumer today**: `sets.rpe`, `sets.notes`/`workouts.notes`, and the `prs` ledger table
  (lens-2 §2.5). These are real backend capability, not invention — each gets its first-
  ever UI in this plan, called out explicitly per phase as new-pattern work with no
  existing pattern to reference.

**`lens-1-liftoff-comparison.md`** is used only as category context, not as a template:
- Liftoff's motion vocabulary, read from 73 filmstrips, is fast/utilitarian at the micro-
  interaction level (toasts, transitions, chart reveals all resolve sub-600ms) with
  choreography reserved for list-building and an ambient reward-glow loop — notably **no
  confetti/particle/screen-flash was found anywhere in the corpus** (lens-1 §2B). This is
  a data point that "gamified fitness app" does not structurally require celebratory-
  heavy motion; it informs the restraint stance in §2 below.
- Lens-1 §4's comparison table and §5B are used as evidence of what a single-user,
  no-accounts architecture (`packages/server/src/auth.ts`: single bearer token, no
  accounts/sessions) structurally cannot support — leaderboards, friends, public profiles,
  percentile placement — which bounds the engagement phase (Phase 3) to the same
  single-player mechanics lens-2 §6 already scoped.
- Liftr's own already-observed posture (lens-1 §3C items 5, 6, 8, 10 — "nichts gesperrt,"
  an explicit anti-farming plausibility message, no currency/paywall/mascot) is treated as
  one input among several, not as ground truth to preserve, since it comes from viewing
  the current build's copy strings, which this plan is not designing from.

**`lens-3-design-critique.md`** is used exclusively as a list of failure modes to design
away from, cited explicitly wherever a screen spec in this plan addresses one:
- Nav overflow at narrow viewports with no fallback (lens-3 §2.1, Critical) → Phase 0's
  navigation shell spec (§3.0).
- Text wrapping mid-word in an undersized column for long exercise names (lens-3 §2.2,
  High) → every screen in this plan that lists exercise names specifies flex/truncation
  behavior up front.
- Duplicate/ambiguous same-label controls in an empty state (lens-3 §2.2, High) → Phase 2's
  Runs empty-state spec.
- Same state (XP/level) shown twice simultaneously with no visual relationship between the
  two instances (lens-3 §2.3, Medium) → Phase 1's Finish Sequence spec.
- Inconsistent color semantics for "active" state across an otherwise-consistent color
  system (lens-3 §2.3, Medium) → Phase 0's token system commits to single-meaning color
  roles.
- Fixed step-count wizard chrome that doesn't match actual flow behavior (lens-3 §2.3,
  Medium) → Phase 2's routine wizard spec.
- Tap targets below 44px inconsistently applied within one app (lens-3 §2.3, Medium) →
  Phase 0's touch-target token is a hard minimum, not a per-screen judgment call.
- Primary CTAs stranded in the top half of a tall viewport, away from the thumb zone
  (lens-3 §2.4, Low-medium) → Phase 0's layout primitives anchor primary actions to the
  lower third by default.
- A masked password-style field for a non-secret bearer token, and a buried,
  undifferentiated auth-entry point (lens-3 §2.5, Medium) → Phase 4's auth/token screen
  spec.

**General UX research (`uiux-engagement-research.md`)** supplies category-independent
principles cited by name below: progressive disclosure, thumb-zone ergonomics, dark-mode
surface/elevation conventions, motion-duration conventions, Fogg's B=MAP, self-
determination theory's autonomy/competence/relatedness framing, and the peak-end rule.
These ground the *why* behind direction choices in §2 without importing any competitor's
specific visual style.

---

## 2. Design direction

**Statement:** a quiet, utility-first, single-column mobile interface whose visual weight
is allocated almost entirely to the logging loop's readability and speed, with a dark,
desaturated surface system, minimal always-on chrome, and a motion budget that is fast and
undecorated for routine actions, reserving genuine celebration for the rare moments lens-2
identifies as actually rare (a rank-up, a PR, the end-of-workout beat sequence).

Grounding for each element of that statement:

- **Utility-first over gamified-forward.** Lens-2 §8.3 states the codebase's own house
  style: rank recompute was moved from per-set to per-workout specifically so celebration
  reads as "one coherent moment instead of noise." Lens-1 §2B independently found Liftoff
  itself — a product whose business model depends on engagement — uses fast, utilitarian
  micro-motion with no confetti/particle bursts anywhere in 73 sampled filmstrips. Two
  independent sources therefore agree that a gamification layer does not require loud,
  constant motion; it requires an honest reservation of weight for real events. The general
  research doc's framing (Emil Kowalski, cited in `uiux-engagement-research.md` §2)
  reinforces the same point directly: "restraint is the skill, not decoration," and
  high-frequency interactions should get *near-zero* animation.
- **Single-column, thumb-zone-anchored mobile layout.** Lens-2 §2.6 establishes set-
  logging as a ~30x-per-session action; the general research doc's thumb-zone ergonomics
  principle (§1, "primary actions belong in the lower/reachable third") combines with
  lens-3's Low-medium finding that current screens leave 40-60% of viewport height empty
  above the fold while stranding CTAs near the top (lens-3 §2.4) to justify anchoring
  primary actions to the bottom third as a layout primitive from Phase 0 onward, not a
  per-screen afterthought.
- **Desaturated dark surface system, elevation via lightness not shadow.** Direct
  application of the general research doc's dark-mode section (§1): no pure black base,
  lighter-not-darker elevation steps, desaturated accents, and Material's text-opacity
  tiers rather than pure white. Lens-2 gives no counter-evidence (it never touched color
  values, being blind to presentation), so this is general-principle-grounded rather than
  Liftr-specific, applied because Liftr is confirmed dark-themed and mobile-first by its
  own package.json capabilities (Capacitor/PWA) per lens-2 §2.1/§7.
- **A three-tier motion vocabulary matching lens-2 §5's haptic tiers exactly** (`tap` /
  `bump` / `success`), rather than inventing a fourth. Reusing `useCountUp` and
  `useCelebrate` as the two motion primitives to rebuild the whole system around, per the
  task brief and lens-2 §5's own framing that these are "already well-specified in code."
- **Trust and honesty as a visual language, not just copy.** Lens-2 §4 rule 5 and §8.2
  establish that the product's underlying logic (plausibility discounting, `synthetic`-
  trust standards, "no rank yet excluded, not zeroed") never fabricates confidence — the
  visual direction mirrors this: muted, non-celebratory treatment for discounted/uncertain
  states, no locked/teaser fake-achievement empty states (echoing the general research
  doc's SDT distinction between *informing* vs *controlling* reward framing, §3).

This is a *direction*, not a finished visual spec — Phase 0 turns it into actual tokens.
Whether this reads as the right level of visual reinvention (a quiet utility surface vs.
something more visually distinctive) is flagged as an explicit open question in §5.

---

## 3. Phase-driven build plan

Each phase lists: goal, screens/components, evidence, complexity (S/M/L), dependencies,
success criterion.

### Phase 0 — Foundation

**Goal:** establish the design tokens, navigation shell, layout primitives, and motion
primitives every later phase builds on, so no subsequent phase re-litigates spacing,
color-role, or touch-target decisions.

**Components:**
- **Design tokens**: color roles (surface/elevated-surface/primary/on-surface-high/
  on-surface-medium/on-surface-disabled, per the general research doc's dark-mode opacity
  tiers), a single desaturated accent per semantic meaning (one color = "primary
  interactive," a second = "status/streak/rank," never reused for both — directly
  addressing lens-3's inconsistent-active-color finding, §2.3), spacing scale, and a hard
  44×44px minimum touch-target token applied uniformly (addressing lens-3's inconsistent
  38px-vs-44px finding, §2.3).
- **Navigation shell**: the five-zone bottom-tab IA from lens-2 §3.1 (Today / Train /
  Progress / Plan / Profile), with Train appearing only while `isActive` is true (a
  state-conditional nav item per lens-2 §3.1) and redirecting to Today otherwise. Built
  with an explicit narrow-viewport fallback (horizontal scroll-snap or icon-only collapse
  below a defined per-item width floor) from day one — directly closing lens-3's Critical
  finding of a completely unreachable fifth tab at 195px width (lens-3 §2.1) rather than
  retrofitting it later. Desktop-width reflow to a persistent left sidebar is scoped here
  too, since lens-2 itself notes the client responsively reflows and lens-3 confirms a
  1024px sidebar breakpoint exists as a passing pattern worth keeping conceptually (not
  copying pixel values, since that would require viewing CSS).
- **Layout primitives**: a `ThumbZoneAction` primitive (anchors a screen's primary CTA to
  the lower third by default) and a density-mode primitive implementing lens-2 §4's three
  named density levels (Train = lowest density/largest targets, Plan = form-dense,
  Progress = read-dense) as a reusable layout prop rather than per-screen improvisation.
  A `TruncatingLabel` primitive (flex + min-width:0 + ellipsis, never mid-word hyphenation)
  used everywhere an exercise name renders, closing lens-3's High-severity text-wrap bug
  (§2.2) at the primitive level so it cannot recur screen-by-screen.
- **Motion primitives**: rebuild `useCountUp` (rAF roll-up, ease-out-cubic, ~600ms,
  collapsing to instant under reduced-motion) and `useCelebrate` (sequential skippable
  "beat" holder, ~1400ms/beat, holds collapse to 0ms under reduced-motion) as the two
  system primitives per lens-2 §5, plus a shared three-tier haptic/motion vocabulary
  (`tap`/`bump`/`success`) that every later phase's animated moment must map onto — no
  phase may invent a fourth tier. A `prefers-reduced-motion` gate that also silences
  haptics (lens-2 §5's explicit point that a physical jolt is "exactly the kind of motion
  that preference is meant to suppress").

**Evidence:** lens-2 §3.1 (nav structure), §4 (density rules), §5 (motion primitives);
lens-3 §2.1, §2.2, §2.3, §2.4 (each closed at the primitive level above); general research
doc §1 (touch targets, dark-mode tokens, thumb zone).

**Complexity:** L (this is the highest-leverage phase; every later phase depends on it).

**Dependencies:** none.

**Success criterion:** the nav shell renders all five destinations reachably at 195px,
320px, 390px, and 1024px+ widths with no clipped/unreachable item; every interactive
element in the token system measures ≥44×44px; `useCountUp`/`useCelebrate` pass a
reduced-motion snapshot test producing instant/zero-hold output.

---

### Phase 1 — Today / Train (the logging loop)

**Goal:** ship the highest-frequency surface first — the "sacred loop" lens-2 identifies
as tapped ~30x/session — since it is both the product's core value and the surface most
exposed to Phase 0's density/touch-target/motion primitives.

**Screens/components:**
- **Today (home)**: readiness hero (`recoveredSlugs`/`heat`-driven verdict copy per
  lens-2 §3.2, framed as a suggestion never a score per lens-2 §6 item 7), streak count +
  tokens-remaining chip phrased as "streak protected: N rest days remaining" (lens-2 §6
  item 1's explicit copy framing, chosen over a bare countdown), one-tap "start today's
  routine" card list, quick-start fallback. Empty-state behavior for a zero-history user
  routes into the same suggestion flow used by "no routines yet" (lens-2 §7, "empty
  routines and empty history are the same first-run moment").
- **Active Workout**: current exercise/set, weight+reps steppers with both increment and
  direct-entry (lens-2 §2.6 flags the ±1-tap-only bug this must not repeat — direct entry
  is a first-class affordance, not a fallback), rest timer rendering the three distinct
  states the state machine actually produces (`restBetweenSetsSeconds`,
  `restAfterExerciseSeconds`, `null`/no-timer for mid-superset — lens-2 §5), set-kind
  picker, superset round-robin indicator, jump-to-exercise rail, mid-session add/skip/
  pause/cancel via confirm-tap (not a native dialog, per lens-2 §3.2), stale-session nudge
  banner (>3hr, lens-2 §2.3). Bodyweight-null vs. bodyweight-zero render as visibly
  different affordances (stepper hidden entirely vs. stepper starting at 0) per lens-2 §4
  rule 6 — a schema-level distinction this phase must not flatten.
- **Set-logged and exercise-advance motion**: quick scale/opacity settle mapped to
  `haptics.tap()` for a same-exercise set log; a slightly more deliberate slide/cross-fade
  only when the state machine actually advances exercise context (lens-2 §5) — the
  distinction is state-driven, not decorative.
- **+XP chip**: float-and-fade, ~1600ms (900ms reduced-motion), pinned to the log-set
  button, explicitly non-authoritative — never gates the log-set flow (lens-2 §5).
- **RPE capture** (new UI, no existing pattern — see migration note below): a lightweight
  post-set RPE control (e.g. 1-10 or RPE-scale picker), since `sets.rpe` is captured
  end-to-end in the sync payload and DB column but has zero client consumer today (lens-2
  §2.5). Scoped as optional-per-set, never blocking the log action, consistent with
  lens-2's "never gate the sacred loop" principle.
- **Set/workout notes** (new UI, no existing pattern): a free-text field at set and
  workout level, since both are persisted server-side with no client read/write path
  today (lens-2 §2.5). Placed off the primary logging path (e.g. a secondary affordance
  on the set row, not inline with the stepper) so it doesn't add friction to the 30x-per-
  session action.
- **Sync indicator**: a small persistent (non-modal) `pendingCount`/`flushing` indicator
  animating queued → syncing-pulse → settle (lens-2 §5), giving offline confidence rather
  than blocking.

**Evidence:** lens-2 §2.3 (session state machine), §2.5 (RPE/notes gap), §2.6 (frequency
analysis), §3.2 (screen inventory), §4 rules 1 and 6 (density, bodyweight-null distinction),
§5 (motion contract), §7 (offline posture: "Train must never show a spinner or block on
network state").

**Complexity:** L.

**Dependencies:** Phase 0 (tokens, nav shell, layout/motion primitives).

**Migration/schema note:** RPE and notes capture are genuinely new UI with no existing
client pattern to reference (lens-2 §2.5 confirms zero prior client consumer for either
field) — flagged as first-build-from-scratch work, not a port. No new backend/schema work
is required; both fields already round-trip through the sync payload and DB.

**Success criterion:** a full workout (start → log N sets across ≥2 exercises, including
a superset and a warm-up insert → pause/resume → finish) completes with no blocking
network wait except the single awaited `finish` call, and every set-kind/rest-state/
bodyweight-null-vs-zero case renders its distinct specified affordance.

---

### Phase 2 — Finish Sequence & Progress (ranks, PRs, XP)

**Goal:** ship the reward/reflection surfaces — the one place lens-2 licenses genuine
celebration — and surface the single highest-value "free" screen this plan can add: a
Personal Records ledger the backend already fully computes but has never displayed.

**Screens/components:**
- **Finish Sequence**: sequential skippable beats (rank-ups, streak strip, XP/level
  roll-up, session summary) using `useCelebrate`'s two-phase structure — sparse beat
  playback, then a static dense `finishedSummary` (lens-2 §4 rule 4, §5). LP bar animates
  literally from `prevLp` toward `lp` (to 100-then-reset on an actual rank-up, per the
  server's explicit `prevLp`/`lp` contract, lens-2 §5) — not a discontinuous jump. A
  same-band recovery gain (`!rankedUp && lp > prevLp`) gets a lighter single-beat tag, not
  a full celebration (lens-2 §5). A plausibility-discounted session gets muted, non-
  celebratory treatment, never paired with the success haptic, and copy that "never states
  the exact numbers that tripped it" (lens-2 §5) — this phase must resist the temptation
  to visually escalate a discounted session just because *some* LP was still gained.
  **Explicitly avoids** showing the same resolved XP/level number twice at once in two
  disconnected treatments — lens-3 §2.3 (Medium) found exactly this duplication in the
  current build; this design either suppresses the persistent header pill's XP display
  while the reward card is active, or uses the reward-card reveal as the visible moment
  the header pill itself animates to its new value, so the two never independently double
  up the same number.
- **Ranks**: every ranked exercise, sorted server-side by LP with that ordering preserved
  as the primary scan axis (lens-2 §4 rule 3), tier/division badges, a visibly distinct
  treatment for `synthetic`-trust standards vs. `real`/`derived` (lens-2 §4 rule 5 — not
  just a tooltip), peak-vs-current distinction, "Rangaufstiege" 7-day weekday strip with
  cells revealing left-to-right (lens-2 §5). Unranked exercises are excluded entirely, not
  shown as placeholders (lens-2 §7, mirroring the aggregate's own "no rank yet excluded,
  not zeroed" rule).
- **Overall Rank**: single account-level aggregate tier/division/LP, current vs. peak
  (lens-2 §3.2, §6 item 3).
- **Personal Records** (new screen, no existing pattern): one row per exercise×kind
  (e1rm/weight/reps/volume) with achieved date and a link to the originating set/workout,
  since the `prs` table is fully populated server-side but "the app never displays" it
  (lens-2 §2.5, quoting the server comment directly). Honest empty state ("no records yet
  — your first working set on any exercise will start one"), never a fake locked/teaser
  state (lens-2 §7).
- **History**: reverse-chronological workout+run feed, infinite-scroll, tap-through detail
  with per-set PR flags, delete via confirm-tap, share-card entry point. Explicitly
  online-only with an honest "showing last-synced data" offline state (lens-2 §7) — the
  one screen in the app that should *not* pretend to be live, in deliberate contrast to
  Train's always-confident offline posture.
- **XP & Level**: minimal — total XP, level, progress bar — deliberately kept secondary,
  since the code's own framing calls it "purely additive, never gates or replaces the rank
  system" (lens-2 §6 item 4).

**Evidence:** lens-2 §2.5 (PR ledger gap), §3.2, §4 rules 3-5, §5 (Finish Sequence motion
contract), §6 items 1-6, §7 (empty/error/offline rules); lens-3 §2.3 Medium (duplicate XP
display — directly designed against).

**Complexity:** L (Finish Sequence's conditional beat logic and the new PR screen are both
substantial).

**Dependencies:** Phase 0; benefits from Phase 1 shipping first since Finish Sequence is
reached from the active-workout flow.

**Migration/schema note:** Personal Records is new UI over existing, fully-populated data
— no backend work required, but no existing client pattern to model the screen on, per
lens-2 §2.5.

**Success criterion:** a rank-up, a same-band recovery gain, and a plausibility-discounted
session each produce visually distinct Finish Sequence treatments (verified against the
three code-specified cases in lens-2 §5); the Ranks list order matches server-returned LP
order without client re-sorting; the PR screen renders real ledger data for an account with
existing PRs and the honest empty state for one without.

---

### Phase 3 — Plan (routines, mesocycles, exercise catalog)

**Goal:** ship the deliberately denser, form-like "planning-desk" surfaces lens-2
distinguishes structurally from the logging loop — lower frequency, can afford more
reading/comparison, per lens-2 §2.6's direct code citation on why the mesocycle toggle is
"kept off the routine card itself."

**Screens/components:**
- **Routines list**: one-tap-start cards kept deliberately light (lens-2 §2.6), archive/
  reorder via drag (displaced-card shift gets a short ~150-200ms eased transform per
  lens-2 §5's specific gap-fill on `useDragReorder`, while the dragged card itself stays
  pointer-locked with no easing), mesocycle reveal-on-demand rather than always-visible
  weight.
- **Routine Builder/Wizard**: muscle-group-driven or manual exercise picking, equipment-
  aware substitution surfaced explicitly ("swapped because you don't own X," lens-2 §2.4/
  §3.2), per-set reps/weight/kind targets, per-exercise rest overrides, superset grouping,
  drag-to-reorder. The step indicator's own claimed step count must match what the flow
  actually does — if the flow ends at step 2's save action, the indicator says 2 steps, not
  3 — directly closing lens-3's Medium finding of a wizard promising a step it never shows
  (lens-3 §2.3). Every exercise-name label in the reorder list uses Phase 0's
  `TruncatingLabel` primitive, closing lens-3's High text-wrap bug (§2.2) at first build
  rather than as a later fix.
- **Mesocycle setup**: attach/end a cycle, week count (2-16), current-week indicator (the
  `currentWeek` field's one real consumer today is the weight-scaling calc at workout
  start, per lens-2 §2.5 — this phase gives it its first dashboard-style "week N of M"
  surface, which is new presentation over existing data, not new backend work).
- **Exercise catalog**: browse/search, muscle tags, equipment requirements, add-custom-
  exercise form. Placeholder treatment for exercises without a demo photo should be
  visually closer to the photographic rows around it, not a jarring flat-icon break (lens-3
  §2.4 Low) — addressed as a content/asset-fallback policy in this phase's spec, not
  deferred as cosmetic-only.

**Evidence:** lens-2 §2.4, §2.5, §2.6, §3.2, §4 rule 2, §5 (drag-reorder gap); lens-3 §2.2
High, §2.3 Medium (wizard step mismatch), §2.4 Low (placeholder inconsistency).

**Complexity:** M.

**Dependencies:** Phase 0; independent of Phases 1-2, can ship in parallel with Phase 2 if
resourced separately.

**Success criterion:** the wizard's step indicator accurately reflects the number of
screens the flow actually shows; a routine with an exercise name of the documented
"Langhantel-Kniebeuge"-class length (long German compound word) renders on a single line
with ellipsis, never mid-word hyphenation, in the reorder list.

---

### Phase 4 — Profile, Data & Auth

**Goal:** ship the low-frequency account/data-management surfaces, including a dedicated,
correctly-weighted auth/token entry point — the last IA zone from lens-2 §3.1.

**Screens/components:**
- **Onboarding/Profile**: sex, birth year, experience level, workouts/week, current
  bodyweight — staged and skippable, every field independently settable later, never a
  hard gate (lens-2 §7). Bodyweight empty-state copy names the concrete action ("log your
  weight here") rather than only stating a threshold with no instruction, closing lens-3's
  Low finding that the current bodyweight empty state is comparatively vague next to other
  empty states in the app (lens-3 §2.4).
- **Equipment & Gym Setup**: owned-equipment checklist, bar-weight-by-type, per-plate-size
  inventory feeding the plate calculator — deferred until the first moment a substitution
  or plate breakdown actually needs it, per lens-2 §7's onboarding-flow guidance, rather
  than front-loaded.
- **Bodyweight log**: simple time series.
- **Data & Backup**: CSV/zip export, sync status/pending-count.
- **Auth/token entry**: a dedicated, correctly-labeled entry point for the `LIFTR_TOKEN`
  bearer credential — not a password-masked field buried among unrelated settings with no
  reveal toggle (lens-3 §2.5 Medium, "the credential-entry moment is not treated as a
  distinct, guided step"). Since this is a locally-generated bearer token, not a shared
  login credential, the field gets a show/hide toggle by default (lens-3 §2.3 Medium,
  "textbook case against blanket password masking" for a token the user must verify
  before saving) and — if/when the server actually enforces `LIFTR_TOKEN` (see migration
  note) — a dedicated full-screen unauthenticated/401 prompt rather than requiring the user
  to already know to scroll into Profile to find it.

**Evidence:** lens-2 §2.4 (settings routes), §7 (staged onboarding); lens-3 §2.4 Low
(bodyweight copy), §2.5 Medium (auth UX, both findings).

**Complexity:** S-M.

**Dependencies:** Phase 0 only; fully independent of Phases 1-3, can ship in any order
relative to them.

**Migration/schema risk flag:** lens-3 §2.5 notes it could not verify an actual 401/
rejected-token flow end-to-end in the current build (the dev instance it tested against
did not enforce `LIFTR_TOKEN`). This plan specs a correctly-weighted *entry point* for the
token, but whether a dedicated full-screen unauthenticated-state prompt is buildable today
depends on whether `requireAuth`'s 401 path is actually reachable/observable client-side —
this needs a direct code check against `packages/server/src/auth.ts`'s enforcement
behavior before Phase 4 is scheduled, since it is one of the few places in this plan where
lens-3's own evidence is explicitly marked unverified.

**Success criterion:** the token field has a working reveal toggle; a fresh account can
complete onboarding to "pick a first routine or Quick Start" without ever being blocked on
equipment/gym setup.

---

### Phase 5 — Runs (cross-cutting)

**Goal:** ship run import/logging/replay, structurally simpler than the workout loop
(lens-2 §2.6: "no per-rep interaction") and less frequent, so scheduled last among
feature-complete phases.

**Screens/components:**
- File-upload (GPX/FIT) and manual distance/duration entry, Health Connect import trigger,
  route map + replay for any run with points.
- Empty state offers exactly one clear action per entry method — closing lens-3's High
  finding of two identically-labeled "GPX/FIT importieren" buttons appearing simultaneously
  in the current build's empty state (lens-3 §2.2): this design keeps the import action in
  a single location (the empty-state card) rather than duplicating it in a separate top
  action row.

**Evidence:** lens-2 §2.4 (runs routes), §2.6 (frequency); lens-3 §2.2 High.

**Complexity:** S.

**Dependencies:** Phase 0 only.

**Success criterion:** the empty state presents exactly one control per available import
method, with no duplicate-labeled controls.

---

## 4. Migration strategy

**What can ship incrementally, screen by screen, behind a route:** Phases 2 (Progress),
3 (Plan), 4 (Profile/Auth), and 5 (Runs) are each read/write-independent surfaces that can
be built and cut over one screen at a time behind a feature-flagged route, since none of
them share state with the active-workout session in a way that would break mid-flight if
only half were migrated. The Personal Records screen in particular (Phase 2) is purely
additive — it reads existing, already-populated data and can ship the moment its screen is
built, independent of everything else.

**What requires a coordinated cutover:** Phase 1 (Today/Train) cannot be migrated screen-
by-screen in isolation, because the active-workout state machine (lens-2 §2.3) is a single
continuous session spanning start → log → finish, and the offline-first sync outbox
(lens-2 §7) is shared, stateful infrastructure underneath it — splitting "start" onto the
new UI and "log set" onto the old one (or vice versa) mid-session would risk exactly the
kind of desync the codebase's own schema-header invariant (every derived table must be
reconstructible from raw tables) is designed to tolerate at the data layer but that the
*UI* has no equivalent safety net for. Phase 1 should be built complete, tested against a
full session lifecycle (start → pause → add-exercise → warm-up insert → superset →
finish), and cut over as one atomic unit — new Today/Train screens replacing old ones in
the same release, not screen-by-screen.

**Data/schema risk on first-ever UI:** three specific pieces of this plan build a UI with
no existing client pattern to reference at all, flagged individually above and collected
here for visibility: RPE capture (Phase 1), set/workout notes (Phase 1), and the Personal
Records ledger (Phase 2). All three require zero new backend/schema work — the data is
already fully modeled, persisted, and round-tripped server-side per lens-2 §2.5 — but each
is a genuine first build, not a port, and should be scoped with its own design review
rather than assumed to follow naturally from adjacent screens.

---

## 5. Explicitly out of scope

- **Any social/multi-user feature** (leaderboards, friends, public profiles, percentile
  comparison) — lens-1 §5B and lens-2 §6 item 8 both independently establish this requires
  a fundamentally different backend architecture than the single bearer-token, no-accounts
  design Liftr currently has (`packages/server/src/auth.ts`/`env.ts`). Not deferred as
  "later phase of this plan" — deferred as a different product, out of this plan's scope
  entirely.
- **`run_points.cadence` surfacing** — typed end-to-end but never aggregated by
  `summarizeRun` for anything today (lens-2 §2.5); adding a cadence figure to the run
  summary would require new aggregation logic in `packages/shared/src/math/gps.ts` or
  `runService.ts`, which is server/shared-package work beyond this plan's UI-only mandate.
  Flagged as a candidate for a future phase, not scoped here.
- **`exercises.demoStartImage`/`demoEndImage` population** — the columns exist but ingest
  never writes them; the server currently does a live filesystem check instead (lens-2
  §2.5). Populating these is a data/ingest-pipeline task, not a UI task, and is out of
  scope.
- **`mesocycle.currentWeek` as a persistent dashboard widget beyond Phase 3's "week N of M"
  surface** — lens-2 §2.5 confirms this field has exactly one narrow consumer today (the
  workout-start weight-scaling calc). Phase 3 gives it a first display surface; anything
  more elaborate (e.g. a cross-routine mesocycle-progress dashboard) would need new
  aggregation queries and is deferred.
- **Notification-driven re-engagement** — no push infrastructure is evidenced anywhere in
  lens-2's read of the server/client stack, and lens-2 §6 item 8 explicitly rules out
  "push-notification-driven falling-behind pressure messaging" as unsupported by the data
  model's single-player design. Any notification system would be new infrastructure, not a
  UI change, and is out of scope.
- **A visual redesign of the share-card generator's internals** (`shareCard.ts`) — lens-2's
  own disclosure statement excludes this file's drawing routines from what it read, and
  this plan inherits that boundary; the share-card's *entry point* (a button in the Finish
  Sequence and History detail) is in scope per lens-2 §3.2, but redesigning the canvas
  renderer itself is not addressed here.

---

## 6. Open questions

1. **How ambitious should the visual reinvention be?** §2's direction lands on "quiet
   utility-first," grounded in lens-1's finding that even a competitor with an engagement-
   driven business model keeps micro-motion fast and restrained. But this is a genuine
   product-taste decision this plan cannot resolve alone: a more visually distinctive
   direction (bolder illustration system, more expressive color) is equally defensible from
   the same evidence and would not contradict any lens-2 finding — lens-2 is silent on
   visual style by design (it never saw any CSS/design tokens). This plan picks restraint
   because it's the lower-risk, more evidence-anchored default, not because the evidence
   rules out the alternative.
2. **Full replacement vs. phased screen-by-screen migration** — §4 recommends coordinated
   cutover only for Phase 1 and incremental shipping for everything else, but the actual
   business/team-capacity tradeoff (is a longer coexistence period with two UIs acceptable,
   or does this org want to hard-cut on a release date) is a project-management decision
   outside this plan's evidence base.
3. **Auth/token enforcement behavior** — flagged concretely in Phase 4: lens-3 could not
   verify the current build's actual 401/rejected-token behavior end-to-end (the test
   instance didn't enforce the token). Before Phase 4's full-screen unauthenticated-state
   prompt is built, someone needs to confirm `requireAuth`'s actual enforcement path is
   observable and testable client-side.
4. **RPE and notes UI shape** — lens-2 establishes these fields exist and are unconsumed,
   and this plan proposes lightweight, non-blocking capture points, but the *exact*
   interaction shape (a 1-10 scale vs. RPE-decimal picker for RPE; inline vs. modal for
   notes) has no prior pattern anywhere in the codebase to anchor a specific choice — this
   is real product design work this plan intentionally leaves open rather than guessing at
   UI details with no evidence behind them.
5. **Priority order across Phases 2-5** — the plan sequences Phase 1 first (highest
   frequency, per lens-2 §2.6) and treats Phases 2-5 as largely independent and
   parallelizable, but which of Progress/Plan/Profile/Runs should follow Phase 1 first in
   practice is a resourcing question, not a design one; §3's ordering (2, 3, 4, 5) follows
   lens-2's own frequency ranking (Progress = passive/ambient but checked often; Plan =
   deliberate/infrequent; Profile/Runs = rare) as a reasonable default, not a hard
   requirement.
