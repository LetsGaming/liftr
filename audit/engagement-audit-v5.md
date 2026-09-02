# Liftr — UX Flow & Organization Audit v5

## Method (read this before the findings)

Where v4 used a product-owner interview as its valuation lens, this round used **five independent
cold agents**, each testing one part of the live app (localhost:5173) as a real user performing a
real task, with no access to prior audit conclusions — the goal was to answer one question without
begging it: *does the current tab structure, page organization, and settings layout actually have a
right to exist, or does using it for real reveal it needs reorganizing?* Full raw findings are in
`research/ux-flow-audit-v5.md`; this document turns those findings into prioritized, scoped phases the same
way v4 turned research+interview into phases.

**Headline result, stated up front because it cuts against the question's own framing**: testing did
**not** validate a reorganization. No agent found a case for merging pages, building a unified
"needs attention" inbox, or restructuring the tab bar. What testing found instead is duplication,
one shipped-but-broken save path, and a settings page that needs headers, not a new IA. Treat this
document as a bug-and-duplication punch list wearing a phase structure, not a redesign brief — and
don't let it grow into one.

This is v5 because v4 (`finished/engagement-audit-v4.md`) already shipped the routine-suggestion engine,
`PathChooser`/`FastPathStep`, the Phase 2 tier-accent visual pass, and closed its own scope. This
round is a new, narrower increment triggered by testing the shipped v4 routine builder for real —
Phase 1 below is a direct consequence of that testing, not a new idea.

---

## 1. Hard boundaries (carried forward from v4, still binding)

Unchanged from `finished/engagement-audit-v4.md` §2 — restated because Phase 3/4 below touch Overview and
Profile, both areas the boundaries constrain:

1. No subscription/premium gate or anything that creates the *feeling* of one.
2. No urgency/scarcity popups.
3. No feature bloat — no new tabs, no new top-level surfaces. Every fix in this round is a
   **subtraction or a re-weighting of existing content**, never a new page.
4. No social/competitive-with-strangers features.
5. Any prioritization/"needs attention" treatment added in Phase 4 must read as informational
   surfacing (like a rank-up nudge), never as manufactured urgency ("don't lose your streak!").
   This is the same fun/manipulative line from v4 §2.5, applied to whatever visual priority
   treatment Phase 4 lands on.

## 2. What already works — do not touch

Confirmed by direct testing, not just code review, so these are closed, not "assumed fine":

- **The 5-tab IA itself.** Overview / Workout / Ranks / Exercises / Profile is a sound split;
  Exercises tab vs. in-wizard exercise picking is legitimate component reuse (`ExerciseList.vue` in
  two modes), not duplication.
- **The routine wizard's step shape.** PathChooser → Pick/FastPath → Review is one coherent task,
  not a maze; `ReviewStep.vue`'s glance-checks (via `useRoutineReviewChecks.ts`) are good and
  correctly shared between the manual and fast paths.
- **Rest timer, autosave, and finish-sequence motion.** `RestTimer.vue` is inline, skippable, and
  intentionally non-persisted (by design — losing a rest countdown to a crash is a non-issue).
  `activeWorkoutStore.ts` persists after every mutation, so app-kill/lock mid-set is safe. The
  celebration sequence is skippable, reduced-motion-aware, and doesn't manufacture empty beats.
- **Mid-set logging mechanics.** Tap-to-type on the number itself, long-press-to-accelerate on the
  steppers — both good interaction design, just under-discoverable (Phase 2 below), not broken.

Do not re-litigate any of the above. Nothing here needs a phase.

---

## Phase 1 — Fix the two correctness bugs (highest priority, blocks everything else)

**Priority: highest — these aren't UX opinions, they're bugs that make a shipped v4 feature and the
app's single most frequent action unreliable.**

### 1a. Muscle-guided routine save fails silently

The suggestion engine (`routineSuggestionService.ts`) returns fractional rep targets (3.75, 4.25...)
for bodyweight substitutes. The server's zod schema (`packages/server/src/routes/routines.ts`)
requires `reps: z.number().int().min(1)`, so the POST 400s. `RoutineWizard.vue`'s `save()` has no
`.catch`, so the user sees the button reset with **zero explanation**. This is the guided path v4
built specifically to solve routine-creation friction — reproduced twice, on the first two real
attempts to use it.

- Round/validate reps wherever the suggestion engine computes them, so a fraction is never
  generated in the first place.
- Add a client-side integer guard before POST as a backstop, independent of the server fix.
- Surface any `save()` failure as an inline error/toast — silent failure is not acceptable
  regardless of how the root cause gets fixed.

### 1b. Numeric set-entry can concatenate digits instead of replacing them

`NumberStepper.vue`'s direct-entry input auto-focuses but doesn't select existing text, so typing
over a stale value appends instead of replacing (e.g. "0" + "9" → "09"). One-line fix
(`select()` on focus), but it's a real data-integrity risk in the single most-repeated interaction
in the app (logging a set).

**What not to do**: don't scope this phase into a broader "harden the wizard" or "redesign
NumberStepper" effort. Both are one targeted fix each; resist letting the phase grow.

---

## Phase 2 — Cut duplication (Overview / Ranks / Profile)

**Priority: second.** Three independent agents found the same shape of problem in three places:
content that already has a canonical home gets fully re-rendered elsewhere instead of linked to.
This is the actual answer to "does the organization need reorganizing" for the dashboard pair — the
pages are right, the redundant content inside them isn't.

- **Overview's "Top Ränge" tile** duplicates the identical top-3 exercises/tiers/LP values Ranks
  shows in full. Cut it down to a single actionable line (e.g. "X LP bis Sportler in Bizepscurls")
  or drop it — the existing "Rang-Analyse" link into Ranks already covers the teaser job.
- **Overview's "Daten-Export" shortcut** duplicates the export feature that lives on Profile. Keep
  one instance; link, don't re-implement.
- **Two independently-worded LP explainer strings** exist (Overview's and Ranks' `InfoToggle`
  instances). Unify into one canonical string, reused via the existing component.

**What not to do**: don't remove the summary/detail relationship itself (Overview showing an
overall-tier tile that Ranks expands into the full ladder is a correct pattern, confirmed by
testing) — only cut the parts that are exact re-renders of Ranks/Profile's own detail content, not
every mention of rank on Overview.

---

## Phase 3 — Profile: split by domain, don't rebuild

**Priority: third.** Testing found Profile isn't wrongly organized so much as four unrelated domains
flattened into one identical-looking scroll with no headers: training config (bodyweight, sex/age/
experience/frequency, equipment, plates), stats (XP & Level — arguably doesn't belong in settings at
all), server admin (API-Token, Health Connect, Daten-Export), and About (Quellen & Lizenzen).

- Add real section headers: **Trainingsprofil** / **Fortschritt** / **Daten & Server** / **Über**.
  This alone resolves the "flat list, have to scroll past unrelated settings" complaint — it is a
  grouping pass on existing `.card` sections, not a new page or new IA.
- Give the Daten & Server section (API-Token, Export) a visually distinct, quieter/advanced
  treatment so casual users aren't scanning past server-admin concerns to reach training settings —
  this is not a "danger zone" (there's no destructive action here; no login system means no
  logout/delete-account to gate), just a lower-priority visual tier.
- Small, contained gaps worth folding into this same pass since they're touched anyway: no
  units toggle (kg hardcoded), no explicit "remove token" action (only overwrite).

**What not to do**: don't turn this into a settings-architecture redesign, don't add tabs/sub-navs
inside Profile — headers on the existing single scroll are enough per what testing actually asked
for.

---

## Phase 4 — Surface priority on Overview (the "needs attention" question, answered)

**Priority: fourth — this directly answers whether a unified "needs attention" inbox is warranted.**

**Verdict: no, not as a new surface.** The raw signal already exists on Overview (resume-workout
card, recovery-zone status, the "Rangaufstiege diese Woche" weekly nudge) — testing found it's
rendered with the same flat visual weight as every neutral stat tile below it, not that it's
missing or that a new cross-tab surface is needed.

- Give Overview's existing action-relevant cards (resume workout, rank-up pending, recovery status)
  actual visual priority — distinct treatment from the plain stat tiles, not a new section.
- The empty "Rangaufstiege diese Woche" state currently reads as a flat, slightly discouraging
  status line ("Der erste Aufstieg dieser Woche steht noch aus") — reframe as encouraging/actionable
  tone, still within the fun-not-manipulative boundary (§1.5): information, not pressure.
- If a cross-tab signal is wanted at all, the smallest version that respects §1.3 (no bloat) is a
  single badge/dot on the Ranks tab icon when a rank-up is pending — evaluate only after the
  above ships, don't build both at once.

**What not to do**: do not build a merged inbox, a notifications page, or a new "attention" tab.
Nothing in five independent tests found evidence users need cross-domain triage; they need the one
page they already open first (Overview) to visually rank its own content.

---

## 5. Explicitly out of scope / tracked but not scheduled this round

- **The Workout/Läufe "merge."** Testing found the switcher only appears on the finish screen (not
  mid-session) and Läufe is a structurally different paradigm (GPX import / retroactive manual entry
  vs. live logging) — it reads as two features sharing a tab slot, not a real unified mode. This is
  real, but it's a naming-and-expectations issue, not a bug or a duplication problem, and fixing it
  properly means either a genuine merge (real scope, needs its own shape pass, not a quick patch) or
  consciously stopping the implication that it's one mode. **Do not fix this as a side effect of
  Phases 1-4** — track it for a future round's discovery pass.
- **Workout vs. Exercises tab icon confusability.** Real, minor, one-line-fix-adjacent, but not
  urgent enough to justify its own phase — fold into whichever future pass next touches `App.vue`'s
  `navItems`, don't schedule a phase solely for two SVG paths.
- **`/runs` nav-orphaned route.** Confirmed live and reachable, not dead code, just not discoverable
  outside the in-page switcher. Leave as-is until the Läufe-merge question above is actually
  resolved — fixing discoverability now would cement the current half-merged state as permanent.
- **Finish-screen missing explicit "Fertig" CTA.** Real minor dead-end (only exit is sidebar nav).
  Small enough to bundle into Phase 1 or 4's implementation PR opportunistically, but not worth its
  own phase or blocking either on it.
- **Exercise and Profile tabs' broader "light work"** flagged in v4 §5 as wanted eventually but
  explicitly not now — Phase 3 above satisfies the Profile portion narrowly (headers only); Exercise
  tab remains untouched per that standing instruction.

---

## 6. What this round is explicitly not

To keep this document from being read as license to keep pulling in scope: this round does **not**
revisit the tab bar, does **not** touch the routine wizard's step count or path structure (both
validated as correct), does **not** open a new "share-card" or "onboarding" workstream (both remain
correctly deferred per v4 §4/§6), and does **not** treat "boring/no USP" (v4 Phase 2's mandate) as
this round's job — that visual-identity work is v4's, already closed. This round's job is narrower
and more mechanical: fix two bugs, delete three duplicated things, add four headers, re-weight one
page's existing cards.
