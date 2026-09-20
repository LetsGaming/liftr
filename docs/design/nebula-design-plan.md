# Nebula — Design Plan

**Point-in-time note:** this document is a snapshot of a specific phased-rollout plan, describing
the design system as last verified against the shipped app (2026-09-04). Treat it as a historical
phasing/dependency reference, not a continuously-maintained living plan.

**Status as of 2026-09-04: Phases N0-N3 are shipped in code.** N0 (tokens/theme) and N1
(chrome/CTA) were confirmed working live, not just in source. N2 (medallion ring/Finish Sequence)
exists in code and is correctly scoped; its live rendering during an actual rank-up beat was the
top remaining verification item at the time. N3 (PR ledger paint) exists in code. **N4
(verification sweep) had not been run**, partly blocked by one real bug: light mode does not
visually apply to Ranks-page surfaces despite resolving correctly in CSS (`nebula-design-system.md`
§6) — check current status before assuming it's still open. This plan document is kept as the
historical phase breakdown and dependency map; the normative spec lives in
`nebula-design-system.md` and `nebula-design-components.md` (this document's own tokens/patterns/
layout content was consolidated into those two files and this file's description of them below is
retained only where it adds phasing/sequencing detail not repeated there).

Phased execution plan turning `nebula-design-system.md` / `nebula-design-components.md` into
shipped code. This was scoped as an amendment layered onto a prior UI-rebuild plan's phase
structure, not a parallel rebuild — every phase below maps onto a phase of that plan and adds
Nebula-specific work items to it. Where this plan's scope is smaller than a full rebuild phase
(most of it — see §0), that's because Liftr's existing token/component system already carried most
of the Liftoff-inspired language the mockup rounds were exploring (`nebula-design-system.md` §1).

---

## 0. Scope framing

This is **not** a ground-up UI rebuild. It's:
1. One new token layer (`--nebula-*`) added to `tokens.css`.
2. One genuinely new capability (light mode + theme store) that didn't exist before.
3. A bounded set of component-level swaps applied to existing, already-built components —
   `.btn-primary`, `.rankbar`, `.level-chip`/`.streak-chip`, `.panel-reward`.
4. One markup-level addition (the Nebula ring around rank medallions) that needs a Vue template
   change, not just CSS.

Everything else (nav shell fallback behavior, RPE/notes capture, Personal Records screen, routine
wizard fixes, auth entry point, etc.) proceeds on its own track — this plan does not re-scope any
of that functional work, only its paint.

---

## Phase N0 — Token & theme foundation

**Goal:** ship `--nebula-*` tokens and light-mode infrastructure before any component migrates to
them, so no later phase has to retrofit theme-awareness into something already shipped without it.

**Work items:**
- Add `--nebula-1/-m/-2`, `--nebula-grad`, `--nebula-grad-cta`, `--nebula-ink`,
  `--nebula-ink-on-fill`, `--nebula-glow`, `--nebula-glow-strong` to `tokens.css` `:root`.
- Add the `:root[data-theme="light"]` block with every existing token re-specified for light, not
  just the new ones — the largest single work item in this phase: a systematic contrast pass across
  `--bg` through the 9-tier badge tokens.
- Build `themeStore` (Pinia), boot-time `data-theme` application (before first paint — a flash of
  wrong theme is a regression, not a cosmetic nit), local-storage persistence.
- Add the theme toggle control to Profile — UI only; wiring is the store above.

**Evidence:** `nebula-design-system.md` §6 (full light-mode spec), `liftr-pulse-liftoff-
finalists.html` (the light-mode content rules this codifies: gradient reserved for filled surfaces,
solid ink for text, neutral shadow not colored glow).

**Complexity:** M (the token audit is genuinely a full pass over every existing color value; the
store/toggle itself is small).

**Dependencies:** none — additive to `tokens.css`.

**Success criterion:** toggling the theme control re-renders every screen with no unstyled/
low-contrast flash; a scripted contrast check (existing tokens already have measured ratios noted
in `tokens.css`'s comments — e.g. `--dim` at "5.60:1 on --surface-2" — the light-mode equivalents
need the same measurement, not just a visual eyeball) passes WCAG AA (4.5:1 body text, 3:1 large
text/UI) for every text-on-surface pairing in both themes.

---

## Phase N1 — Chrome & CTA migration

**Goal:** apply Nebula to the always-visible, high-frequency chrome — HUD and primary buttons —
since these are the surfaces every other phase's screens inherit from, and getting the
glow-rationing rule right here sets the precedent every later phase follows.

**Work items:**
- `.btn-primary` background/ink migration — one CSS change, reaches every call site at once.
- `.level-chip`/`.streak-chip` accent migration + streak-pulse glow wiring.
- Non-tiered `.rankbar` fallback migration.
- Nav active-indicator fallback migration.

**Evidence:** `nebula-design-components.md` §1/§3/§4; `nebula-design-system.md` §4 (glow rule, must
be implemented correctly here since Phase N1 is where it's first exercised in real code, via the
existing `streakJustExtended` trigger in `App.vue`).

**Complexity:** S — every target here is a single already-centralized CSS class or a small,
already-isolated piece of `App.vue` state (`streakJustExtended`). This is the highest-leverage,
lowest-risk phase in the whole plan.

**Dependencies:** Phase N0 (tokens must exist first).

**Success criterion:** every `.btn-primary` in the app (grep for the class, verify against a
built/running app, not just the CSS) renders the Nebula gradient in both themes with passing
contrast; the streak chip's glow fires only during the existing `.streak-pulse` window and is
verifiably absent at rest (a screenshot taken outside that window shows no glow).

---

## Phase N2 — Rank medallion ring & Finish Sequence

**Goal:** ship the one markup-level change (the Nebula ring) and wire the earned-vs-discounted
distinction into the Finish Sequence, since this is where the glow-rationing rule has the highest
stakes — a plausibility-discounted session incorrectly showing Nebula chrome would directly
contradict the app's honesty principle around discounted sessions.

**Work items:**
- Add `.badge-ring` wrapping element to wherever `.badge` renders inside a rank-up context
  specifically (not every badge render — resting-state Ranks-list badges get no wrapper).
- Wire the ring + Finish Sequence beat glow to the same `success`-tier event that already drives
  `useCelebrate`'s rank-up beat — no new event/state needed, this reuses the existing signal.
- Explicit negative-path wiring: verify the plausibility-discounted code path (already producing
  muted, non-`success`-haptic output) cannot reach the ring/glow code at all — this should be
  structural (the ring component only mounts inside the rank-up beat's own conditional branch,
  never inside the discounted-session branch), not a runtime `if` that could be gotten wrong.
- Ranks page "Rangaufstiege" weekday-strip dot treatment.

**Evidence:** `nebula-design-components.md` §3; `nebula-design-system.md` §4 (the plausibility-
discount hard rule this phase is the concrete test of).

**Complexity:** M — the negative-path verification is real design/QA work, not just a CSS add.

**Dependencies:** Phase N0, N1. Coordinate with the Finish Sequence rebuild work touching the same
component, rather than strictly sequencing after it.

**Success criterion:** three recorded Finish Sequence runs — a rank-up, a same-band recovery gain,
a plausibility-discounted session — are visually distinguishable by ring/glow presence alone.

---

## Phase N3 — Reward surfaces (PR ledger, panels)

**Goal:** apply `.panel-reward--nebula` to the Personal Records screen and confirm the
fallback-tier interaction doesn't accidentally leak Nebula styling onto tier-anchored reward
panels.

**Work items:**
- `.panel-reward--nebula` modifier class.
- PR-row "just achieved" one-time treatment vs. steady-state ledger list treatment — this needs a
  "newly achieved" flag/timestamp comparison, likely already available since the `prs` table
  already carries an achieved-date column — confirm no new backend field is needed before scoping
  this as a pure-frontend work item.

**Evidence:** `nebula-design-components.md` §3 (Personal Records treatment).

**Complexity:** S, contingent on the Personal Records screen's base structure existing first —
sequence after, not in parallel.

**Dependencies:** Phase N0, N1; sequenced after the Personal Records screen ships its base
structure.

**Success criterion:** an account with existing PRs shows the steady-state ledger with small
`--nebula-ink` badges only (no full-card gradient per row); triggering a new PR shows the one-time
`.panel-reward--nebula` treatment on that row only, reverting to steady-state on next visit.

---

## Phase N4 — Verification sweep

**Goal:** close the loop on `nebula-design-components.md`'s cross-cutting rule — confirm no screen
ended up with more than one always-on gradient surface, and no screen missed its intended one.

**Work items:**
- Screen-by-screen audit against `nebula-design-components.md` §1-6, confirming each screen's Nebula
  touchpoints match spec (exactly one resting `.btn-primary`, transient-only everything else).
- Re-run the mobile-viewport check (per this repo's `mobile-viewport-check` skill convention) across
  both themes, not just dark.
- Full contrast re-audit (Phase N0's check, re-run after all component migrations land, since a
  component-level color choice made in isolation in Phase N1-N3 could still fail contrast in
  combination with a screen-level background it wasn't tested against).

**Evidence:** `nebula-design-components.md` (cross-cutting rule).

**Complexity:** S — this is a checklist pass, not new feature work.

**Dependencies:** N0-N3 complete.

**Success criterion:** every screen in the app's navigation passes the cross-cutting rule by
inspection; zero contrast failures in either theme; light mode has been visually verified in a
browser (not just CSS-reviewed).

---

## Explicitly out of scope

- **Changing the 9-tier badge system's own colors.** Explicitly ruled out in
  `nebula-design-system.md` §2 — not a deferred item, a rejected one.
- **A second brand color/gradient.** One identity gradient, everywhere it's used. Adding a
  situational second gradient (e.g. a distinct "streak" color separate from "rank-up") was
  considered and rejected — it would recreate the "inconsistent color semantics for active state"
  failure mode this system is meant to avoid.
- **Auto dark/light switching from OS preference beyond first launch.** The theme store reads
  `prefers-color-scheme` once on first launch and then defers entirely to the user's explicit
  toggle; revisit only if user feedback specifically asks for it post-launch.
- No social/multi-user features, no `run_points.cadence` surfacing, no `demoStartImage`
  population, no notification infra, no share-card renderer redesign.
