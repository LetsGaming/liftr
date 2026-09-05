# Liftr — Development Workplan v1

**Status as of 2026-09-04.** This is the single source of truth for what's actually shipped vs.
actually open in Liftr. It absorbs and supersedes `plan-a-engagement-gamification.md` and
`plan-b-ui-standards-fix.md` (both deleted this session — every item in both was already resolved
and cited here) and `plan-c-new-ui-rebuild.md` (moved to `audit/finished/`, its six phases executed
and merged as "Track R"). Every claim below is sourced either from direct source citation or from
one of two independent verification passes run this session: round 1 (static code read, agents 1-8,
see `audit/verify/SUMMARY.md`) and round 2 (live browser testing + rendered design-fidelity
comparison, agents 1-6 + design-agents 1-3, see `audit/verify/ROUND2-SUMMARY.md`). Where an item was
corrected by those passes, that's stated explicitly, not silently folded in.

**Visual identity ground truth:** `audit/nebula-design-system.md` and
`audit/nebula-design-components.md` are now the normative spec for Liftr's visual identity
(superseding the deleted `nebula-design-philosophy/framework/layout/patterns.md`, consolidated this
session). Read those before touching any color/chrome/CTA/reward-surface code — they state what
must be true, not just what was once proposed.

---

## 1. Done — verified, no action needed

Condensed to one line each with a pointer to the evidence; full history lives in
`audit/finished/*.md` and `audit/verify/*.md` if you need it. Do not re-open these.

- **Phase 0 universal correctness fixes** (routine-save fractional-rep crash, NumberStepper
  digit-concatenation, duplicate finish-screen XP display, persistent top-HUD during logging,
  muscle-diagram stretch glitch, 44px touch-target floor, segmented-control neutral color, token
  reveal/hide toggle on both Profile and AuthGate, wizard fast-path step relabel, bottom-anchor CTA
  copy) — all verified shipped and correct. `audit/verify/agent-1.md`.
- **Personal Records ledger** — see §2, corrected below; the *feature* is done, one integration gap
  and one live bug remain open.
- **Reward-signal legibility** (`standards.trust` rendered on Ranks/Progress/exercise-info screens,
  Overall Lifter Rank surfaced on Overview/Ranks/Workout/WorkoutDetail) — verified present and
  wired. `audit/verify/agent-1.md`, `agent-2.md`.
- **RPE and notes surfacing** — shipped 2026-09-04: `RpeCapture.vue`/`NoteCapture.vue`, off the
  primary logging path, never blocking "Satz speichern," confirmed live via real clicks (sheet
  opens, picks an option, logs without RPE set). `audit/verify/round2-agent-3.md`.
- **`engagement-audit-v5` carry-forward** (Overview/Ranks/Profile duplication cut, Profile domain
  grouping into 4 sections, Overview priority tiles) — verified shipped and correct live.
  `audit/verify/round2-agent-2.md`, `round2-design-agent-1.md`.
- **Track R (the full UI rebuild, formerly "Plan C")** — six phases (Foundation, Today/Train,
  Finish & Progress, Plan, Profile/Auth, Runs) executed via subagent-driven development and merged
  to master, commit range `9daef8e..f7f2256`. Nearly every claimed feature was independently
  reproduced live: RPE/notes capture, RestTimer 3-state rendering, non-modal sync indicator, mobile
  exercise rail, plausibility-discount muting (verified live by forcing an implausible session — the
  app correctly flagged and suppressed the gain with the exact expected copy), drag-to-reorder,
  equipment-substitution copy naming the specific missing item, muscle-coverage/lopsided-distribution
  review checks, auth 401 gate, CSV/ZIP export, PR ledger. Full detail:
  `audit/finished/plan-c-new-ui-rebuild.md`, `audit/verify/round2-agent-3.md`,
  `round2-agent-4.md`, `round2-agent-6.md`.
- **Rank engine v2** (9-tier ladder, peak/decay/recovery-gain, plausibility gate, XP discounting) —
  fully implemented and tested (260/260 tests passing). One real gap the plan itself never
  anticipated: migration 0009 didn't remap pre-existing rows holding old 5-tier strings; caught and
  fixed by a later migration (`0010_remap_legacy_tier_strings.sql`), already shipped. Design spec's
  exact plausibility threshold numbers are stale (tightened later by engagement-audit-v3) — the
  mechanic is correct, only the spec's literal numbers drifted. `audit/verify/agent-5.md`.
- **Nebula chrome/CTA layer (N0-N1)** — tokens, light-mode base palette, theme store, `.btn-primary`
  gradient — confirmed shipped AND confirmed live/rendered correctly on Overview, Workout, and
  Profile in both themes. `audit/nebula-design-plan.md`, `audit/verify/round2-design-agent-1.md`
  through `-3.md`.
- **§3.6's gym-setup 500 (WS1, 2026-09-04)** — was one bad legacy-shaped row in the dev DB, not a
  code bug; reset directly (`GET /api/settings/gym` returns 200, confirmed live in a fresh boot
  console with zero errors).
- **§3.1's custom-exercise display-name bug (WS2, 2026-09-04)** — the dead `nameKey` column
  (never read by any display code, for custom *or* catalog exercises) is gone, replaced by a real
  `name` column populated for custom exercises. `useExerciseName()` now checks it first via an
  optional second parameter, threaded through the ~9 call sites that have the exercise object in
  hand. Verified live end-to-end: created a custom exercise with an umlaut name
  ("Überkopfdrücken WS2 Live-Test"), confirmed it renders correctly in the list and round-trips
  byte-for-byte through the raw `GET /api/exercises` response; catalog exercises still resolve
  their i18n names unaffected. 261/261 tests, clean typecheck across all 5 packages, clean lint.
  Merged to master.
- **§3.10's share-card palette (2026-09-04)** — see §3.10 below for the full decision; Nebula Halo
  palette adopted, tier medal demoted to a top-right corner stamp, freed space handed to the
  muscle figures and exercise grid. Verified live across three scenarios, no overlap.
- **WS3 client UI cleanup batch (2026-09-04)** — closes §3.2, §3.3, §3.4, and the ErholungszoneCard
  half of §3.6, all in one worktree/commit: manual run-entry validation now surfaces real per-field
  German error messages (extracted to a pure, tested `validateManualEntry()`, 12 new tests) instead
  of a silently-disabled button; the `/records` blank-flash bug is fixed (a real visible loading
  skeleton, plus a generic `router.beforeResolve` chunk-prefetch guard so no lazy route leaves
  `<main>` empty mid-transition); light mode now correctly applies to Ionic chrome, the theme-color
  meta tag, and text sitting on the (deliberately still-dark) tier surfaces on `/ranks`, via the
  same locally-pinned-token pattern `.panel-reward` already established; `ThumbZoneAction.vue` and
  `DensityScope.vue`/`useDensity.ts` are deleted outright (confirmed zero consumers via a repo-wide
  grep sweep) rather than left as dead code; `TruncatingLabel.vue` is now adopted at the two
  remaining sites where the mid-word-break bug it exists to prevent had recurred (`RanksPage.vue`,
  `WorkoutPage.vue`'s active-exercise heading), verified live at desktop and ~390px mobile width.
  273/273 tests, clean typecheck across all 5 packages, clean lint. Merged to master.

---

## 2. Personal Records ledger — corrected 2026-09-04

**This document previously stated §2 was "⏳ not started, top of the remaining work queue." That
was false and stale.** The feature is fully shipped: `packages/server/src/routes/prs.ts`
(registered), `packages/client/src/stores/prStore.ts`, `packages/client/src/pages/RecordsPage.vue`
routed at `/records`, linked from `RanksPage.vue`. Confirmed live: real PR data renders, `GET
/api/prs` returns 200, no console errors. `audit/verify/agent-1.md`, `round2-agent-2.md`.

**What's actually still open:**
- The Finish Sequence's PR beat does not link into the ledger — still a one-off in-session
  acknowledgment with no permanent home to revisit. Grep of `FinishSequence.vue` for
  record-related terms returns zero matches.

**Router-link blank-flash bug (`round2-agent-2.md`) — verified already resolved, 2026-09-05.**
`round2-agent-2.md` found that navigating to `/records` via `RanksPage.vue`'s in-app router-link
showed a fully blank content area for ~1-2 seconds before data rendered (reproduced 3× on fresh
tabs), unlike a direct/hard URL load. That report predates same-day WS3 client UI cleanup work,
which added `RecordsPage.vue`'s `.pr-skel-row` shimmer skeleton (gated on
`!prStore.loaded && !prStore.error`, rendered immediately on mount, not on fetch completion). Live
re-verification via an isolated Playwright session (`http://localhost:5174`, dev server, real
click on the `RanksPage.vue` router-link, not a hard load): with `/api/prs` running at its normal
near-instant local latency AND with `fetch` monkey-patched to artificially delay `/api/prs` by
700ms/900ms/1800ms to stress-test the gap, `.main-content`'s `innerHTML` was sampled every 10-15ms
across the whole transition in every run — it was never empty in any run. The outgoing
`RanksPage.vue` content stays visible through the `route-fade` leave transition (~135-150ms, the
existing `--dur-fast` transition, not a bug), then the skeleton is already mounted and painted by
~150ms, well before any of the artificially delayed fetches resolved. No `router.beforeResolve`
chunk-prefetch guard exists in this codebase (searched `router.ts`, `main.ts`, `App.vue` — none
found), so the "beforeResolve guard" some prior note attributed to the WS3 batch was not actually
part of what shipped here; it turned out not to be needed; the skeleton alone closes the gap the
bug report described. Moving this out of "still open" — `round2-agent-2.md` is a historical record
of a real bug that existed at the time it was written, not a currently-accurate status.

---

## 3. Open items

### 3.5 Rank-up ring/glow — needs a one-time live confirmation, not a rebuild

`FinishSequence.vue`'s `.badge-ring`/`.badge-ring-muted` split exists in code and is structurally
scoped correctly (never reachable from the plausibility-discounted branch). No session in either
verification round produced an actual rank-up crossing live, so the ring/glow's rendering during a
real beat has never been visually confirmed. Cheapest way to close this: deliberately engineer a
small, plausible, near-threshold improvement and complete the workout. `audit/nebula-design-plan.md`
Phase N2, `audit/verify/round2-agent-3.md`.

### 3.6 Minor live-only defect — needs an investigation pass, not a code guess

Recurring Ionic Vue console exception (`insertBefore` on null, in `removeViewFromDom`) firing
roughly every 35-90s throughout live sessions, independent of user action — some background
overlay/controller trying to dismiss an already-removed view. `audit/verify/round2-agent-4.md`.
This is the one item this workplan explicitly does NOT want autonomously code-guessed — an
exhaustive static search already ran with no conclusive culprit found (see the implementation
plan's WS5 for the discriminating test to run instead: reproduce in a production build with the
service worker unregistered, "pause on exceptions" on, capture the full stack).

### 3.7 Streak/XP mechanics redesign — shipped 2026-09-04 (WS4)

`docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md`'s per-set XP (weight-independent),
consistency bonus, and variety bonus are implemented end-to-end across 7 waves: XP formula +
anti-cheat math (`packages/shared/src/math/xp.ts`), DB migration 0014 adding
`consistencyBonusXp`/`varietyBonusXp` columns, previous-workout/muscle-overlap queries, bonus
summing, client sync/finish-workout state plumbing, Finish Sequence XP breakdown UI + recap chip
total, and a PR-ledger link from the Finish Sequence into `/records` (closing part of §2's gap).
306/306 tests, clean typecheck (5 packages), clean lint. Live-verified against a real running server
over real HTTP round-trips (not just unit tests): an identical 8-rep set at 20kg vs. 500kg produced
the exact same 240 XP delta (anti-cheese: weight cannot inflate XP), and a same-exercise/same-reps
set logged 4x in one workout with cosmetically nudged weights (20/20.5/20/20.25kg) scored well below
the undecayed 4x estimate (anti-nudge: repeat-decay isn't dodged by trivial weight changes).

### 3.8 Anti-farming copy reception — needs a real-user check

Still genuinely open, unchanged from prior rounds: the plausibility-discount message's wording
("this session felt unusually fast — rank/XP gain reduced") has never been checked against how a
real recipient reads it — protective signal vs. accusation. Copy-only if it needs changing; the
underlying mechanism is correct and untouched.

### 3.9 Missing-photo catalog gap — resourcing decision, not a design one

11 of ~94 catalog exercises have no photo (fallback to a generic equipment glyph). Decided
direction: source real photos where feasible, closer-matching placeholder otherwise; full-catalog
custom illustration explicitly deferred as its own separate initiative (out of scope for now). See
`audit/missing-photo-sourcing-research.md` for sourcing research.

### 3.10 Share-card palette vs. app palette — resolved 2026-09-04

Decided: **Variation 1 ("Nebula Halo")** from `audit/share-card-design-variations.md`, with one
product adjustment beyond that document's own text — the tier medal, "Tier Division", "Level N",
and the rank-up caption move out of the card's centered main-content flow into a small top-right
corner stamp (`drawCornerBadge` in `packages/client/src/lib/shareCard.ts`, ~110px vs. the old
168px, "less in the foreground"). The vertical space that freed up went to
`MUSCLE_FIG_H` (300→360) and `EXERCISE_ROW_H` (118→136), per direction: "the gained space should
be filled with a size adjustment for the trained muscle groups, as well as the exercises."
Background glow, wordmark, and two of four stat-card accents now use the Nebula brand gradient
(`--nebula-1/-m/-2`) in place of the old plain-blue values, closing this open question in favor of
brand-consistent, not app-independent. Verified live: normal case, no-badge case, and a long-name +
long-rank-up-caption stress case all render cleanly with no overlap. 261/261 tests, clean
typecheck, clean lint.

---

## 4. Explicitly out of scope

- Any social/multi-user feature (leaderboards, friends, public profiles, percentile comparison) —
  structurally unbuildable on the current single-bearer-token, no-accounts backend.
- Masked/near-miss reward targets, currency/cosmetics economy, chrome-hiding celebration
  interstitials, gated onboarding quests — each rejected against the product owner's own stated line
  against manipulative patterns.
- Full IA rework — live-tested verdict stands ("the organization is right, mostly"); the five-tab
  flat nav (Overview/Workout/Ranks/Exercises/Profile) is the accepted shipped shape, not the older
  five-zone Today/Train/Progress/Plan/Profile concept some early planning docs described.
- Auto dark/light switching from OS preference beyond the existing first-launch default — revisit
  only if user feedback specifically asks for it.
- Changing the 9-tier badge system's own colors, or adding a second brand gradient — both rejected
  outright per `audit/nebula-design-system.md` §1.

---

## 5. Provenance (historical, for citation-tracing only)

This document originally merged three research passes (`audit/research/lens-1/2/3`) and three
phase-driven plans (Plan A/B/C) into one sequenced workplan, then tracked the product-owner decision
to pursue a full rebuild ("Track R"), the Nebula visual-direction exploration, and Track R's
six-workstream execution through to merge. That full narrative history — the fork decision, the
interview transcript, the phase-by-phase execution log — is preserved in git history and in
`audit/finished/plan-c-new-ui-rebuild.md`; it is not repeated here since every item it tracked is
now resolved (§1 above) or superseded by a corrected open item (§2-3 above). If you need the
original reasoning for a specific already-shipped decision, `git log` on this file or read the
`finished/` closure notes — don't treat this document's history as still-authoritative context for
new work.
