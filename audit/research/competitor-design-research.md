# Competitor Design Research — Liftoff Deep-Dive + Workout-App Landscape

**Prepared:** 2026-09-02. Purpose: a standalone, thorough design-research reference for Liftr's
engagement-audit initiative, going deeper than (and cross-checking) the 0a/0b findings already
recorded in `engagement-audit-v3.md`. Where this document confirms an existing finding it says so
briefly rather than re-deriving it; where it adds something new (a screen not previously called
out, a fresh competitor source, a concrete Liftr-specific tie-back) it's flagged as such.

**Method:** viewed every root-level screenshot in `examples/`, all 5 `mid-workout/` screenshots,
the walkthrough `overview.jpg` contact sheet, 4 individual full-resolution frames spread across
the walkthrough, and 2 animation filmstrips — plus fresh web research (WebSearch) on Strong,
Hevy, Fitbod, and Strava (the last not covered in the existing 0b research), and a check of
Liftr's own `packages/client/src` to confirm what already exists before recommending anything.

---

## 1. Liftoff deep-dive, organized by screen/flow

### 1.1 Home / "Für dich" dashboard
*Sources: `examples/Screenshot_20260824-174544.png`, `-175320.png`, `-175324.png`, `frame_001.jpg`*

- **Layout hierarchy:** top HUD (persistent, see §1.6) → a single **"Heutiger Workout"** hero
  card (full-bleed color, today's suggested routine, one CTA) → "Neues Workout" (two flat
  outlined action rows: start blank / create) → "Routinen" (collapsible list, per-routine
  exercise preview) → "Erholungszone" (recovery heat-map hero) → "Konsistenzziel" (streak-goal
  progress arc + a 7-day pip row + "Zielserie" target) → "Letzte 14 Workouts" (volume sparkline +
  3 stat tiles: Dauer/Rekorde/Verbrannt) → "Körpergewicht" trend → "Erkunden" grid (teased,
  partially built features).
- **The single boldest color choice on the page is the "Heutiger Workout" card** — a deep,
  saturated red/maroon field with white text, one of only two fully-saturated fields visible on
  this screen (the other is the recovery heat-map's muscle coloring). Everything else — the
  action rows, routine list, stat cards — sits on the same near-black neutral surface with no
  color of its own. This is the clearest concrete example of 0a's "at most one saturated element
  per screen" rule: **the app decides in advance what today's one visually loud thing is** (the
  actionable next step), not "make the dashboard vibrant."
- **Deliberate UX decision:** the recovery heat-map (a full front/back body silhouette, muscle
  groups shaded orange/gold by freshness) is Liftoff's second dashboard hero, ahead of any stat
  tile — this exists to answer "what should I train today," not to show off data. It solves the
  actual daily decision-fatigue problem a lifter has, dressed as a status visualization rather
  than a chore.
- **Cross-check against 0b's Fitbod finding:** the same "muscle-recovery-as-honest-open-reason"
  mechanic 0b flagged for Fitbod is *also* Liftoff's dashboard centerpiece — two independent
  competitors converged on the same non-manipulative mechanic. **Liftr already ships this**
  (`ErholungszoneCard.vue`, `readinessStore.ts`) — confirmed by grep, not assumed.
- **Consistency goal framed honestly:** "Konsistenzziel" shows a percentage-complete arc toward a
  user-set "Zielserie" (target streak), not an open-ended count-up. Capping the *frame* at a
  chosen target (not the ladder itself, which the app separately tracks uncapped via level) is a
  concrete implementation of 0b's "cap the streak" recommendation — worth noting Liftoff itself
  doesn't fully follow its own good instinct here, since the *level*/streak-flame counter in the
  HUD is still an uncapped, ever-visible number (see §1.6).

### 1.2 Routine builder / set editor
*Sources: `Screenshot_20260824-174555.png`, `-174559.png`, `-174603.png`*

- **Information density is real, not simplified for a demo.** Per-exercise cards show a name,
  optional notes field, and a full sets table (SATZ / VORHERIG / +KG or KG / WDH.) with inline
  steppers — this is a serious logging tool wearing a game's color language, not a game wearing a
  spreadsheet's density. The "VORHERIG" (previous) column is filled from history automatically —
  this is Strong's most-cited retention mechanic (see §2.1) and Liftoff has it too.
  **Liftr already has this** ("last time" reference is explicitly called out in
  `liftr-audit.md` §5 as an existing feature).
  
### 1.3 Onboarding / rank-placement flow
*Sources: `Screenshot_20260824-175344.png` (rank tab pre-placement), `Screenshot_20260824-175558.png`
(placement-complete screen), `overview.jpg` frames ~t=35-100s*

- **The rank ladder is shown, locked, before it's earned.** The pre-placement Ränge tab shows a
  full row of 10 hexagon pips (colored: gold/silver/bronze mixed in, most greyed) under
  "Vermuteter Rang: BRONZE I" and a rainbow-gradient-bordered "Platzierung" card asking the user
  to rank 2 more exercises. **This is a placement-match structure lifted directly from
  competitive games** (League/Valorant-style provisional rank) — 0a/liftr-audit.md §7.3 already
  concluded almost nothing from that genre transfers to a single-player app, and this is a
  concrete case in point: the pips imply *hidden opponents already ranked in those slots*, a
  framing that makes no sense with zero other players. **Confirms an existing rejection, doesn't
  need re-litigating**, but it's worth naming explicitly as an *anti-pattern instance*, not just
  an abstractly-rejected genre.
- **New finding — the rainbow-gradient border reappears on this exact card** (`-175344.png`), one
  of the two contexts 0a already flagged it in (unranked / promo). Here it's unambiguously the
  "unranked, come finish this" nudge — a soft, non-punitive incompleteness signal (not a fake
  countdown or red badge), which is a fine treatment *if* Liftr ever wants an "unranked" state on
  its own ladder — the objection is purely to the color itself being non-semantic elsewhere, not
  to marking incompleteness at all.
- **The placement-complete screen (`-175558.png`) is a plain scrollable list**, not a fanfare
  moment — each exercise's placed rank appears as a compact row (thumbnail, name, thin progress
  bar, small medal icon), capped with a flat blue "FORTFAHREN" button. **Notable restraint**: with
  6 exercises just simultaneously ranked for the first time, Liftoff does *not* stage a
  celebration sequence here — it treats onboarding-placement as informational, reserving
  celebration budget for the *first real rank-up during actual training* instead. This is a
  concrete, first-hand confirmation of 0c's "earned moments" principle applied by a real app: not
  every progression event gets the expensive treatment, only the ones that happen during genuine
  use.

### 1.4 Mid-workout logging screen
*Sources: all 5 `examples/mid-workout/*.png`*

- **The in-session rank progress bar sits directly under the active exercise's rest-timer
  toggle**, inside the same card — medal icon + tier label ("HOLZ III" / "BRONZE III") + a filled
  bar + a small sparkle glyph, with the target masked as "???" until reached. This is the exact
  mechanic **Liftr already built** in Round 1 of its own engagement rework
  (`liftr-audit.md` §7.1, "in-session rank bar") — direct confirmation the idea is sound, not a
  new recommendation.
- **The reward stays inline, not a separate screen or modal** — you see the bar update between
  sets while still looking at the numbers you just entered. This is the single clearest
  "reward moves during the set, not after" pattern in the whole reference set — worth citing as
  *the* concrete justification if this pattern is ever questioned later.
- **Completed sets get a full-row green highlight** (`-175501.png`, `-175506.png`, `-175514.png`)
  — solid, not a checkmark-only signal — and the timer banner ("Ruhezeit ist vorbei!" with a
  lightning-bolt glyph and a mute/unmute icon) is a plain modal alert, not a celebratory animation
  — motion budget is clearly *not* spent on "you finished a normal set" or "rest is over," only on
  the rank/level moments. Confirms 0c's frequency-cost framework independently: these are >10×/
  session events and Liftoff visibly treats them as such.

### 1.5 Post-workout streak + level-up sequence
*Sources: `Screenshot_20260824-175549.png` (streak), `Screenshot_20260824-175603.png` (level-up)*

- **Streak screen**: large "4 🔥 Trainingsserie!" headline, a 7-day pip strip (past days filled
  solid orange, future days dim), one line of encouragement ("Großartige Arbeit! Halte die Serie
  am Laufen!"), a share icon + a "FORTFAHREN" CTA. No loss-aversion language ("don't break it,"
  "you'll lose your streak") — the copy is forward-only. This is a real, positive counter-example
  to 0b's "streak-creep" warning: Liftoff's actual streak-completion copy is not guilt-based, even
  though the underlying mechanic (uncapped uninterrupted-day counter) is still the risky kind 0b
  flags structurally. **The mechanic is still worth avoiding per 0b's existing "cap the streak"
  recommendation — the copy tone alone doesn't fix the underlying loss-aversion shape.**
- **Level-up screen**: near-black background, a small elephant mascot mid-jump (the app's mascot,
  wearing a headband — a Duolingo-owl-style device), "LEVEL UP!" in large two-tone type (white +
  cyan), then **explicitly, on the same screen**: a flame-icon row (streak, "+1 Eierbonus"), a
  "6 Eier verdient!" pill (the **egg currency 0a already confirmed and rejected**), and an XP bar
  with "+434 XP" and a collapsible "XP-Aufschlüsselung anzeigen" (XP breakdown) toggle.
- **New, concrete observation not previously called out**: this single screen stacks **four
  separate reward currencies at once** (streak flame count, egg currency, XP number, level number)
  in addition to the LEVEL UP headline itself. This is the clearest first-hand evidence for why
  liftr-audit.md's principle #4 ("don't stack gamification into noise... no badges, no points
  systems layered redundantly") is correct — even *with* good visual restraint (dark background,
  no confetti, no per-element stagger per 0a), a five-currency stacked reward screen reads as
  cluttered/confusing rather than triumphant, purely from information overload, independent of
  the coin/egg-currency ethical objection. **Direct actionable takeaway: Liftr's own
  `FinishSequence.vue` three-beat structure (rank-ups → streak → XP/level, sequential not
  simultaneous) is the correct fix for this exact failure mode** — pace reward information rather
  than presenting it all at once, which Liftoff's level-up screen does not do.
- The XP-breakdown disclosure being collapsed-by-default (not shown, tap to expand) is a good,
  reusable micro-pattern: give the *headline number* first, let the curious user drill into the
  math, don't force everyone through the arithmetic.

### 1.6 HUD, tab bar, and rank/record card system (cross-screen)
*Sources: every screenshot; confirms 0a's HUD/tab-bar/medal findings with direct visual evidence*

- **HUD confirmed exactly as 0a described**: no background/border distinguishing it from the page
  (visible directly — the HUD and the page content share identical near-black), compound
  avatar+level+XP-bar pill on the left, streak flame+count center-left, one contextual right slot
  (bell / `?` / speech-bubble icon changes per tab). **One correction/addition to 0a**: the
  globe-with-plus "209"/"280"/"305" counter next to the streak flame is the **egg currency**
  (confirmed by the level-up screen showing eggs incrementing this exact number) — 0a's writeup
  described it from the rejected-elements angle but didn't identify the HUD glyph itself; worth
  recording precisely since a future implementer needs to recognize "globe-plus icon + number" as
  the currency to never add, not just "an egg icon" (the HUD glyph is not literally an egg).
- **Tab bar** (Workout/Home/Ränge/Ernährung/Freunde/Profil, 6 items): icons are full-color at all
  times (a dumbbell pair, house, star-hex, apple, two-person, avatar) — confirms 0a exactly.
  Active tab gets a filled cell, not a color change to the icon. **New observation**: the tab
  order puts **Freunde (social) and Ernährung (nutrition) as full permanent tab slots** — both
  are explicitly out-of-scope surfaces for Liftr (no social features, no nutrition tracking is in
  Liftr's feature set per `liftr-audit.md` §5) — a live example of the "5-6 item tab bar" problem
  Liftr's own Phase 2 nav-consolidation work explicitly tried to avoid by *merging* related
  functionality (Workout+Läufe) rather than growing the bar.
- **Rank/record cards** (`Screenshot_20260824-175401.png`, filmstrip_47): the "Rekorde" tab shows
  each exercise's PR as its own full-bleed metallic-tier-colored card (gold/silver/bronze
  gradient fills the *entire* card, not just a border/badge) with the exercise name, medal, and
  Kg/Wdh. inputs beneath. **This is the single clearest first-hand visual confirmation of 0a's
  "reward surfaces take the tier as the whole card background" finding** — Liftr's own Phase 1
  `.panel-reward` rework (engagement-audit-v3.md, done 2026-09-02) already implemented this exact
  pattern; this document independently re-derives the same conclusion from the same source
  images, which is a good cross-check that Phase 1's design read was correct.
- **Modal/sheet open transition** (filmstrip_47_t178,7s.jpg): a detail sheet (exercise record
  modal) opens via a small dot expanding/scaling up into the full sheet — a scale+fade-in from a
  point near the tapped element, not a slide-up-from-bottom or a hard cut. Consistent with 0a's
  "incoming card scale ~0.85→1.0, no overshoot" finding for full-screen transitions, extended here
  to confirm the *same decelerating-scale idiom* is reused for sheet-style modals, not just
  full-page navigation — i.e. Liftoff has one consistent "things arrive by growing in place"
  motion language across surface types, not a different transition per component type.

### 1.7 Rejected surfaces confirmed with direct evidence (adds to 0a, doesn't change its conclusion)
*Source: `frame_037.jpg` (Inventar/cosmetics), `frame_060.jpg` (Profil bearbeiten)*

- **Cosmetics shop ("Inventar")**: tabs for Items / **Titel** (name-tag titles) / Themes /
  **Grenzen** (avatar border cosmetics) / Banner. A "Kickstarter" title is shown as an owned/
  equipped item — i.e. cosmetic items are earned via specific historical actions (backing a
  crowdfund), not gameplay. This is a full profile-customization-for-being-seen-by-others system.
  `liftr-audit.md` §5 already lists "cosmetic profile customization whose purpose is being seen by
  others" as explicitly rejected and not built — direct visual confirmation this is exactly what
  Liftoff has, reinforcing that the rejection is correctly scoped (not a hypothetical risk).
- **Profile edit screen** (`frame_060.jpg`) shows an "Öffentliches Profil anzeigen" (view public
  profile) link and a rainbow-gradient-bordered "?" hex next to the display name — the *third*
  confirmed context for that rainbow border (after "unranked" and "promo"): here it appears to
  mark an unclaimed/mystery profile-border cosmetic slot. **This triples 0a's "no fixed semantics"
  finding with a third distinct meaning for the same visual** — strong independent evidence this
  specific color treatment is overloaded in Liftoff's own system and should not be borrowed at
  all, regardless of what it's used for.

---

## 2. Competitor landscape (Strong, Hevy, Fitbod, Strava)

Much of this is already covered in exhaustive, well-sourced detail in `engagement-audit-v3.md`'s
0b research findings (Strong's autofill, Hevy's Live PR banner and streak-freeze framing, Fitbod's
recovery heatmap, the Duolingo/Chou streak-creep literature). This section avoids repeating that
table and instead adds: (a) Strava, which 0b did not cover since it researched direct
weightlifting competitors plus non-fitness gamified apps, and (b) fresh 2026 sourcing on Strong/
Hevy/Fitbod's current complaints, which strengthens rather than contradicts 0b's conclusions.

### 2.1 Strong — what works, what doesn't
- **What works (confirmed again by fresh 2026 sourcing):** logging speed is the entire value
  proposition — "the fastest logging experience available... built around the assumption that you
  are mid-session, resting between sets, and need to log quickly" (RepReturn, 2026 Strong-vs-Hevy
  teardown). The auto-filled "previous" values at the point of data entry are the single most-
  cited reason for that speed — not gamification, frictionlessness.
- **What doesn't:** the same source notes Strong "is richer with more buttons and menus, and has
  a learning curve" — density without onboarding guidance is a real cost, even for power users.
  **Tie-back to Liftr**: Liftr's `SetEntry.vue`/`WorkoutPage.vue` already has the previous-value
  autofill (`liftr-audit.md` §5, "last time" reference) — this is confirmed table stakes, not a
  gap.

### 2.2 Hevy — what works, what doesn't
- **What works:** Live PR detection across 5 record types (0b, already adopted as a
  recommendation), a cleaner/more approachable layout for new users than Strong.
- **What doesn't, per fresh 2026 sourcing:** "Hevy requires an internet connection for many
  features, which can frustrate lifters who train in low-signal gyms" (multiple 2026 comparison
  sources) — a **direct, concrete argument for Liftr's offline-first architecture being a real
  competitive advantage**, not just an implementation detail; and "some users love the community
  feed; others find it distracting and unnecessary for a pure weightlifting app" — direct evidence
  that a social layer is a genuine point of user friction in this exact product category, not a
  hypothetical Liftr is inventing a reason to avoid. Reinforces `liftr-audit.md`'s "no
  friends/social feeds" decision with an independent, sourced data point.

### 2.3 Fitbod — what works, what doesn't
- **What works:** "the cleanest interface in the category... data visualisation (charts, progress
  tracking, personal records) is genuinely well-designed... the standard other apps are measured
  against" (2026 sourcing) — and, per 0b, the recovery heatmap specifically, which **Liftr already
  has**.
- **What doesn't:** once a workout starts, the rest of the (already limited) app becomes
  unreachable until the workout ends — a rigid modal-session model that trades flexibility for
  simplicity. Also: "users have expressed a desire for more personalization... simple small things
  ... [to] feel that this app is customized and tailored for the user" — small non-social
  personalization (not cosmetic-for-others, but for-yourself) reads as a real, low-risk desire
  distinct from the social-cosmetics pattern this whole research explicitly rejects. Worth naming
  as a *different* category: a user wanting *their own* app to feel personally theirs is not the
  same appetite as wanting to be seen by other people, and the former doesn't carry the same
  ethical baggage.
- Subscription/billing friction and Android parity lag are recurring complaints — not directly
  relevant to Liftr (no payments, single-platform PWA), but worth noting as a category-wide trust
  issue Liftr structurally avoids by having no accounts/payments at all.

### 2.4 Strava — new to this document, not covered by existing 0b research
- **Kudos**: a lightweight, low-cost social acknowledgment (roughly a "like") — Strava reports
  over 14 billion kudos given in 2025, a 20% year-over-year increase (Trophy.so 2026 case study).
  Notable for being praised specifically because it's *cheap to give and receive* — no ranking, no
  competitive framing, pure acknowledgment. **Not applicable to Liftr** (single-user, no other
  people to give/receive from) but useful as a datapoint: the least-manipulative social mechanic
  in the whole fitness-app landscape is the one with *zero* competitive or scarcity structure —
  further evidence for 0b's "autonomy and non-manipulation" framing being the right lens, not an
  incidental nice-to-have.
- **Segments and leaderboards**: Strava's own marketing frames this as "competition scoped to a
  reference group small enough that winning feels attainable" (Trophy.so) — i.e. Strava's own
  design philosophy explicitly validates 0b's point about Duolingo/Chou-style research (small,
  winnable comparison groups motivate; global, unwinnable ones don't). Still not applicable to
  Liftr directly (no other users to compare against), but it validates *why* Liftr's own per-
  exercise rank ladders (comparing yourself against absolute external strength standards, a fixed
  and "winnable" reference frame) are a sound design choice already in place, rather than a weaker
  substitute for social leaderboards.
- **Personal-bests and "Local Legend"-style consistency badges**: Strava explicitly calibrates
  different mechanics to different user motivation types (KOM for competitive athletes, Local
  Legend for consistent ones, Personal Bests for intrinsic improvers) rather than assuming one
  mechanic serves everyone. **Concrete, sourced argument for keeping multiple parallel signals
  active in Liftr** (per-exercise rank + overall lifter rank + streak + PRs) rather than collapsing
  to one "the" number — different training days/moods call for different signals to be the
  meaningful one, and Liftr's Round 3 "Overall Lifter Rank" (liftr-audit.md §7.3) already reflects
  this instinct.

---

## 3. Cross-cutting patterns

**What the best examples have in common:**
1. **Frictionless logging beats every reward mechanic.** Strong wins on speed alone; Strava's own
   segment design and Hevy's autofill both trace back to "reduce the cost of the honest action,"
   not "add a bigger reward for it." Liftr's own founding principle (§1 of `liftr-audit.md`,
   "protect the core loop... 1-2 taps") is the correctly-prioritized version of this.
2. **The reward surface should visually *be* the achievement, not just announce it.** Liftoff's
   full-bleed metallic tier cards, Hevy's inline Live PR banner, Fitbod's recovery-map-as-hero all
   put the payoff *in the material itself* rather than in a badge bolted onto a neutral surface —
   this is precisely 0a's "reward surfaces take the tier as the whole card background" finding,
   independently reinforced across three separate products.
3. **Comparison groups must be winnable.** Strava's segment scoping, Liftr's absolute-standards-
   based rank ladder, and Hevy/Fitbod's complete *absence* of any cross-user ranking all point the
   same direction: comparison against an achievable, honest reference (a real strength standard,
   a small local segment) motivates; comparison against an unbounded global population or an
   ever-growing streak number does not.
4. **Restraint in motion reads as premium, not as under-built.** Liftoff's own walkthrough (0c,
   confirmed again in this document's filmstrip review) shows *nothing* overshoots or springs
   except the one genuinely rare level-up moment — chrome is static, routine feedback is a plain
   modal, and the app still reads as polished. This directly supports Phase 4's ambient-motion
   cuts already made in Liftr.

**Traps/anti-patterns multiple apps fall into:**
1. **Reward-currency proliferation.** Liftoff's level-up screen stacking streak+eggs+XP+level
   simultaneously (§1.5) is the clearest single example — even with good visual taste, more than
   one currency on screen at once reads as noise, not celebration. Liftr's own three-beat
   `FinishSequence.vue` already avoids this by pacing reveals sequentially.
2. **Social features as an assumed default rather than a deliberate choice.** Hevy's own users
   report the community feed as "distracting and unnecessary for a pure weightlifting app" — a
   social layer added because competitors have one, not because the product needs it, becomes a
   liability for a meaningful fraction of users. Confirms Liftr's "no social, ever" stance is not
   overly conservative — it's avoiding a documented real complaint.
3. **A visual motif with no fixed meaning.** Liftoff's rainbow-gradient border appears in three
   unrelated contexts in this review alone (unranked-placement, promo pill, mystery-cosmetic-
   slot) — a "special" visual treatment that means three different things stops meaning anything;
   0a already flagged this and this document independently triples the evidence for it.
4. **Placement-match framing bolted onto a single-player system.** The pre-placement rank pips
   (§1.3) visually imply competitors/matches that don't exist — borrowing a *structure* from
   competitive games without the underlying multiplayer reality it was built for produces UI that
   promises something the app can't deliver.

---

## 4. Concrete recommendations for Liftr

Checked against `packages/client/src` before writing each one — flagged **[already built]** where
grep/audit-doc confirms it exists, so this list only proposes genuinely new work.

1. **[already built, confirmed]** Recovery heat-map dashboard hero (`ErholungszoneCard.vue`),
   previous-value autofill in set entry, in-session rank progress bar, per-exercise + overall
   rank ladders, sequential (not simultaneous) post-workout reward reveal (`FinishSequence.vue`),
   offline-first architecture. No action needed — these already match or exceed what the best
   competitors do, and in Hevy's offline-reliability case, exceed a documented weak point.
2. **Keep reward reveals sequential, and treat this document's §1.5 finding as a warranted
   guardrail, not just a design preference.** If any future feature adds a new currency/counter to
   the post-workout or level-up moment, stack it into the *existing* three-beat sequence
   (`FinishSequence.vue`) rather than adding a fourth simultaneous element to any one screen —
   Liftoff's own level-up screen is the concrete cautionary example of what four-at-once looks
   like, even done with restraint elsewhere.
3. **Do not add a placement-match / provisional-rank UI**, even as a lighter-weight version. The
   pips-with-mystery-slots pattern (§1.3) only makes sense with real other players occupying the
   unfilled slots; Liftr has none, so the same visual would just read as decoration implying
   something false. If a "you haven't ranked this exercise yet" state is needed, Liftr's existing
   copy-driven empty-state pattern (§0d of `engagement-audit-v3.md`) is the right tool, not a
   pip row.
4. **Never introduce a "special" gradient/color treatment without giving it one fixed meaning for
   its lifetime.** This document independently confirms 0a's finding with a third occurrence of
   Liftoff's rainbow border meaning a third different thing. Liftr's own existing rule (0a:
   "purple→cyan gradient reserved for rank events only") is the right pattern — the audit item
   worth adding is a lint-style habit check: before reusing any accent gradient/color on a new
   surface, confirm it doesn't already carry a different meaning elsewhere in the app.
5. **Treat small, self-directed personalization (not cosmetic-for-others) as a legitimately
   different, lower-risk category than social cosmetics**, per Fitbod's user feedback (§2.3). A
   user wanting their own single-player app to feel personally theirs — an accent color choice,
   a chosen mascot/avatar seen only by them, a personalized unit or copy tone — doesn't carry the
   "being seen by others" ethical objection `liftr-audit.md` correctly raises against Liftoff's
   cosmetics shop. This is not a recommendation to build anything specific now, just a category
   distinction worth keeping in mind if personalization ever comes up in a future audit round —
   don't reject it by pattern-matching it to the rejected social-cosmetics case.
6. **Keep the tab bar at 5 items and resist any pull toward 6+.** Liftoff's own 6-item bar
   (Workout/Home/Ränge/Ernährung/Freunde/Profil) includes two tabs (Freunde, Ernährung) that map
   directly onto features Liftr has explicitly ruled out — direct evidence that tab-bar growth in
   this category tends to come from feature creep, not necessity. Liftr's Phase 2 merge-not-
   reorder decision (`engagement-audit-v3.md`) is already the correct defense against this; this
   document adds a concrete example of the failure mode it's defending against.
7. **When evaluating any future "make it more exciting" request against a rank/PR/stat surface**,
   default to "put the achievement's color in the material" (full-bleed tier-color cards) over
   "add a badge/icon on a neutral surface" — this is the one visual-language element repeatedly
   validated across Liftoff, and it's also the one Liftr's Phase 1 `.panel-reward` rework already
   implemented. No new work required, but worth stating as the standing rule for any *new* reward
   surface built later (e.g. if a running-side PR card or a mesocycle-completion card is ever
   added), so it inherits the same rule rather than reinventing a bordered-neutral-card pattern.

---

## Sources

- `examples/*.png`, `examples/mid-workout/*.png`, `examples/walkthrough_bundle/{overview.jpg,
  MANIFEST.txt, frames/frame_{001,037,060,089}.jpg, animations/filmstrip_{37,47}_*.jpg}` — all
  viewed directly for this document.
- `engagement-audit-v3.md` — existing 0a/0b/0c/0d research findings, cross-checked and cited
  where this document confirms or extends them.
- `liftr-audit.md` — Liftr's own feature inventory and design-philosophy record, used to verify
  what already exists before writing §4's recommendations.
- [Strong App vs Hevy: The Best Strength Training Logger in 2026 (RepReturn)](https://repreturn.com/strong-app-vs-hevy/)
- [Hevy vs Strong (2026): Verified Prices, Free Limits, and the Honest Winner (Sensai)](https://www.sensai.fit/blog/hevy-vs-strong-2026)
- [Fitbod App Review 2026: Honest Take After Real Testing (Indie Hackers)](https://www.indiehackers.com/post/fitbod-app-review-2026-honest-take-after-real-testing-45d5f07a1b)
- [Strava Gamification Strategy: How It Drives Retention (2026) (Trophy.so)](https://trophy.so/blog/strava-gamification-case-study)
- [Strava Segmented Leaderboards: How They Drive Engagement (Trophy.so)](https://trophy.so/blog/how-strava-uses-segmented-leaderboards-to-drive-engagement)
