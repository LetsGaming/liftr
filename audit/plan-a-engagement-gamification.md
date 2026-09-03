# Plan A — Engagement & Retention

Scope: the motivation/retention layer specifically — rank-system legibility, streak framing,
reward pacing, and data that is modeled server-side but never surfaced. Explicitly not a visual
redesign (that is a separate, parallel plan); a change is only included here if it plausibly
changes how often or how well a real lifter stays engaged with training, and only if a specific
piece of gathered evidence supports it.

Sources cited throughout: `audit/research/lens-1-liftoff-comparison.md` (L1), `audit/research/
lens-2-blind-system-design.md` (L2), `audit/research/lens-3-design-critique.md` (L3), plus older
research (`competitor-design-research.md`, `uiux-engagement-research.md`, `ux-flow-audit-v5.md`)
and `audit/finished/engagement-audit-v4.md`'s product-owner interview (v4-Q\*) where it bears
directly on a phase. Live source citations are given as `path:line` where read directly during
this pass, in addition to what the lens documents already cite.

---

## 1. Evidence synthesis

**The rank system is the product's stated center of gravity, and the evidence agrees it's real,
not decorative.** The product owner interview names it directly: "The Rank system... is the key
part everything is structured around and the one thing that motivates you the most to keep going"
(v4-Q4, v4-Q8). L2 independently arrives at the same conclusion from the schema alone, without
having read that interview: rank/peak/decay-with-buffed-recovery is "the deepest, most
code-supported mechanic in the product" (L2 §6.2), backed by `packages/shared/src/rank/decay.ts`'s
21-day grace window and up-to-2.5x climb-back multiplier. L1 confirms Liftr's on-screen framing of
this system is explicit and distinct from Liftoff's: "Pro Übung · echte Standards wo verfügbar,
sonst abgeleitet — nichts gesperrt" (L1 §3C.5) and "nichts hängt davon ab, kann jederzeit
ausgeblendet werden" for XP/levels specifically (L1 §3C.6). Three independent lenses converge on
"the rank system is real and load-bearing" — this plan treats strengthening its legibility, not
adding parallel new mechanics, as the highest-leverage category of work.

**A specific, concrete gap: three data sources are fully computed server-side and never shown.**
L2 §2.5 is exact about this — `sets.rpe` is captured end-to-end but has zero client references;
`sets.notes`/`workouts.notes` are persisted but have no client read/write path; the `prs` table is
described in the server's own code comment as "an internal append-only 'was this ever a new best'
log the app never displays" (`packages/server/src/services/rankService.ts:14-16`, confirmed live
in this pass: no server route reads the raw `prs` table — `workouts.ts` only derives a per-set
boolean `isPr`, and `grep` across `packages/server/src/routes/*.ts` for `prs` turns up nothing
else). This is the single most concrete, lowest-ambiguity finding in the whole evidence set: real
data, real backend investment, zero UI. L2 §6.5 calls the PR ledger specifically "the single most
concrete retention opportunity available in the data."

**Liftoff's mystery-box mechanics are not evidence Liftr should copy them — the opposite case is
also directly evidenced.** L1's rule-by-rule table (§4) is explicit that Liftr's un-masked
"Nächstes Ziel: 36.25 kg × 9" target and Liftoff's masked "???" are two different, non-interchangeable
product bets resting on different assumptions (population-scale attention engineering vs. a
standards reference a lifter trains against), and L1 states plainly it makes "no claim about which
optimization target is more appropriate" without more evidence. The product owner's own line
between fun and manipulative (v4-Q10) explicitly names "popups that tell you 'just 1 more xyz and
you get abc'" as the manipulative category — a masked near-miss target is structurally that pattern.
This plan does not adopt masking. Conversely, L1 also finds real, evidenced structural constraints
against several other Liftoff mechanics: leaderboards, friends, social feeds, and percentile rank
all "cannot be meaningfully built for a single-user, no-accounts, self-hosted product without
changing its fundamental architecture" (L1 §5B), independently corroborated by L2 §2.1's reading of
the single-row `settings` table and by `packages/server/src/env.ts`'s single-bearer-token auth
model.

**Reward pacing is already good and should be extended, not restructured.** L1 §3D's judgement
(not a fact, flagged as such) is that Liftr's in-chrome, conditionally-staged finish sequence
(rank-up card only when a rank-up occurred, vs. Liftoff's two unconditional full-screen
interstitials every time) is a legitimate different tradeoff, not a deficiency. L2 §5 independently
derives the same conclusion from the code: rank recompute was deliberately moved from per-set to
per-workout so rank-ups "read as one end-of-workout moment" (`packages/server/src/services/
syncService.ts:84-89`), and the existing `useCelebrate`/`useCountUp` primitives already animate
real deltas (`prevLp`→`lp`) rather than generic effects. L3, however, finds a real defect inside
this otherwise-sound system: the finish screen shows the same level/XP number twice at once (top
status pill + "FORTSCHRITT" card) with no visual connection between them (L3 §2.3, Medium) — this
is a legibility bug inside the pacing system, not a case against the system's overall shape.

**Streak framing is substantively evidenced from two angles that agree.** L1 confirms Liftr shows
no full-screen streak-celebration interstitial the way Liftoff does (L1 §3C.3) and has an explicit
anti-farming message reducing rank/XP gain for suspiciously fast sessions with no Liftoff
equivalent observed (L1 §3C.8, `liftr-workout-finish-stats-anti-farming-note.jpg`). L2 independently
derives, from `packages/shared/src/streak/streak.ts`, that the streak token pool scales to the
lifter's own stated `workoutsPerWeek` rather than a flat number, and recommends the UI say
"streak protected: N rest days remaining" rather than a bare countdown (L2 §6.1) — confirmed live:
`FinishSequence.vue:149` already renders "Deine Serie übersteht noch {{ tokensRemaining }}
Ruhetage," so this specific recommendation is already shipped, not a gap. What is not yet addressed
by either lens as shipped: the plausibility/anti-farming message's *legibility as a positive
signal* versus reading as a penalty notice — this is a real open point (see Phase 2).

**Where the lenses conflict or are insufficient, stated plainly rather than resolved by fiat:**
L1's flag in §5A — that Liftr's per-exercise rank cards use an orange/brown gradient visually
similar to Liftoff's metallic tier-card convention — is explicitly a *visual* echo L1 itself says is
"decoupled from the mechanic (gating, near-miss masking, placement quotas) that gives it its
engagement-engineering purpose in Liftoff." This plan does not treat that visual similarity as an
engagement problem (visual-language questions belong to the parallel design plan), but flags it
here because a reader of both plans could otherwise conflate "looks like Liftoff" with "functions
like Liftoff" — L1's own evidence says they don't. Separately, L3's finding that the top-of-screen
XP/streak chrome persists unchanged even during active set-logging (L3 §2.4, Low) is in tension
with L2's density rule that "the set-logging path gets the lowest density... of any screen in the
app" (L2 §4.1) — L3 treats this as wasted vertical space during a focused task; L2's own screen
inventory (§3.2) does not explicitly address whether the persistent header should collapse during
Train. Neither lens directly recommends removing the header during logging; this plan flags it as
an open question (§4) rather than deciding it, since removing an always-visible streak/level pill
also removes the passive "reminder" effect L1's own comparison table (§4, "Header gamification
surface" row) identifies as one thing that surface buys.

**What the evidence does not support:** no document — old or new — finds evidence that Liftr's core
loop is under-rewarded, under-motivating, or that users disengage for lack of gamification. The
gap the evidence actually supports is *narrower*: real progress data that exists and isn't shown
(PRs, RPE, notes), and a handful of legibility/consistency defects inside an already-sound reward
system (double XP display, unconjugated CTA, inconsistent segmented-control accent — L3 §2.3),
not a case for new mechanics.

---

## 2. Phase-driven plan

### Phase 0 — Fix the legibility defects already inside the reward system

**Goal:** the existing finish-sequence and rank/streak surfaces should read cleanly on their own
terms before any new mechanic is added on top of them. These are correctness/consistency bugs
inside mechanics the evidence already says are sound (§1), not new engagement work — sequenced
first because building the PR ledger or any new surface on top of an already-confusing reward
screen compounds the confusion.

- **Deduplicate the finish-screen XP/level display.** L3 §2.3 (Medium): the top status pill and
  the "FORTSCHRITT" card show the same Lv./XP number simultaneously with no visual link. Either
  suppress/dim the top pill while the reward card is showing, or use the reward-card reveal as the
  moment the top pill visibly updates (motion linking the two), per L3's own fix suggestion.
  Effort: **S**, pure UI (`FinishSequence.vue` + the persistent header component).
- **Fix the unconjugated English CTA.** L3 §2.3 (Medium): "▶ Starten" (Overview) vs. "▶ Start"
  (Workout tab) for the same action, one hop apart — breaks the otherwise-consistent German voice
  on the exact button that starts the core loop. Effort: **S**, pure UI, one string.
- **Fix the segmented-control accent-color collision.** L3 §2.3 (Medium): the Workout/Läufe
  toggle uses blue for "active" when Workout is selected but orange when Läufe is selected — the
  same component borrowing both of the app's two semantically-loaded accent colors (blue=primary
  action, orange=status/streak/rank, per L3's own read of the app's color language) for one
  state. Not primarily a visual-polish item here: an accent color that means "streak/rank status"
  elsewhere in the chrome losing that fixed meaning inside a navigation control undermines the
  same color-legibility principle Phase 1/2 below depend on to make rank/streak state scannable at
  a glance. Effort: **S**, pure UI.
- **Fix the wizard's broken step-3 promise.** L3 §2.3 (Medium): the routine wizard's own progress
  indicator promises "1 Wählen · 2 Anordnen · 3 Fertig," but saving from step 2 exits immediately —
  step 3 is never shown. Not itself a retention mechanic, but a system stating an explicit
  progress promise and breaking it is the same category of trust-legibility problem as the XP
  double-display above; included here because it's cheap and touches the same "does the system's
  own progress chrome tell the truth" concern this phase is about. Effort: **S**, pure UI (either
  remove the promised step or add the lightweight confirmation screen it implies).

**Success criterion:** a user finishing a workout sees one unambiguous, consistent progress signal
per stat, and every progress-related affordance (step indicators, CTAs, accent colors) says what it
means and means what it says.

**Sequencing:** independent of all other phases; no dependencies. Should land before Phase 3
(reward-signal expansion) so new signals aren't added on top of an already-doubled display.

---

### Phase 1 — Surface the Personal Records ledger

**Goal:** give the lifter access to data that is already fully computed and stored but currently
invisible — the single most concrete, lowest-ambiguity gap the evidence identifies.

**Evidence:** L2 §2.5 and §6.5: the `prs` table (`packages/db/src/schema.ts:250-262`) is an
append-only best-ever log per exercise×kind (e1rm/weight/reps/volume), each row linked to the set
and date that earned it, explicitly described by the server's own code comment as "an internal
append-only... log the app never displays" (`packages/server/src/services/rankService.ts:14-16`).
Confirmed independently in this pass: no route under `packages/server/src/routes/` exposes the raw
`prs` table for reading — only `workouts.ts` derives a per-set `isPr` boolean for the workout-detail
response. L2 calls this "the single highest-value 'free' screen this design can add, because the
data is already fully modeled and populated server-side" (§3.2) — "free" specifically means no new
computation, only new read access.

**Changes:**
- **New backend: `GET /api/prs`** (or scoped per-exercise, `GET /api/prs/:exerciseId`) returning
  the `prs` rows joined to exercise name/slug and the earning set's date — following the existing
  thin-route/service pattern already used by `rankEvents.ts`/`overallRank.ts`. This is genuinely
  new backend work (a route did not exist), but it is additive-only: no schema change, no new
  computation, since the table is already populated by `rankService.ts` on every workout finish.
- **New client store + screen: "Personal Records"** in the Progress/Ranks area — one row per
  exercise×kind, each showing the achieved value, date, and a link into the originating
  workout/set (matching L2 §3.2's proposed shape). Empty state: "no records yet — your first
  working set on any exercise will start one," explicitly not a fake locked/teaser state (L2 §7,
  "matching the plausibility system's own ethos of never manufacturing false achievement").
- **Entry point from the finish sequence**: when `newPr` fires (already detected server-side per
  L2 §5's reading of `RecomputeResult.rankedUp`/`newPr` in `syncService.ts:66-77`), the existing
  finish-sequence PR beat should link into the new ledger screen rather than being a one-off
  in-session acknowledgment with no permanent home to revisit later.

**Effort:** **M** — needs new backend (one route + one query, no schema/migration), plus a new
client store and screen. Not pure-UI.

**Success criterion:** a lifter can open a screen and see their own all-time bests per exercise,
with dates and links back to the workouts that earned them, without any new backend computation
beyond what already runs on every finish.

**Sequencing:** depends on nothing; can land any time after Phase 0. Should land before Phase 3
(any redesign of the finish-sequence reward surface) since the PR-beat-to-ledger link is cleanest
to build once the ledger destination already exists.

---

### Phase 2 — Reframe the anti-farming message as a trust signal, not a penalty notice

**Goal:** the plausibility system is real, evidenced, and — per the product owner's own stated
hard line against dark patterns and streak-gaming (v4-Q9: "logging fake sets or just doing it
because of the streak is definitely an issue") — worth keeping and making legible, not softening
its function. The gap is presentation, not mechanism.

**Evidence:** L1 §3C.8 observed the on-screen copy directly: "Diese Session wirkte ungewöhnlich
schnell — Rang- und XP-Gewinn wurden reduziert," and found no equivalent anywhere in 111 Liftoff
images/frames — L1's comparison table (§4, "Anti-farming design" row) frames this as Liftr
"explicitly treat[ing] its rank numbers as something whose integrity matters enough to message
about directly," which the product owner's own v4-Q9 answer independently corroborates as a
genuine, not manufactured, concern. L2 §5 confirms the underlying mechanic is real and continuous
(a `[0.05, 1]` multiplier, never a hard zero, computed across three independent severity ramps in
`packages/shared/src/rank/plausibility.ts`) and states the motion/copy treatment must stay "honest
... never states the exact numbers that tripped it," muted, non-celebratory, "the discount is the
headline, not the gain" — this is already the correct posture per L2's own read of the code
comments. What's missing from both lenses: neither confirms or denies whether the *current* live
copy communicates *why* this protects the lifter (their rank stays meaningful) versus reading as
an accusation. This is a genuine evidence gap, not a settled finding — flagged as such.

**Changes:**
- Audit and, if needed, revise the plausibility-discount copy so it states the protective purpose
  ("kept your rank meaningful — reduced this session's gain") rather than only the fact of the
  reduction, while preserving L2's "never states the exact numbers" constraint. This is a copy
  change only; the multiplier logic and its opacity are correct as-is per the evidence and are not
  touched.
- No change to the underlying gate, its thresholds, or its severity ramps — none of the evidence
  gathered questions the mechanism, only (potentially) its wording.

**Effort:** **S**, pure UI/copy. No backend change.

**Success criterion:** the message reads, to a first-time recipient, as "the system is protecting
the meaning of your rank" rather than "you did something wrong" — this is a copy-quality judgment
that would need to be checked against a real user's read of it (see Open Questions §4), not a
metric this plan can define in advance.

**Sequencing:** independent; can land any time. No dependency on other phases.

---

### Phase 3 — Extend the honest-signal set: RPE and notes as optional, self-directed data

**Goal:** two more data sources are captured end-to-end server-side and never read back by the
client (L2 §2.5) — but unlike the PR ledger, these are *inputs* the lifter would have to actively
provide (RPE per set, free-text notes), not passively-computed outputs. This phase is scoped
narrower and flagged as lower-confidence than Phase 1 because the evidence establishes the fields
exist and are wired through sync, not that surfacing them would change engagement — that inference
is this plan's own, stated as such.

**Evidence:** L2 §2.5: `sets.rpe` is captured in the sync payload schema
(`packages/server/src/routes/sync.ts:36`, `logSetPayload`) and the DB column
(`packages/db/src/schema.ts:177`), with zero client references anywhere in `packages/client/src`
— "present as a wire field with no consumer." Same pattern for `sets.notes`/`workouts.notes`: the
server's `patchWorkoutInput` accepts `notes`, but no client store/service reads or writes it.

**Changes:**
- **RPE input during set logging**: a lightweight, optional RPE control (e.g. 6–10 scale) on the
  active-set entry surface, wired to the already-existing `rpe` field in the sync payload (no
  schema change — the field is already accepted end-to-end). Framed as a training-intensity input
  the lifter can use for their own autoregulation, not a required field and not tied to any
  reward — matching L2's characterization of RPE as "a training-intensity signal begging for
  autoregulation/fatigue UI" (§2.5), which is a training-utility framing, not an engagement
  mechanic per se. Its inclusion in this plan rests on the narrower claim that a data input the
  lifter finds useful to record is itself a light engagement lever (more reasons to interact
  thoughtfully with a set beyond just weight×reps), not on any direct evidence that RPE tracking
  increases retention — that causal claim is not established by any lens document and is not
  asserted here.
- **Free-text notes on sets/workouts**: surface the existing `notes` field as an optional
  per-set or per-workout text entry, read back on the History/detail view. L2 frames this as "a
  personal-journal layer" (§2.5) — again, a self-directed, autonomy-respecting addition (SDT
  framing from `uiux-engagement-research.md` §3: informing the user about their own experience,
  not controlling their behavior), not a reward mechanic.
- **No new backend schema or route work required for either** — both fields are already accepted
  by existing endpoints; the gap is entirely client-side (input UI + read-back display).

**Effort:** **M** for RPE (new input control on the highest-frequency screen in the app — per
L2 §2.6, set logging happens ~30x/session, so any addition here must be genuinely optional and
zero-cost to skip, raising the design bar even though the backend work is nil). **S–M** for notes
(lower-frequency surface, less risk of cluttering the sacred loop). Both pure-UI.

**Success criterion:** this is the plan's most speculative phase and should be validated, not
assumed — ship as optional/dismissible, and treat "do lifters who fill in RPE/notes report the
data as useful, or does it sit unused like Liftoff's collapsed-by-default breakdown" as the actual
test, not a completion checkbox. If usage data after shipping shows near-zero adoption, that is a
valid outcome, not a phase failure — the evidence only supports "the data is available to add,"
not "it will be used."

**Sequencing:** independent of Phase 1/2. Because RPE input sits on the set-logging screen — the
single highest-frequency, lowest-density-tolerance surface in the app per L2 §4 rule 1 — this
phase should land *after* Phase 0's legibility fixes are validated as low-risk, and any RPE control
must be reviewed against L2's own density rule before merging (large touch targets, zero added
required taps, collapsed by default if it adds visual weight to the primary stepper).

---

### Phase 4 — Overall Lifter Rank as a persistent headline stat

**Goal:** promote the one account-level, single-player-safe aggregate metric the schema already
computes to a more prominent, persistent position, since the evidence identifies it as structurally
distinct from every other rank signal (it's the only one answering "how good a lifter am I,
overall" rather than a per-exercise or per-session readout).

**Evidence:** L2 §6.3 calls the "Overall Lifter Rank" (`packages/shared/src/rank/aggregate.ts`,
served via `GET /api/overall-rank` — confirmed live, route exists and is already wired,
`packages/server/src/routes/overallRank.ts`) "the one genuinely new single-player-safe idea the
code's own comment calls out... the natural 'profile headline' stat." `competitor-design-research.
md` §2.4 independently supports the *design logic* behind this stat (not Liftr's implementation
directly): Strava's own stated design philosophy is to keep multiple parallel motivation signals
active for different user moods/motivation types rather than collapsing to one number — used there
as an argument for *keeping* per-exercise ranks, streak, and PRs all active in parallel, which cuts
slightly against over-promoting any single aggregate as "the" number. This plan treats the Overall
Rank as a *headline*, not a replacement for the per-exercise ranks or PR ledger — consistent with
both sources.

**Changes:**
- Give the Overall Lifter Rank a persistent, prominent placement (e.g. a profile-screen hero, or a
  badge visible from Overview) rather than requiring a dedicated navigation step to see it — this
  is a placement/prominence change on the client, using data the existing route already returns.
  No backend change: `overallRankService.ts` and its route already exist and are wired.
- No new "trust" UI is proposed here beyond what Phase 5 (below) already covers for the underlying
  per-exercise ranks the aggregate is built from.

**Effort:** **S**, pure UI — the route, service, and aggregation math already exist and are
already consumed somewhere in the client per L2's route inventory; this is a placement/prominence
change, not new data plumbing.

**Success criterion:** a lifter can see their single account-level rank without navigating into the
full Ranks list — it functions as a genuine "at a glance, how am I doing overall" answer, the one
question none of the per-exercise or session-level numbers directly answer.

**Sequencing:** independent; no dependency on other phases. Low risk, can land any time.

---

### Phase 5 — Make `standards.trust` visually legible where ranks are shown

**Goal:** a rank's confidence level (whether it's measured against a real population standard vs.
an extrapolated one) is already computed and already down-weighted in the aggregate math, but is
not visibly distinguished anywhere a rank badge is shown — meaning a lifter currently cannot tell
a "real" rank from a "softer," derived one without inspecting raw data.

**Evidence:** L2 §2.5 (flagged there as "an opportunity... not a confirmed gap, since a `.vue` page
could legitimately render it and I cannot see that" — L2 explicitly could not confirm this from
non-presentational code alone) and §4 rule 5: `standards.trust` distinguishes `real`/`derived`/
`synthetic`, and the aggregate math already down-weights `synthetic` at half value
(`packages/shared/src/rank/aggregate.ts:28`, per L2). This pass independently confirms the
`ranks` API response already includes `trust` per exercise (`packages/server/src/routes/
ranks.ts`, `trustSchema` field on the response object) — so the data reaches the client already;
what's unconfirmed is whether any `.vue` page renders it distinctly, since presentational code was
out of scope for L2 and not reviewed live in this pass either (L3 did not specifically test for a
`synthetic`-trust visual distinction in its live walkthrough).

**Changes:**
- If not already present, add a visibly distinct treatment (not merely a tooltip) for `synthetic`-
  trust rank badges wherever a rank is shown (Ranks list, per-exercise rank card during set
  logging, Overall Rank), consistent with L2's "honest heuristic" principle already followed
  elsewhere in the codebase (`recovery.ts`, `decay.ts`, `plausibility.ts` all contain explicit
  "this is a heuristic, not a claim of precision" comments per L2 §4 rule 5).

**Effort:** **S**, pure UI, contingent on first confirming (during implementation) whether this is
already partially built — this pass could not verify presentational code either, so the actual
scope may be smaller than a full new treatment if some distinction already exists.

**Success criterion:** a lifter looking at a `synthetic`-trust rank can tell, without digging, that
it's a softer estimate than a `real`-trust rank on another exercise — closing a gap between what
the aggregate math already accounts for and what the UI currently communicates.

**Sequencing:** independent; low risk. Worth doing an implementation-time check of current `.vue`
files before scoping further, since this phase's evidence base is explicitly the weakest of the
six (both L2 and this pass flag it as unconfirmed on the presentational side).

---

## 3. Explicitly out of scope

- **Masked/near-miss next-rank targets ("???").** L1 §2C.7 documents this as a real Liftoff
  mechanic and names the tradeoff explicitly (curiosity/return-visit engineering vs. the number
  being training-actionable). Liftr's opposite choice (explicit numeric target, on-screen framed
  as "nichts gesperrt," L1 §3C.5) is itself evidenced product intent, not an oversight, and the
  product owner's own manipulative/fun line (v4-Q10) names exactly this pattern ("just 1 more xyz")
  as the manipulative category. Not adopted.
- **Leaderboards, friends, social feeds, public profiles, percentile comparison.** L1 §5B
  establishes these require a population of other users' data and a friend graph the current
  architecture has no concept of; L2 §2.1 and this pass's own reading of the single-row `settings`
  table and single-bearer-token auth (`packages/server/src/env.ts`) independently confirm the same
  structural boundary. Building any of these would mean changing the product's fundamental
  architecture (accounts, sessions, a social graph) — out of scope for an engagement plan that
  works within the existing data model, per the task's own mandate not to invent backend capability
  the schema doesn't support.
- **Currency/cosmetics economy (shop, inventory, titles, borders, banners).** L1 §2C.4/§4 documents
  this as a Liftoff mechanic specifically valuable when engagement needs a lever independent of
  real physical progress (which naturally plateaus) — but `competitor-design-research.md` §2.3
  separately distinguishes *self-directed* personalization (wanting your own app to feel like
  yours) from *social* cosmetics (wanting to be seen by others) as different, differently-risky
  categories; the Liftoff mechanic under discussion is the latter. No evidence in any lens supports
  building either version now, and the product owner's hard rule against anything that creates the
  feeling of a premium/paywall gate (v4-Q11) makes a shop-style economy a poor structural fit
  regardless.
- **A full-screen, chrome-hiding streak-celebration interstitial matching Liftoff's.** L1 §3D's own
  judgement is that Liftr's lower-ceremony, in-chrome approach is a legitimate different tradeoff
  (lower interruption cost per session) rather than a gap, and no lens document argues the opposite
  with evidence. Not adopted; Phase 0's fix to the *existing* finish sequence (deduplicating the
  double XP display) is the scoped alternative.
- **Onboarding quest/checklist system with a tap-to-reveal gift mechanic.** L1 §2C.8 documents this
  as a Liftoff mechanic explicitly built to incentivize actions like enabling notifications; no
  Liftr-side evidence gap supports adding it, and gating a permission prompt behind a reward is the
  kind of engagement-bait the product owner's own line (v4-Q10) explicitly rejects.
- **Placement/provisional-rank UI (pips implying hidden competitors).**
  `competitor-design-research.md` §1.3/§4.3 documents this as a structure borrowed from
  multiplayer games that "visually implies hidden opponents already ranked in those slots" — makes
  no sense in a single-player system and was already independently rejected in prior audit work;
  no new evidence in this pass reopens the question.

---

## 4. Open questions

These require a product decision this research cannot make on its own — either because the
evidence is genuinely split, or because answering them requires judgment about priorities the
lenses were not asked to weigh in on.

1. **Should the persistent header (level pill + streak pill) collapse or recede during active
   set-logging?** L3 flags the chrome as competing for space on the lowest-density-tolerance screen
   in the app (L3 §2.4); L1's own comparison table names the tradeoff this collapse would cost (loss
   of the passive, always-visible reminder effect). Neither lens takes a side with evidence beyond
   naming the tradeoff — this needs a product call on whether ambient visibility or logging-screen
   minimalism matters more, not a further research pass.
2. **Is the plausibility-discount copy's actual current wording a problem, or is this plan's
   Phase 2 concern hypothetical?** No lens document evaluated the copy's *reception* (how a real
   recipient reads it), only its existence and its stated design intent. Before investing effort in
   Phase 2, worth confirming with the person who wrote the current string (or a small real-user
   check) whether it already lands as intended.
3. **What does "success" mean for Phase 3 (RPE/notes)?** This plan is explicit that this phase
   rests on an inference (available data → worth surfacing), not a demonstrated engagement gap. A
   product decision is needed on whether to ship it as a low-cost experiment with an explicit
   after-the-fact usage check, or to deprioritize it until a more direct signal (e.g. a user
   request) exists.
4. **How much prominence should the Overall Lifter Rank (Phase 4) actually get?** L2 calls it the
   natural profile headline; the Strava-sourced design principle in `competitor-design-research.md`
   §2.4 cautions against over-collapsing multiple parallel signals into one number. Where exactly on
   that spectrum Liftr should land — "one prominent badge among several visible signals" vs. "the
   single most prominent number in the app" — is a product taste call this plan intentionally
   leaves open rather than resolving unilaterally.
5. **Should the PR ledger (Phase 1) be scoped as one flat list, or grouped/filterable (by
   exercise, by kind, by recency)?** L2's proposed shape (§3.2) is a starting sketch, not a finished
   spec — the exact information architecture of the new screen is a product/UX decision for
   whoever implements Phase 1, informed by but not dictated by this plan.
