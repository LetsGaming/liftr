# Liftr — Engagement & Polish Audit v4

## Method (read this before the findings)

This round inverts the usual order: two research documents were produced first
(`competitor-design-research.md`, `uiux-engagement-research.md`), then the product owner was
interviewed **without referencing either document**, specifically so the interview would surface
real priorities rather than echo back whatever the research had just said. This document uses the
interview as the *valuation lens* — it decides what matters and how much — and only then pulls in
research findings that are relevant to what the interview surfaced. Findings from either research
doc that the interview didn't validate as a real priority are named in §6 but explicitly not
scheduled as work.

This is v4 because v3 (`engagement-audit-v3.md`, all 6 phases merged) already shipped the
rank-engine redesign, the visual-identity pivot toward Liftoff's material language, the dashboard
layout fixes, anti-cheat hardening, the motion audit, the share-card redesign, and a copy pass.
This round is the next increment, not a restart.

---

## 1. Interview findings — the source of truth for this document

Verbatim positions from the 2026-09-02 interview (see §7 for the full Q&A):

- **Audience**: solo-only today; the road-mapped future is a small self-hosted multi-user setup
  (explicitly compared to Home Assistant), not a public/social product. Any future feature must
  make sense for "me, then a few people I trust," never "a general audience."
- **Origin story, stated directly**: Liftr exists *because of* three specific frustrations with
  Liftoff — dark patterns pushing premium, feature bloat, and near-absent running support.
  Liftoff is simultaneously "the biggest inspiration" and the thing Liftr is a reaction against.
  Any recommendation that reintroduces reason #1 or #2 is disqualified regardless of engagement
  upside.
- **What already shines, unprompted and unambiguous**: the rank system. Quote: *"It is the
  keypart everything is structured around and the one thing that motivates you the most to keep
  going."* Also: *"it instantly on its own shows you where you stand and where to go and what you
  already have achieved."* This is not a nice-to-have feature — it's the product's spine.
  **Protect it; don't dilute it with parallel systems.**
- **What's lukewarm despite investment**: the share-card. Quote: *"it exists its pretty cool i
  guess."* v3 spent a full phase redesigning this and it still lands as a shrug. Worth
  re-examining *why* before investing further (see §4).
- **The single biggest source of real friction, named twice, unprompted**: routine creation and
  editing, specifically the manual (non-muscle-guided) path's step count, and a second-order
  problem the muscle-guided path introduced — see §3.
- **The gamification fun/manipulation line, given with concrete examples on both sides**:
  - Fun: rank-ups, XP gain, small animations during and after sets.
  - Manipulative: a feature offered free then paywalled shortly after; animation/engagement-bait
    designed to make you do something you wouldn't otherwise do; "just 1 more X and you get Y"
    popups.
  - This is an unprompted, independently-arrived-at restatement of the Hook Model / dark-pattern
    distinction in §3 of `uiux-engagement-research.md` — strong convergent validation that the
    research's ethical framework matches the product owner's actual values, not just theory.
- **Two explicit hard rules**: no premium subscription tied to dark patterns (or anything
  resembling that mechanism), and — inferred from the origin story — no reintroduction of bloat.
  These are non-negotiable regardless of what any future data says about retention lift.
- **One explicit openness**: a genuinely uncomfortable-but-fair retention lever would be
  considered case-by-case — this is not a blanket "keep everything safe" stance, it's specifically
  anti-*dark-pattern*, not anti-boldness.
- **The stated overall gap, in the product owner's own words**: *"Most things are already very
  well worked out and functional, but the main flaw is the look regarding UX. A lot of parts of
  the app either look boring, too common or don't really have an unique selling point."* Exercise
  and Profile tabs need light work; nothing else should be touched structurally right now.

---

## 2. Hard boundaries (non-negotiable for this round and beyond)

Carried forward from `liftr-audit.md`/v3 where they already existed, and now confirmed directly
by the product owner rather than inferred:

1. **No subscription/premium gate of any kind**, and no mechanism that creates the *feeling* of
   one (a feature that appears then requires payment shortly after; a feature that's obviously
   designed to be taken away to create urgency).
2. **No urgency/scarcity popups** ("just 1 more X and you get Y", countdown timers on non-time-
   limited things, "don't lose your streak!" interstitials).
3. **No feature bloat.** Every new surface must justify its tab-bar/nav cost; v3's "resist 6+ tabs"
   rule stands, now backed by the interview's origin story, not just the Liftoff comparison.
4. **No social/competitive-with-strangers features**, ever — reconfirmed structurally by the
   solo-then-small-trusted-group roadmap, which makes a public social layer actively wrong for the
   product's future shape, not merely undesired today.
5. **Any engagement mechanic must pass the product owner's own two-sided test** from the
   interview: does it look like "rank-up / XP / small animation" (keep), or "paywall bait / do-
   this-or-lose-that popup / manufactured urgency" (reject)? This is now the standing acceptance
   test for any future engagement feature — simpler and more concrete than any external framework,
   and it's *their* words, not a research paraphrase.

## 3. What already shines — protect and amplify

- **The rank/tier/LP system.** Named unprompted as both the favorite feature and the primary
  motivator. Implication for future work: any redesign work on other surfaces (routine builder,
  visual identity) should look for chances to *surface the rank system more*, not compete with it
  for attention. Do not add a second parallel progression system (a separate "streak league," a
  second currency) — v3's `FinishSequence.vue` sequencing rule and this interview's "rank is *the*
  thing" both point the same way: one spine, not two.
- **Per-set/post-set micro-animations, XP gain, rank-ups** — explicitly named as the "fun" side of
  the fun/manipulative line. These are validated as work to *lean into* further, not restrain.
  Read this alongside `uiux-engagement-research.md` §2's "reserve heavier motion for rare, earned
  moments" — the product owner's own examples (ranking up, XP gain) already are the rare/earned
  category, so amplifying them doesn't conflict with the motion-restraint research, it's the
  correct target for that budget.
- **Everything the competitor research confirmed Liftr already does at or above the field's best**
  (recovery heat-map, previous-value autofill, in-session rank bar, sequential post-workout
  reveal, full-bleed tier-color reward cards, offline-first architecture) — no action needed, but
  worth stating so future audits don't waste a cycle re-discovering these are already solved.

## 4. The share-card question (don't schedule work yet — diagnose first)

The interview surfaced a real signal: a fully-shipped, recently redesigned feature that the
product owner can't get enthusiastic about. Before scheduling any more share-card work, the
question worth answering is *why* it's a shrug, not *how to make it prettier* — those are
different problems and only one of them is a design problem:

- Is it a **usage-context** problem — the card gets generated and then just... sits there, because
  there's no one to share it *to* yet (solo user, no social graph)? If so, no amount of visual
  polish fixes it; the feature may simply be ahead of the audience it needs, and that's fine to
  name explicitly and defer rather than keep re-polishing.
- Is it a **content** problem — does the card, even when well-drawn, fail to capture the thing the
  product owner actually cares about (the rank/LP progress that's named as the real motivator),
  making it feel disconnected from what the app is actually "about" to them?
- Is it genuinely a **craft** problem that a future `/impeccable critique` pass would catch?

**Recommendation**: do not schedule a Phase-6-style share-card rework in this round. If it comes up
again, start with a 10-minute conversation ("when would you actually want to share one of these,
and to whom") before touching code — this is a product-fit question, not a visual one, and no
amount of the competitor research's "full-bleed reward material" guidance (already applied in v3)
will fix a product-fit gap.

## 5. Explicitly out of scope for this round

- **Exercise and Profile tabs** — the product owner wants light work here eventually but
  explicitly does not want deep rework right now. Do not let this round's momentum pull either tab
  into a full redesign; if small, contained fixes surface naturally while working elsewhere, note
  them for a future light pass rather than expanding scope now.
- **Any structural/functional rework of already-working systems** — the interview is explicit that
  "most things are already very well worked out and functional." This round's mandate is UX/visual
  identity and the routine-builder friction point, not a re-architecture of anything else.
- **Anything from either research document that the interview didn't validate** — see §6 for the
  specific items and why they're being named-but-not-scheduled rather than silently dropped.

---

## Phase 1 — Routine builder: fix the trust gap, not just the step count

**Priority: highest.** This is the only friction point volunteered twice, unprompted, in the
interview, and it's described as bad enough that "in the best case you don't do it at all."

### The actual problem, as stated

Two distinct issues, both real, and they compound:

1. **The manual builder (`RoutineWizard.vue`'s Pick → Arrange → Review path) has too many steps**
   for what should be a quick task, especially compared to the muscle-guided path.
2. **The muscle-guided path (`recommendExercises`/`routineStore.suggest`) solved step 1 by
   generating the routine for the user — but this created a second problem it didn't have before:
   there's now no real incentive to actually evaluate what got generated.** The wizard's `Review`
   step (`ReviewStep.vue`) is currently a plain name + exercise-count + per-exercise set summary —
   informational, not persuasive, and not designed to be looked at closely. The product owner's
   own description of the resulting behavior is worth quoting exactly: *"Yeah, I guess this
   created workout will work, lets go"* — and critically, if that generated routine turns out to
   be wrong in practice, **the frustration lands on the app, not on the user**, because the app
   never asked the user to actually own the decision.

This is a textbook case for `uiux-engagement-research.md`'s Fogg B=MAP framing (§3 of that
document): **ability** was fixed (fewer steps via generation), but nothing was done about
**motivation** to actually evaluate the result, so the review step is a formality nobody engages
with. Fixing this is not about adding more steps back — it's about making the one review moment
that exists actually worth looking at.

### What NOT to do

- Don't "fix" this by making the manual path even more automated — that's the same shape of
  problem one level up.
- Don't add friction back to the muscle-guided path just to force engagement with Review (a
  mandatory confirmation checkbox, a forced delay) — that's compliance-theater, not a real fix, and
  it's exactly the kind of "engagement-bait" the interview flagged as the line into manipulative.
- Don't build a second progression/reward system into the builder to make it "fun" — the interview
  is clear that rank *is* the fun system; the builder's job is to get out of the way, not compete
  for the same emotional space.

### Direction worth exploring (not yet a committed design — needs its own `/impeccable shape` pass)

- Make the **Review step actually informative**, not just a receipt: muscle-group coverage (does
  this routine actually hit what you said you wanted?), a flag for anything unusual the generator
  picked (an exercise requiring equipment you may not have, a lopsided set distribution), something
  that gives the user a real, quick reason to glance at it and catch a mismatch *before* the first
  workout — turning "review" from a formality into a genuinely useful 5-second check.
- For the manual path specifically, audit whether all three steps need to be separate full screens
  for a *simple* routine (e.g., 3-4 exercises, default sets) — a fast-path for the common case
  without removing the full wizard for complex routines (supersets, custom rest timers) is worth
  scoping, not assuming.
- Consider whether the muscle-guided and manual paths should visually/structurally converge more
  (right now the interview describes them as feeling like two competing tools, one of which makes
  the other "basically obsolete") — a single entry point that offers "let us suggest one" vs.
  "build it yourself" as a first choice, sharing the same Arrange/Review steps after, may resolve
  both the duplication feeling and the review-engagement gap in one pass.

**This phase needs its own discovery/shape session before implementation** — this document
identifies and prioritizes the problem; it does not prescribe the final flow.

---

## Phase 2 — Visual identity / USP pass

**Priority: second.** Direct quote: *"A lot of parts of the app either look boring, too common or
dont really have an unique selling point."* This is a broader, vaguer mandate than Phase 1's
concrete friction point, and it should be treated that way — not turned into a checklist of
component-level tweaks.

### What this is not

- It is **not** a request for more restraint. The interview's fun-side examples (rank-ups, XP,
  micro-animations) are things to lean into, and v3's motion-restraint work (cutting ambient/
  ornamental motion) was about *removing decoration*, not about making the app feel quieter or
  more conservative overall. "Boring/too common" and "not overstimulating" are compatible targets
  — the gap is distinctiveness, not busyness.
- It is **not** scoped to Exercise/Profile — those are explicitly light-touch-only, later.

### Where to look first

- Whatever in the app currently uses **generic/default-feeling patterns** rather than Liftr's own
  established material language (the tier-color full-bleed reward cards, the layered hex badge
  system) is the highest-leverage target — anywhere a plain `.panel`/bordered-card default is used
  for something that could instead carry Liftr's own visual signature.
- This is exactly the kind of judgment call `/impeccable critique` and `/impeccable bolder` exist
  for. **Recommendation**: run a fresh `/impeccable critique` pass explicitly scoped to "design
  specificity" (does this look like it could be any other fitness app?) across the main tabs
  (Übersicht, Workout, Ränge — the three the product owner did *not* flag as needing light work),
  then prioritize the output by this document's boundaries (§2) before touching anything.
- Because "unique selling point" was named specifically, the rank/tier material system (§3's
  "protect and amplify" item) is the strongest existing candidate to extend further into screens
  that don't yet use it, rather than inventing a second visual language from scratch.

**This phase needs a scoped critique pass before implementation**, same reasoning as Phase 1 —
this document sets direction and priority, not the specific screens/pixels.

### Phase 2A critique results (2026-09-02) and what's scheduled now vs. tracked for later

The scoped critique pass ran across Übersicht/Workout/Ränge and confirmed the root cause:
`.panel-reward` with no per-item `.t-<tier>` ancestor silently falls back to whichever tier is on
`.app-shell`, so any card using it without its own tier scope renders the single ambient tier
instead of its own. `TierLadder.vue` and RanksPage's `.rank-card` grid are the reference
implementation and need no further work.

**Approved for immediate implementation (Phase 2B, this round):**
1. **[P1]** Streak/Level/Rank tiles on Übersicht are visually indistinguishable (all render the
   same bronze) — a category error, not just "generic," since the audit requires rank to stay
   legible as *the* spine, distinct from streak/XP. Fix: give Streak and Level their own accent
   (`--fire-hi`/`--blue-hi`, already used elsewhere for exactly these) instead of `.panel-reward`'s
   tier fallback; reserve the tier tint for the Gesamtrang tile only. Files: `OverviewPage.vue`
   (StatTile usage), `StatTile.vue`.
2. **[P2]** `RankDistributionDonut.vue` and `RankUpCalendar.vue` shell on plain `--surface`/`--line`
   directly beside the reference-quality rank-card grid two scrolls down. Fix: route the shell
   border and the calendar's dots through `--tier-accent` instead of `--blue-hi`.
3. **[P3]** `RestTimer.vue`'s conic progress ring hardcodes `--blue-hi` instead of tier. Bundle into
   the same pass as #2.

**Implemented (2026-09-03), closing out Phase 2:**
- Items 1-3 above shipped as described: `StatTile.vue` gained an `accent="fire"|"blue"` prop so
  Streak/Level no longer borrow the rank tier's color; `RankDistributionDonut.vue`/
  `RankUpCalendar.vue`/`RestTimer.vue` all route through `var(--tier-accent, ...)` with the same
  fallback idiom as the nav indicator.
- **[P1] Workout tab's `.routine-card` grid** (`WorkoutPage.vue:707-714`) got its own shape pass
  first (a routine has no tier of its own the way an exercise does — `Routine`/`RoutineExercise`
  carry no color/tier/primary-muscle field, only a `mesocycle` state and exercise list, confirmed
  via `routineService.ts`/`routineStore.ts`). Decision: a muscle-derived color was rejected —
  routines aren't ranked, so coloring by trained muscle would invent a second, tier-unrelated color
  language the audit explicitly says not to add. Shipped instead: the same `var(--tier-accent,
  var(--line))` border-only treatment as the analytics shells above — no `.panel-reward` gradient,
  since an unranked routine isn't an earned moment. This ties the highest-frequency screen in the
  app to the rank spine honestly, without implying routines outrank each other.

All four items verified: `pnpm -r typecheck` clean, `/impeccable` detector `[]` on every touched
file, no motion budget touched (`--ease-spring`/`--dur-cele` untouched, per constraint). Phase 2 is
complete — nothing tracked as outstanding from this round.

---

## 6. Research findings valued against the interview (kept / deferred / rejected)

Per this document's method (§0), findings from the two research documents are sorted here by
whether the interview actually validated them as a priority — not by how interesting or
well-sourced they are on their own.

**Validated and already reflected in §1-5 above:**
- The fun/dark-pattern distinction (`uiux-engagement-research.md` §3) — independently confirmed by
  the interview's own fun/manipulative examples. Treat the interview's own wording as the primary
  acceptance test going forward (§2, item 5), with the research document as supporting depth if a
  specific future case is ambiguous.
- "Reward surfaces should be full-bleed material, not a badge on a neutral card"
  (`competitor-design-research.md` §3) — directly supports Phase 2's direction of extending the
  rank/tier visual language rather than inventing a new one.
- Fogg's B=MAP (ability vs. motivation) — directly explains the mechanism behind Phase 1's actual
  problem (see Phase 1's framing above).

**Named in the research, real, but correctly *not* scheduled this round:**
- The share-card redesign impulse the research's "reward surface" framing might suggest — see §4:
  the interview signal here is ambivalence, not a request for more visual work, and treating it as
  a visual problem without first diagnosing product-fit would waste a cycle.
- Onboarding/first-run research (`uiux-engagement-research.md` §4) — genuinely good general
  guidance, but the interview didn't flag onboarding as a pain point (the product owner hasn't
  used Liftr daily yet, so this wasn't testable in the interview itself). Worth a dedicated pass
  once there's real usage data to evaluate against, not speculative work now.
- Fitbod's small-self-directed-personalization category (`competitor-design-research.md` §4.5) —
  correctly filed as "a category to keep separate from rejected social cosmetics," not as a
  feature request. Nothing in the interview asked for personalization; noted for future reference
  only, per the research document's own framing.

**Not raised by the interview at all, and not being retrofitted as priorities:**
- Anything about competitive/social mechanics validation (Strava Kudos, segment scoping) — moot
  given the interview's solo/small-trusted-group roadmap explicitly rules out public social
  features regardless of how well-designed the mechanic is elsewhere.
- The tab-bar-growth caution (`competitor-design-research.md` §4.6) — already a standing v3 rule,
  reconfirmed as a boundary (§2.3) rather than new work.

---

## 7. Full interview (2026-09-02), for reference

**Q1. Who is Liftr actually for?**
> For now it is only for me, in the future it is planned for a smaller audience with
> multiple-users (similar to HomeAssistant's setups).

**Q2. What's the one thing you'd actually miss?**
> Haven't used Liftr on a daily yet, so I can't really answer that. What I would expect to miss is
> the engagement to keep going, to not stop working out and instantly seeing new achievements,
> even if you may not see it on yourself or feel it.

**Q3. A competitor feature you've envied?**
> Liftoff. Liftoff is the biggest inspiration and reason for Liftr. Why I started Liftr however was
> the dark-patterns pushing you to premium and a lot of bloated features I did not use, as well as
> the basically non-existent support for running.

**Q4. Which part do you enjoy opening most?**
> The Rank system. It is the key part everything is structured around and the one thing that
> motivates you the most to keep going.

**Q5. An underappreciated feature you're proud of?**
> Not that I could think of. The one thing that comes to my mind is the share system/share-card,
> since that one is basically just "yeah, it exists it's pretty cool I guess."

**Q6. Last time you got annoyed using Liftr for real?**
> Creating a new workout/routine. Especially when using the manual (not muscle guided) setup, it's
> a lot of steps you need to get through before actually being able to work out. The muscle-based
> creator does help here a lot, but even here it causes issues (mainly it makes the other way of
> creating basically obsolete, even though it shouldn't, as well as there is no real reason to
> actually check the created workout since that's more work and very much a user needs to look out
> for, to actually be informed. So most of the time it ends in "Yeah, I guess this created workout
> will work, let's go" and if any frustration then comes up it's the app's fault).

**Q7. A screen/flow you avoid touching?**
> (See Q6.) The creation and editing of routines is just so annoying that in the best case you
> don't do it at all.

**Q8. Does the rank system feel motivating to you, or built because expected?**
> As already stated, it's the one thing that instantly on its own shows you where you stand and
> where to go and what you already have achieved.

**Q9. Has the streak mechanic ever pushed unwanted behavior?**
> Me personally not, since I haven't used it on a daily, but logging fake sets or just doing it
> because of the streak is definitely an issue [in general].

**Q10. Where's the fun/manipulative line, concretely?**
> "Fun game-like": Ranking up, XP gained, little animations during sets and afterwards etc.
> "Manipulative": Offering a feature and putting it behind a paywall shortly after. Animations and
> other forms of engagement-bait used to get you to do something you usually wouldn't. Popups that
> tell you "Just 1 more xyz and you get abc" or something similar.

**Q11. A hard rule regardless of what data says?**
> Premium subscription and dark-patterns towards that or something similar.

**Q12. A lever you'd consider even if uncomfortable?**
> In general I would say "yes," but I currently don't have an example at hand, so I would probably
> decide in the moment.

**Q13. Liftr in a great state a year from now — what's different?**
> Most things are already very well worked out and functional, but the main flaw is the look
> regarding UX. A lot of parts of the app either look boring, too common or don't really have a
> unique selling point. The Exercise and Profile tab both have some light work that could happen
> or I would like to change, but in general I wouldn't touch it any further for now.

**Q14. A part of the app considered "done"?**
> (Folded into Q13's answer.)
