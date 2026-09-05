# Nebula — Application Gap Audit (2026-09-05)

**Status: informational / read-only audit.** This document does not change the spec or the plan —
it cross-references `nebula-design-system.md`, `nebula-design-components.md`, and
`nebula-design-plan.md` (the normative "what should be true") against the actual client source in
`packages/client/src` (the "what is true"), to answer one question precisely: **how much of Nebula
is actually implemented, against which yardstick?** Two yardsticks are used throughout, because
they give different answers:

- **Yardstick A — the written spec's own scope.** The spec is explicit that Nebula is *rationed*:
  one gradient, applied to a short, named list of interactive/reward moments, deliberately absent
  from almost every resting surface in the app.
- **Yardstick B — a literal "complete redesign towards Nebula."** If read as "repaint the app's
  visual identity around this gradient," that is a *categorically larger* scope than what any of
  the three normative documents actually calls for anywhere.

No application code was written or modified to produce this report.

---

## Executive summary

**Against the spec's own scope (Yardstick A): mostly done, with one real gap and one real
violation.**

- Phases **N0 (tokens/theme) and N1 (chrome/CTA)** are shipped and independently confirmed live:
  every `.btn-primary` in the app (11 screens/components, `grep` count below) carries the Nebula
  gradient, the HUD level-dot and streak-pulse glow are wired correctly, and the non-tiered
  `.rankbar` fallback exists in source.
- Phase **N2 (rank-up ring)** is shipped in code and — per `workplan-v1.md`'s 2026-09-05 entry
  (§3.5, lines ~142-153) — has now been confirmed rendering live in two separate genuine rank-up
  sessions, closing the one open verification item both `nebula-design-plan.md` and
  `nebula-design-components.md` still list as outstanding as of their own 2026-09-04 timestamp.
  **Those two documents are stale on this one point** — treat the workplan as the newer source of
  truth here.
- Phase **N3 (PR ledger paint)** is shipped in code (`RecordsPage.vue`'s
  `.panel-reward--nebula` binding) but not independently re-verified live (would require triggering
  a fresh PR mid-session) — same status the plan already states.
- Phase **N4 (verification sweep)** has not been formally run as a checklist pass, though this
  audit performs a version of it in the table below. The one bug that was blocking part of N4 (light
  mode not visually applying to Ranks-page/exercise-card surfaces, `nebula-design-system.md` §6) has
  since been fixed and verified live per `workplan-v1.md`'s WS3 batch entry (2026-09-04/05) — the
  design-system doc's "known open defect" framing is now stale.
- **One real gap:** the design-components doc's own claim that Train's set-kind picker and
  rest-timer active states use "solid `--nebula-ink`" is **not what the code does** — grep of
  `SetKindPicker.vue` and `RestTimer.vue` finds zero `--nebula-*` references in either file; both
  use pre-existing set-kind/tier-accent tokens (`--fire`, `--red`, `--expert-3`, `--tier-accent`)
  instead. Functionally this still satisfies the underlying rule ("no gradient on a ~30x/session
  control"), but the spec's own evidence for that claim is inaccurate, not just unverified.
- **One real violation (the "wrong direction" case the audit was asked to check for):**
  `OverviewPage.vue` applies a permanent `--nebula-1` border to three always-visible, non-transient
  cards — `ErholungszoneCard`, the Launchpad card, and any progress tile marked `.tile--priority`
  (`.launchpad.tile--priority`, `.tile--priority`, lines 445-448 and 552-558 of
  `OverviewPage.vue`'s `<style>` block). None of these are on the system doc's positive list (§2):
  they are not a CTA, not the HUD, not mid-transition, not a rank-up beat. This is a small, low-risk
  but real instance of Nebula leaking into ambient/resting decoration — the exact failure mode §3
  and §7 of `nebula-design-system.md` warn against.

**Against a literal "complete redesign" (Yardstick B): the product owner is right, and the gap is
intentional, not a shortfall.** Buttons (`.btn-primary`) are indeed the one adoption a user would
notice on every screen without hunting for it — the HUD dot, the streak-pulse glow, the rank-up
ring, and the PR-ledger accent are all real but small, deliberately transient, or contextual enough
that "only buttons look new" is a fair first impression, not a mistaken one. But **the written spec
does not call for anything beyond that.** It explicitly rejects a tinted base background (§3),
explicitly keeps all nine tier badges and their progress bars off Nebula everywhere (§1, enforced),
and explicitly names ambient decoration as the failure mode it exists to prevent (§7 rule 5). If the
product owner wants a "complete redesign towards Nebula" in the literal sense of a broader,
more visually pervasive identity, **that is a new decision, not an execution gap** — it would mean
revisiting `nebula-design-system.md` §1/§3 (the rationing and neutral-ground rules), not finishing
the existing plan. Executing the current plan to 100% would still leave the app looking, by design,
like "buttons (plus a few small accents) have the newer styling" — because that is what N0-N4 were
scoped to produce.

---

## Token inventory (grep, `packages/client/src`)

`--nebula-1/-m/-2`, `--nebula-grad`, `--nebula-grad-cta`, `--nebula-ink`, `--nebula-ink-on-fill`,
`--nebula-glow`, `--nebula-glow-strong` are defined once in `tokens.css` (dark) and `--nebula-ink`
is redefined once for light mode. Live usage sites, by file:

| File | Usage | On spec's positive list? |
|---|---|---|
| `tokens.css` | `.btn-primary` (`--nebula-grad-cta` fill, `--nebula-ink-on-fill` text); `.rankbar > i`'s non-tiered fallback (`--nebula-1`/`--nebula-2`); `.panel-reward--nebula`'s fallback fill | Yes — both are explicitly listed |
| `App.vue` | `.nav-link.router-link-active` box-shadow fallback (`var(--tier-accent, --nebula-1)`); `.streak-pulse` box-shadow (`--nebula-glow`/`--nebula-glow-strong`); `.level-dot` background (`--nebula-grad`) | Yes, with one nuance: the nav fallback uses solid `--nebula-1`, not the tri-stop `--nebula-grad` the components doc's wording implies — cosmetically negligible on a 2px line, but not byte-identical to spec language |
| `FinishSequence.vue` | `.badge-ring` background (`--nebula-grad`), rank-up beat only; `.badge-ring-muted` deliberately does NOT use it | Yes — exactly the rank-up-beat-only rule |
| `RecordsPage.vue` | `.panel-reward.panel-reward--nebula` class binding, gated on `isRecentlyAchieved(pr.achievedAt)` | Yes |
| `OverviewPage.vue` | `.launchpad.tile--priority` and `.tile--priority` border (`--nebula-1`, light-mode variant `--nebula-ink`) | **No** — see Violation above; applied to `ErholungszoneCard`, the Launchpad card, and any priority progress tile, all resting/always-visible surfaces |
| `RankUpCalendar.vue` | `.nebula-dot`, a small persistent dot on Ranks' weekday rank-up strip | Yes — components doc §Finish Sequence & Ranks explicitly calls this out as "the one persistent Nebula usage," justified as marking a historical fact |
| `themeStore.ts` | comment reference only, no token usage | n/a |
| `shareCard.ts` | Nebula gradient used for the share-card's background glow, wordmark fill, and 2 of 4 stat-card accents ("Nebula Halo," `workplan-v1.md` §3.10) | **Not addressed by the spec at all** — the share card is outside all three normative documents' scope (Track R's own out-of-scope list explicitly excludes "share-card renderer redesign"); this is real, shipped Nebula usage that predates or sits outside the N0-N4 phase plan entirely, not accounted for in any phase's status |

No other `.vue`/`.css` file under `packages/client/src` references any `--nebula-*` token. Files
that use `--tier-accent` (which itself resolves to a tier color, `--b3`, never Nebula) — `WorkoutPage.vue`
(log-set focus ring), `RoutineList.vue` (card border), `RestTimer.vue` (progress ring),
`RankDistributionDonut.vue` (card border) — are correctly *not* counted as Nebula usage; they're the
separate, correctly-untouched tier system.

`.btn-primary` (the one always-verified-live Nebula surface) is used in 17 files:
`WorkoutPage.vue`, `RunsPage.vue`, `WorkoutDetail.vue`, `RoutineList.vue`, `ErholungszoneCard.vue`,
`ReviewStep.vue`, `FastPathStep.vue`, `ArrangeStep.vue`, `AddCustomExerciseForm.vue`,
`ProfilePage.vue`, `OverviewPage.vue`, `NoteCapture.vue`, `OnboardingGuide.vue`, `AuthGate.vue`,
`RunReplay.vue`, `PickStep.vue`, plus the base rule in `tokens.css`. This is the "only buttons have
the newer styling" the product owner is describing — accurately, for that one surface.

---

## Per-screen / component inventory

Verdict key: **Matches** (implementation matches spec's stated scope for this surface) ·
**Partial** (shipped but with a caveat/drift/unverified piece) · **Missing** (spec calls for it,
not built) · **N/A** (spec explicitly doesn't call for Nebula here — absence is correct) ·
**Violation** (Nebula present somewhere the spec's positive list says it shouldn't be).

| Screen / surface | Spec/plan calls for | Actual implementation | Verdict |
|---|---|---|---|
| **Nav shell** (`App.vue`, all screens) | Active-tab indicator falls back to Nebula only when no tier context is in scope | `.nav-link.router-link-active` box-shadow uses `var(--tier-accent, --nebula-1)` — correct fallback direction, but solid `--nebula-1` not the full `--nebula-grad` | Matches (minor token-choice nuance, not a defect) |
| **Overview — primary CTA** | Exactly one `.btn-primary` ("Jetzt trainieren") | Present, gradient confirmed live in both themes per `round2-design-agent-1.md` | Matches |
| **Overview — status strip (`StatTile.vue`)** | Solid `--fire-hi`/`--blue-hi`, explicitly NOT Nebula | Confirmed solid colors only, no `--nebula-*` reference in `StatTile.vue` | Matches |
| **Overview — HUD (`.level-chip`/`.streak-chip`)** | Level-dot ring uses Nebula; streak glow only during `.streak-pulse` | Both wired in `App.vue`; live top-of-screen HUD render not separately re-screenshotted (per components doc) | Partial (cheap live spot-check still open) |
| **Overview — ErholungszoneCard, Launchpad, priority tiles** | Not on positive list — should stay neutral/tier | Permanent `--nebula-1` border applied via `.tile--priority` (OverviewPage.vue lines 232-233, 236, 445-448, 552-558) | **Violation** — persistent, non-transient decorative use outside the positive list |
| **Workout — active logging CTA ("Satz speichern")** | Gradient fill, no glow ever (30x/session is too frequent) | `.btn-primary` present; no glow wired to this button | Matches |
| **Workout — set-kind picker / rest timer active state** | Spec text says "solid `--nebula-ink`" | Actual code uses `--fire`/`--red`/`--expert-3` (SetKindPicker) and `--tier-accent`/`--blue-hi` (RestTimer) — zero `--nebula-*` references in either file | Partial — underlying rule (no gradient, low-frequency-safe solid color) is honored, but the spec's own cited token is wrong; a documentation-accuracy gap, not a build gap |
| **Workout — rank/tier progress card at top of active set** | Stays on 9-tier metal system, no Nebula | No Nebula found; correctly tier-only | N/A (correct absence) |
| **Workout — no top HUD** | `hideTopHud` unrelated to Nebula | Unaffected | N/A |
| **Ranks — resting tier ladder / medallions** | Must stay on 9-tier metal system, never Nebula | No Nebula token found anywhere in `RanksPage.vue`/`TierLadder.vue`/`RankProgress.vue` | Matches (compliance confirmed, not just absence-by-omission) |
| **Ranks — weekday rank-up strip dot** | The one *persistent* Nebula usage, justified as marking a historical fact | `RankUpCalendar.vue`'s `.nebula-dot`, gated on `v-if="d.hasGenuine"`, absent for plausibility-flagged days | Matches |
| **Finish Sequence — rank-up beat (badge ring/glow)** | Nebula ring/glow during the beat only; muted variant for discounted sessions; medallion itself stays metal | `.badge-ring` (`--nebula-grad`) vs `.badge-ring-muted` (`--surface-3`) both present, structurally scoped to Beat 1 only | Matches — and, per `workplan-v1.md` §3.5 (2026-09-05), now confirmed rendering live across two genuine rank-up sessions, closing the one item `nebula-design-plan.md`/`nebula-design-components.md` still flag as open |
| **Finish Sequence — same-band recovery gain** | LP bar animates, no glow/ring layered on | Confirmed live and working per `round2-agent-3.md` | Matches |
| **Finish Sequence — plausibility-discounted session** | Structurally cannot reach glow/ring path | Confirmed: forced-implausible session correctly shown muted, no ring | Matches |
| **Personal Records (Records page)** | Steady-state ledger: small `--nebula-ink` badge only; freshly-achieved row: `.panel-reward--nebula` one-time treatment | `.panel-reward.panel-reward--nebula` bound to `isRecentlyAchieved()`; class/token present and wired | Partial — shipped in code, not independently re-verified live (would require a fresh in-session PR) |
| **Routine builder / wizard (Plan)** | Explicitly low-Nebula; only the final "Speichern"/"Routine erstellen" button | `.btn-primary` present on `ReviewStep.vue`/`FastPathStep.vue`/`ArrangeStep.vue`/`PickStep.vue`; no other Nebula token in any wizard step | Matches |
| **Exercises (list, detail, custom-exercise form)** | Not called out for any Nebula treatment beyond a shared CTA if present | `AddCustomExerciseForm.vue` has `.btn-primary` (Speichern); no other Nebula usage anywhere in exercise list/detail | N/A / Matches (no over-application either) |
| **Profile — theme toggle** | Styled like any settings row, no special treatment | Confirmed — no Nebula on the toggle control itself | Matches |
| **Profile — Save CTA** | `.btn-primary` gradient | Confirmed live in both themes (`round2-design-agent-3.md`) | Matches |
| **Profile — light mode rendering bug** | §6's known defect: `--bg` resolves correctly but Ranks/exercise-card surfaces don't visually go light | Per `workplan-v1.md` WS3 batch (2026-09-04/05): fixed and verified live — light mode now correctly applies to Ionic chrome, the theme-color meta tag, and text on the (deliberately still-dark) tier surfaces | Matches now — `nebula-design-system.md` §6 is stale on this point |
| **Runs** | No Nebula beyond the shared `.btn-primary` | Confirmed — `RunReplay.vue`/`RunsPage.vue` use only `--blue-hi`/`--blue` gradients elsewhere, one `.btn-primary` | Matches |
| **Share card (`shareCard.ts`)** | Not mentioned in any of the three normative Nebula documents; explicitly out of scope for the Track R rebuild ("no share-card renderer redesign") | Uses the Nebula gradient extensively — background glow, wordmark, 2 of 4 stat-card accents ("Nebula Halo," decided/shipped 2026-09-04, corrected 2026-09-05 per `workplan-v1.md` §3.10) | Out-of-spec-scope but shipped — not a violation of a stated rule (no rule covers this surface), but also not accountable to any N0-N4 success criterion; a documentation gap in the plan's own coverage, not a code defect |
| **Empty states, loading skeletons, disabled controls** (all screens) | No Nebula, ever | Confirmed no violations found anywhere | Matches |
| **List rows / tables** (exercise lists, set rows, routine lists) | No gradient row backgrounds; a "just earned" accent is a small inline marker only | Confirmed no violations found | Matches |
| **Base background/ground** (all screens, both themes) | Must stay neutral, no Nebula tint | Confirmed neutral in both `tokens.css` themes | Matches |

---

## Options for the product owner

These are options to choose between, not a plan — no implementation sequencing is proposed here.

**Option 1 — Finish the existing plan exactly as scoped (lowest risk, smallest scope).**
Close the few remaining open items against the *current* spec: fix the `.tile--priority` violation
(drop the `--nebula-1` border on `ErholungszoneCard`/Launchpad/priority tiles back to neutral, or
formally add them to the system doc's positive list if the product owner actually wants that
accent kept), correct `nebula-design-components.md`'s inaccurate claim about
`SetKindPicker.vue`/`RestTimer.vue` using `--nebula-ink`, do the cheap HUD live spot-check, and
re-verify the PR-ledger "just achieved" treatment live. Risk: near-zero — no new visual surfaces,
just closing documentation/verification gaps and one small CSS fix. This does **not** produce
anything close to a "complete redesign" feel; it produces a fully-verified version of the current,
deliberately restrained system.

**Option 2 — Extend Nebula's *existing* rationing rule to a few more genuinely transient/earned
moments, staying inside the spirit of §1/§7 (small-to-medium scope).** Example candidates that
would fit the existing rule without contradicting it: a first-time "new PR" toast/banner elsewhere
in the app beyond the ledger row; a one-time celebratory Nebula flourish on hitting a weekly workout
goal (if such a concept exists or is added); extending the "focus-visible brighter variant" (already
on the positive list but seemingly unused) to primary CTAs app-wide for a visible a11y win that also
reads as more "branded." This is a Phase "N5"-shaped addition to the existing plan, not a rewrite —
moderate risk only in that each new surface needs the same rank-up-style rigor (structural gating,
not a runtime flag) that N2 already had to get right.

**Option 3 — Revisit the spec itself for a broader identity refresh (large scope, a new
decision).** If "complete redesign towards Nebula" means what it says — a more pervasive visual
identity, e.g. a tinted ground, gradient-clip text used more often, glow as a more common resting
accent, or applying the gradient to more chrome than CTAs+HUD+rewards — that requires reopening
`nebula-design-system.md` §1 (the rationing principle) and §3 (the neutral-ground ratification),
which currently rule those exact moves out *by design*, not by oversight. This is not a "finish
what's already planned" task; it is authoring a new visual-identity decision, likely warranting a
fresh mockup pass (as the original Nebula direction itself went through) before any code changes,
since the current system's specific restraint is what makes the CTA gradient read clearly in the
first place (§3's own reasoning). Risk: highest — touches nearly every screen, reopens contrast/
accessibility work (a new light-mode contrast pass, per N0's own success criterion, would likely be
needed again), and directly trades against the rationale that makes the current system legible.

**Option 4 — Do nothing further; document the deliberate scope gap.** If, after reading this audit,
the product owner agrees the *spec's* restrained scope is still correct and only wants the plan's
own remaining verification items closed, no design work is needed at all — just note internally
that "buttons only" is the intended steady state, not a shortfall, so it doesn't get re-raised as a
bug later.

---

## Sources consulted

- `audit/nebula-design-system.md`, `audit/nebula-design-components.md`, `audit/nebula-design-plan.md` (read in full)
- `audit/workplan-v1.md` (read in full)
- `packages/client/src/styles/tokens.css` (read in full)
- `packages/client/src/App.vue`, `FinishSequence.vue`, `RecordsPage.vue`, `OverviewPage.vue`,
  `RankUpCalendar.vue`, `themeStore.ts`, `lib/shareCard.ts` (all `--nebula-*` usage sites, inspected
  in context)
- `packages/client/src/pages/WorkoutPage.vue`, `RanksPage.vue`, `RunsPage.vue`, `ProfilePage.vue`,
  `components/workout/SetKindPicker.vue`, `RestTimer.vue`, `components/rank/RankProgress.vue`,
  `RankDistributionDonut.vue`, `components/routine/RoutineList.vue`, `components/ui/StatTile.vue`,
  `ErholungszoneCard.vue`, and the routine-wizard step components (grepped/read for absence of
  Nebula usage and for `.btn-primary`/`.tier-accent` cross-checks)
- No live browser session was run for this audit; live-render claims above are attributed to the
  cited prior verification passes (`audit/verify/*.md`, `workplan-v1.md`'s dated entries), not
  independently re-confirmed here. Where this audit's source-code read appears to contradict a
  prior live-verification claim (the `SetKindPicker.vue`/`RestTimer.vue` token discrepancy), that is
  flagged as such rather than resolved by assumption.
