# Nebula — Design Plan

**Status as of 2026-09-04, per two independent verification passes** (`audit/verify/agent-6.md`,
`audit/verify/round2-design-agent-1.md`/`-2.md`/`-3.md`, `audit/verify/ROUND2-SUMMARY.md`):
**Phases N0-N3 are shipped in code.** N0 (tokens/theme) and N1 (chrome/CTA) are confirmed working
live, not just in source. N2 (medallion ring/Finish Sequence) exists in code and is correctly
scoped, but its live rendering during an actual rank-up beat has not yet been visually confirmed —
that is the top remaining verification item, not a build item. N3 (PR ledger paint) exists in code,
not independently re-verified live. **N4 (verification sweep) has not been run**, and one real bug
blocks part of it: light mode does not visually apply to Ranks-page surfaces despite resolving
correctly in CSS (`nebula-design-system.md` §6). See `workplan-v1.md` for this as a tracked open
item. This plan document is kept as the historical phase breakdown and dependency map; the
normative spec now lives in `nebula-design-system.md` and `nebula-design-components.md` (this
document's own tokens/patterns/layout content was consolidated into those two files and this file's
description of them below is retained only where it adds phasing/sequencing detail not repeated
there).

Phased execution plan turning `nebula-design-system.md` / `nebula-design-components.md` into
shipped code. This was scoped as an amendment layered onto `audit/plan-c-new-ui-rebuild.md`'s
phase structure (§3, historical — Plan C itself is superseded, see `audit/finished/plan-c-new-ui-rebuild.md`),
not a parallel rebuild — every phase below maps onto a Plan C phase and adds Nebula-specific work
items to it. Where this plan's scope is smaller than a full Plan C phase (most of it — see §0),
that's because Liftr's existing token/component system already carried most of the
Liftoff-inspired language the mockup rounds were exploring (`nebula-design-system.md` §1).

---

## 0. Scope framing

This is **not** a ground-up UI rebuild. It's:
1. One new token layer (`--nebula-*`) added to `tokens.css`.
2. One genuinely new capability (light mode + theme store) that didn't exist before.
3. A bounded set of component-level swaps (pattern doc §1-5) applied to existing, already-built
   components — `.btn-primary`, `.rankbar`, `.level-chip`/`.streak-chip`, `.panel-reward`.
4. One markup-level addition (the Nebula ring around rank medallions, pattern §2) that needs a Vue
   template change, not just CSS.

Everything else in Plan C (nav shell fallback behavior, RPE/notes capture, Personal Records screen,
routine wizard fixes, auth entry point, etc.) proceeds exactly as `plan-c-new-ui-rebuild.md`
already specifies — this plan does not re-scope any of that functional work, only its paint.

---

## Phase N0 — Token & theme foundation ✅ Shipped, confirmed live

**Goal:** ship `--nebula-*` tokens and light-mode infrastructure before any component migrates to
them, so no later phase has to retrofit theme-awareness into something already shipped without it.

**Work items:**
- Add `--nebula-1/-m/-2`, `--nebula-grad`, `--nebula-grad-cta`, `--nebula-ink`,
  `--nebula-ink-on-fill`, `--nebula-glow`, `--nebula-glow-strong` to `tokens.css` `:root`
  (framework §1.1, §1.4).
- Add the `:root[data-theme="light"]` block (framework §2.1) with every existing token
  re-specified for light, not just the new ones — this is the largest single work item in this
  phase: a systematic contrast pass across `--bg` through the 9-tier badge tokens (framework §2.3's
  checklist is a starting point, not the full list).
- Build `themeStore` (Pinia), boot-time `data-theme` application (before first paint — a flash of
  wrong theme is a regression, not a cosmetic nit), local-storage persistence.
- Add the theme toggle control to Profile (layout §5) — UI only; wiring is the store above.

**Evidence:** `nebula-design-system.md` §2 (full light-mode spec), `liftr-pulse-liftoff-
finalists.html` (the light-mode content rules this codifies: gradient reserved for filled surfaces,
solid ink for text, neutral shadow not colored glow).

**Complexity:** M (the token audit is genuinely a full pass over every existing color value; the
store/toggle itself is small).

**Dependencies:** none — this can start immediately, independent of Plan C's own Phase 0-5 work,
since it touches `tokens.css` additively.

**Success criterion:** toggling the theme control re-renders every screen with no unstyled/
low-contrast flash; a scripted contrast check (existing tokens already have measured ratios noted
in `tokens.css`'s comments — e.g. `--dim` at "5.60:1 on --surface-2" — the light-mode equivalents
need the same measurement, not just a visual eyeball) passes WCAG AA (4.5:1 body text, 3:1 large
text/UI) for every text-on-surface pairing in both themes.

---

## Phase N1 — Chrome & CTA migration ✅ Shipped, confirmed live

**Goal:** apply Nebula to the always-visible, high-frequency chrome — HUD and primary buttons —
since these are the surfaces every other phase's screens inherit from, and getting the
glow-rationing rule right here (framework §5) sets the precedent every later phase follows.

**Work items:**
- `.btn-primary` background/ink migration (framework §4, pattern §3) — one CSS change, reaches
  every call site at once (this is exactly the leverage `tokens.css`'s own existing comments prize
  — "one canonical rule... reaches every call site at once").
- `.level-chip`/`.streak-chip` accent migration + streak-pulse glow wiring (pattern §1, layout §0).
- Non-tiered `.rankbar` fallback migration (pattern §4).
- Nav active-indicator fallback migration (layout §0).

**Evidence:** `nebula-design-components.md` §1/§3/§4; `nebula-design-system.md` §5 (glow rule,
must be implemented correctly here since Phase N1 is where it's first exercised in real code, via
the existing `streakJustExtended` trigger in `App.vue`).

**Complexity:** S — every target here is a single already-centralized CSS class or a small,
already-isolated piece of `App.vue` state (`streakJustExtended`), per the "one canonical rule"
convention `tokens.css` already follows. This is the highest-leverage, lowest-risk phase in the
whole plan.

**Dependencies:** Phase N0 (tokens must exist first).

**Success criterion:** every `.btn-primary` in the app (grep for the class, verify against a
built/running app, not just the CSS) renders the Nebula gradient in both themes with passing
contrast; the streak chip's glow fires only during the existing `.streak-pulse` window and is
verifiably absent at rest (a screenshot taken outside that window shows no glow).

---

## Phase N2 — Rank medallion ring & Finish Sequence 🟡 Shipped in code, ring/glow render not yet confirmed live

**Goal:** ship the one markup-level change (the Nebula ring) and wire the earned-vs-discounted
distinction into the Finish Sequence, since this is where the glow-rationing rule has the highest
stakes — a plausibility-discounted session incorrectly showing Nebula chrome would directly
contradict `lens-2` §4 rule 5's honesty principle.

**Work items:**
- Add `.badge-ring` wrapping element (pattern §2) to wherever `.badge` renders inside a rank-up
  context specifically (not every badge render — resting-state Ranks-list badges get no wrapper).
- Wire the ring + Finish Sequence beat glow to the same `success`-tier event that already drives
  `useCelebrate`'s rank-up beat — no new event/state needed, this reuses the existing signal.
- Explicit negative-path wiring: verify the plausibility-discounted code path (already producing
  muted, non-`success`-haptic output per `lens-2` §5) cannot reach the ring/glow code at all — this
  should be structural (the ring component only mounts inside the rank-up beat's own conditional
  branch, never inside the discounted-session branch), not a runtime `if` that could be gotten
  wrong.
- Ranks page "Rangaufstiege" weekday-strip dot treatment (layout §3).

**Evidence:** `nebula-design-components.md` §3; `nebula-design-system.md` §3 (the plausibility-
discount hard rule this phase is the concrete test of).

**Complexity:** M — the negative-path verification is real design/QA work, not just a CSS add.

**Dependencies:** Phase N0, N1. Benefits from Plan C's own Phase 2 (Finish Sequence rebuild)
shipping around the same time, since both touch the same component — coordinate rather than
sequence strictly.

**Success criterion:** three recorded Finish Sequence runs — a rank-up, a same-band recovery gain,
a plausibility-discounted session — are visually distinguishable by ring/glow presence alone (this
is the same success criterion Plan C §3 Phase 2 already specifies for beat *content*; this adds
that the ring/glow specifically must follow the identical three-way split, not just the copy/LP-bar
behavior).

---

## Phase N3 — Reward surfaces (PR ledger, panels) 🟡 Shipped in code, not independently re-verified live

**Goal:** apply `.panel-reward--nebula` to the new Personal Records screen as it ships under Plan C
§3 Phase 2, and confirm the fallback-tier interaction (pattern §5) doesn't accidentally leak Nebula
styling onto tier-anchored reward panels.

**Work items:**
- `.panel-reward--nebula` modifier class (pattern §5).
- PR-row "just achieved" one-time treatment vs. steady-state ledger list treatment (layout §3) —
  this needs a "newly achieved" flag/timestamp comparison, likely already available since the `prs`
  table already carries an achieved-date column (`lens-2` §2.5) — confirm no new backend field is
  needed before scoping this as a pure-frontend work item.

**Evidence:** `nebula-design-components.md` §3 (Personal Records treatment); Plan C §3 Phase 2's own PR
screen spec, which this phase's work is additive to.

**Complexity:** S, contingent on Plan C's Personal Records screen existing first (this phase adds
paint to a screen Plan C is building the structure/data-wiring for — sequence after, not in
parallel).

**Dependencies:** Phase N0, N1; sequenced after Plan C §3 Phase 2's Personal Records screen ships
its base structure.

**Success criterion:** an account with existing PRs shows the steady-state ledger with small
`--nebula-ink` badges only (no full-card gradient per row); triggering a new PR shows the one-time
`.panel-reward--nebula` treatment on that row only, reverting to steady-state on next visit.

---

## Phase N4 — Verification sweep ⬜ Not run — blocked in part by the light-mode rendering bug (nebula-design-system.md §6)

**Goal:** close the loop on `nebula-design-components.md` §7's cross-cutting rule — confirm no screen
ended up with more than one always-on gradient surface, and no screen missed its intended one.

**Work items:**
- Screen-by-screen audit against `nebula-design-components.md` §1-6, confirming each screen's Nebula
  touchpoints match spec (exactly one resting `.btn-primary`, transient-only everything else).
- Re-run the mobile-viewport check (per this repo's existing `mobile-viewport-check` skill
  convention) across both themes, not just dark — this is the first time that check needs to cover
  two themes.
- Full contrast re-audit (Phase N0's check, re-run after all component migrations land, since a
  component-level color choice made in isolation in Phase N1-N3 could still fail contrast in
  combination with a screen-level background it wasn't tested against).

**Evidence:** `nebula-design-components.md` §7.

**Complexity:** S — this is a checklist pass, not new feature work.

**Dependencies:** N0-N3 complete.

**Success criterion:** every screen in the five-zone IA plus Runs passes the §7 rule by inspection;
zero contrast failures in either theme; light mode has been visually verified in a browser (not
just CSS-reviewed) per this repo's UI-change verification convention.

---

## Sequencing relative to Plan C

| Nebula phase | Plan C phase it rides alongside | Can start independently? |
|---|---|---|
| N0 (tokens/theme) | Plan C Phase 0 (Foundation) | Yes — additive to `tokens.css`, no functional dependency |
| N1 (chrome/CTA) | Plan C Phase 0-1 | After N0 only |
| N2 (medallion ring/Finish Sequence) | Plan C Phase 2 | After N0-N1; coordinate timing with Plan C Phase 2, don't strictly sequence after it |
| N3 (PR ledger paint) | Plan C Phase 2 (PR screen) | After Plan C's PR screen structure ships |
| N4 (verification) | — | After N0-N3 |

Plan C's own phases 1, 3, 4, 5 (Train's functional rebuild, Plan/routines, Profile/Auth, Runs) are
**not blocked on any Nebula phase** — they can proceed on their existing Plan C timeline, picking up
N1's chrome tokens automatically once N1 ships (since `.btn-primary` etc. are shared, centralized
classes), with no separate Nebula-specific work required inside those phases beyond what
`nebula-design-components.md` §2/§4/§5/§6 already calls out inline.

---

## Explicitly out of scope

Inherits `plan-c-new-ui-rebuild.md` §5 in full (no social/multi-user features, no `run_points.cadence`
surfacing, no `demoStartImage` population, no notification infra, no share-card renderer redesign).
Additionally out of scope for this plan specifically:
- **Changing the 9-tier badge system's own colors.** Explicitly ruled out in
  `nebula-design-system.md` §2 — not a deferred item, a rejected one.
- **A second brand color/gradient.** One identity gradient, everywhere it's used. Adding a
  situational second gradient (e.g. a distinct "streak" color separate from "rank-up") was
  considered and rejected — it would recreate exactly the "inconsistent color semantics for active
  state" failure mode `lens-3` §2.3 already flagged and Plan C §2 already committed to fixing.
- **Auto dark/light switching from OS preference.** Framework §2.1 states the reasoning; revisit
  only if user feedback specifically asks for it post-launch.
