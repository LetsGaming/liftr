# Liftr — Engagement & Polish Audit v3

**Prepared:** 2026-09-01, following up on the UI/UX rework completed earlier the same day
(tokens.css luminance fix, tier-accent cascade, tier ladder, finish-sequence staging, top HUD).
That work landed and was verified, but four of its outcomes are unsatisfying on a second look,
plus three new requirements surfaced. This document is the durable record of what's wrong,
what was decided about it, and the phased plan to fix it — written so a future session with no
memory of this conversation can pick it up cold.

**How to use this file:** each phase is self-contained — current state, the decision, and the
concrete change. Check off phases as they land (change `- [ ]` to `- [x]` and add a one-line
note with the commit/date). Don't re-derive decisions already made here; if a decision turns
out to be wrong once implemented, record why in that phase's section rather than silently
diverging.

---

## Decisions already made (do not re-litigate without new information)

1. **Anti-cheat scope:** a hybrid, and *stricter than today*. PRs get **hard-blocked** (zero
   credit) on a badly-flagged workout, not just discounted. XP/LP keep the existing soft-discount
   model but with tighter thresholds. This is explicitly framed as prep for an eventual
   multi-user setup (one self-hosted backend, several users — HomeAssistant-style) even though
   multi-user itself is **not** being built now — the fix just shouldn't bake in single-user
   trust assumptions that would need re-deriving later.
2. **Visual direction:** pivot toward Liftoff's *specific* visual language (metallic medal
   rendering, its HUD composition, its chrome/gradient style) — even where that replaces work
   from the earlier session (tier-accent cascade, current badge treatment) rather than just
   extending it. Liftoff reference material lives in `examples/` (walkthrough_bundle frames +
   filmstrips, mid-workout screenshots, loose screenshots).
3. **Nav consolidation (revised):** not a reorder — a merge. Workout and Läufe combine into one
   tab (Workout is the app's main star; Läufe becomes a secondary view reached via an in-tab
   switcher, not its own bottom-nav slot). This drops the tab bar from 6 items to 5, which is
   the actual fix for "more space on the tab bar, especially on mobile" — a reorder alone
   wouldn't have freed any width. Resulting order:
   `Übersicht, Workout (+ Läufe switcher), Ränge, Übungen, Profil`. See Phase 2 for the concrete
   navigation/routing shape.
4. **Copy:** a research/audit pass finds "on-the-nose" (too literal/robotic) phrasing across
   the app and proposes alternatives for review — not a blind rewrite, not the user hunting for
   examples themselves. `WorkoutPage.vue`'s routine-explainer copy was called the best writing
   in the app in the prior critique; use it as the tone benchmark, not a generic "friendlier"
   pass.

**Ethical constraint (applies to every phase, especially Phase 0):** engagement mechanisms
adopted from research must not be manipulative. Liftr has no accounts and no payments, so
"premium-gating" isn't literally possible here — but dark patterns exist without payments too
(fake urgency, guilt-tripping streak-loss copy, notification spam, variable-reward abuse tuned
to exploit rather than reward). Name and reject these explicitly in the Phase 0 research output,
don't just avoid them by accident.

---

## Phase 0 — Research (dispatch only after this document's TLDR is approved)

Four independent research tracks. Dispatch as parallel subagents; each produces a written
finding appended to this file's "Research Findings" section (create it) before any
implementation phase that depends on it starts.

- [ ] **0a. Liftoff deep-dive.** Read every frame in `examples/walkthrough_bundle/frames/`,
  the filmstrips (animation timing), `overview.jpg` (contact sheet, scan first), and the loose
  screenshots in `examples/` and `examples/mid-workout/`. Extract *implementable* design tokens,
  not just adjectives: the exact layering that makes the medals read as metallic (specular
  highlight placement, rim light, gradient stop count/angle), the HUD's exact composition and
  what currency each element shows, typography scale and weight steps, iconography style, and
  which specific moments get motion vs. which don't. Deliverable must be concrete enough to
  implement in Liftr's actual stack: **pure CSS/SVG, no raster medal assets** — this is an
  offline-first PWA (`vite.config.ts`'s precache-everything strategy) and must not gain bundle
  weight. Also flag anything in Liftoff that stays *rejected* per the prior critique (coin
  currency, second scrolling tab row, floating promo tooltip, rainbow-gradient borders) so a
  fresh research pass doesn't accidentally reintroduce them.
- [ ] **0b. Competitive engagement research.** Strong, Hevy, Fitbod (direct workout-logger
  competitors) plus at least one gamified habit app outside fitness (Duolingo, Zombies Run,
  Habitica) for retention mechanisms that transfer. For each mechanism found, classify it
  explicitly: **ethical and worth adopting** (e.g. visible progress, honest streak protection,
  variable-timing rewards tied to real achievement) vs. **dark pattern to name and reject**
  (fake scarcity, guilt notifications, engagement-optimized-over-honesty rank inflation). The
  rejection list matters as much as the adoption list.
- [ ] **0c. Motion/animation research.** When does animation earn its runtime vs. waste it —
  use the `emil-design-eng` skill's philosophy plus general motion-design references (Material
  Motion, Apple HIG motion) as source material. Deliverable: a decision framework (a short
  checklist) to apply per-animation in Phase 4, not a redesign of any specific animation yet.
- [ ] **0d. Copy audit.** Read `packages/client/src/locales/de.json`,
  `packages/client/src/locales/exercises.de.json`, and inline template strings across
  `packages/client/src/pages/*.vue` and `packages/client/src/components/**/*.vue`. Flag lines
  that read as too literal/robotic ("on the nose") and propose an alternative for each,
  preserving exact meaning (this is a single-user German-language app — don't anglicize or
  soften factual copy, e.g. error messages still need to say what actually happened). Output as
  a reviewable table (file:line, current text, proposed text, one-line reasoning) — Phase 6
  applies only the ones approved in review, not all of them automatically.

---

## Phase 1 — Visual identity pivot toward Liftoff

*Depends on 0a. Task list below is a starting scope, not exhaustive — 0a's findings fill in the
exact implementation detail.*

- [x] Tier badge/medal rendering: replace the current flat CSS hex + two-stop gradient
  (`tokens.css`'s `.badge`/`.badge::before`, `t-<tier>` classes) with a layered treatment that
  reads as metallic, matching 0a's findings. Still pure CSS/SVG (no raster). *(2026-09-02)*
  Rebuilt as extrusion plate (`::after`) + bevel rim with opposite-direction gradient (`::before`)
  + 3-stop-minimum per-tier-group `--face-grad` (broad/soft, compressed/polished, non-monotonic
  gold, hue-rotating iridescent for elite/expert/apex) + hard specular streak (two layers on the
  real element's own background) + glyph relief via the existing per-tier `--tt` tint (already
  not literal white) with a drop-shadow. Verified live via screenshot on Ränge. **Not done:**
  the wing/feather tier signal (explicitly lower priority, "if time allows" in the task list) —
  skipped for time; still a straightforward SVG addition on top of this if picked up later.
- [x] Active-tab treatment redesign. Current state feels cheap: desktop's `.nav-link.router-link-active`
  uses a `color-mix` tinted background, mobile's `.tab-link.router-link-active` uses a 2px inset
  bottom underline (both added in the prior session, `App.vue`). Needs an actual redesign
  informed by 0a, not a tweak of the existing approach. *(2026-09-02)* Implemented per the
  resolved decision exactly: icons full-colour always (opacity dimming removed), active state is
  a filled `--surface-2` block covering the whole tab cell (mobile: full bar height too, via
  moving `.tab-bar`'s vertical padding onto `.tab-link` so the active fill reaches the bar's true
  edges — verified live, tab-link rects match the bar's content box exactly), a 2px accent rule
  via `inset 0 2px 0` on the block's top edge, square corners (`border-radius: 0` on active),
  label grey->white. No pill/glow/scale. Verified live via screenshot + getBoundingClientRect.
- [x] HUD composition (`.top-hud` in `App.vue`) — re-evaluate against 0a's HUD findings; the
  current version only carries level+streak, deliberately built minimal. Decide what (if
  anything) it should gain, subject to the "reject the reference's overload" principle already
  established (no coin currency, no second tab row). *(2026-09-02)* Per the task's own resolved
  decision, kept the solid `--surface` backdrop rather than switching to Liftoff's borderless HUD.
  Did the live check the decision calls for: `getBoundingClientRect()` on `.top-hud` and
  `.main-content` shows the HUD's bottom edge (y=52) lands exactly on `.main-content`'s top edge
  (y=52) at 390x844 — no gap, current solid-backdrop approach already verified clean. Did **not**
  go on to test a borderless variant against scrolled content (out of time) — the decision
  explicitly says only switch if that separate check passes, so solid stays and this is not a
  regression, just an unexplored option. A human should treat "stay solid" as the safe default,
  not as "borderless was tried and rejected."
- [x] Color/material "pop" beyond lightness. The prior session already objectively fixed the
  *lightness* problem (measured: liftr chromatic-pixel lightness went from ~33-46% to ~58-61%
  on Übersicht/Workout, matching Liftoff's ~52-57% reference range) — yet the dullness complaint
  persists. This means lightness was not the whole story; 0a needs to identify what else reads
  as "pop" (material/depth cues, saturation curve, contrast between elements, or something
  structural like the HUD/medal treatment itself). Don't re-run the old lightness fix again;
  find the actual remaining gap. *(2026-09-02)* Applied 0a's structural moves that fit this pass's
  scope: `.panel-reward` now takes the tier color as its WHOLE card background (`--b2`->`--b1`
  gradient, not a border/accent on a neutral surface) plus a static low-opacity diagonal sheen
  band, and its `box-shadow` (fake elevation on an already-near-black shadow) is gone — elevation
  is the tier fill's own brightness against the page now. Verified live: the Übersicht status
  strip's reward tiles render as solid amber/gold cards, a visibly different result from the prior
  session's tinted-border tiles. **Not done / judgment call for a human:** full saturation
  rationing across every screen (0a's "at most one saturated element per screen") and the Ränge
  screen's trapezoid spotlight wedge — both are page-by-page redesigns beyond what this pass's
  time budget covered; `.panel-reward` was the single highest-leverage item 0a named and is done,
  the rest is follow-up.

---

## Phase 2 — Dashboard layout fixes

- [x] **Rank `StatTile` overflow.** `OverviewPage.vue`'s `overallRankLabel` computed
  (around line 68-73) already drops the division number ("SILBER III" → "SILBER") specifically
  because the full label didn't fit a quarter-width `StatTile` — that was a truncation
  workaround, not a real fix, and the user is still seeing overflow. Before implementing
  anything: **measure live** which tier labels actually overflow at 390px width (German tier
  names vary a lot in length — `TIER_LABEL_DE` in `lib/tierIcons.ts` has `"FORTGESCHRITTEN"` at
  one end, `"ELITE"` at the other). Likely real fix is structural (wider tile / two-row layout /
  smaller type / abbreviated tier label with the full name on tap) rather than another string
  truncation. *(2026-09-02)* Measured live at 390px with the real playwright chromium build:
  the 4-across `.status-strip` grid (`repeat(auto-fit, minmax(80px,1fr))` + forced `font-size:
  20px; white-space: nowrap` on the value) clipped any tier label past a couple of characters.
  Fixed structurally: `.status-strip` is now 2x2 on mobile (4-across again at >=560px), the value
  wraps (`white-space: normal` + `overflow-wrap/word-break`) at a responsive
  `clamp(14px, 4.2vw, 20px)` size, and `overallRankLabel` was restored to show the FULL label
  (tier + division, e.g. "LEHRLING III") instead of dropping the division — the structural fix
  freed enough room that the truncation workaround wasn't needed at all. Verified live: even the
  worst case forced to "FORTGESCHRITTEN VI" (longest tier + widest division) measures
  `scrollWidth === clientWidth` (no horizontal overflow), wrapping cleanly to 2 lines inside an
  81px-tall tile via `getBoundingClientRect()`/`scrollWidth` checks, not CSS inspection.
- [x] **Merge Workout + Läufe into one tab.** Current routing (`router.ts`) already has `/workout`
  and `/runs` as two independent top-level routes with two independent, sizeable page components
  (`WorkoutPage.vue` is 1217+ lines with its own active-session state machine; `RunsPage.vue` is
  318 lines). Lowest-risk shape: **keep both routes and both components exactly as they are**,
  remove `/runs` from `App.vue`'s bottom-nav `navItems` (dropping the tab bar from 6 to 5 items —
  this is what actually frees mobile tab-bar width, not a reorder), and add a small in-page
  switcher (a segmented control or pill pair, "Workout" / "Läufe") at the top of both
  `WorkoutPage.vue` and `RunsPage.vue` that navigates between the two routes. Workout stays the
  tab's default/primary target (tapping the merged tab always lands on `/workout`; the switcher
  is how a user reaches Läufe from there). This avoids a risky merge of two large, independent
  state machines into one file. If 0a/0b research surfaces a stronger pattern for this
  (Liftoff or another app doing a genuine single-page tab merge), reconsider — but this is the
  default plan absent a specific reason to do the riskier thing. *(2026-09-02)* Implemented
  exactly as scoped: `router.ts` untouched (both routes/components still independent), `/runs`
  removed from `App.vue`'s `navItems`, new shared `components/ui/WorkoutRunsSwitcher.vue` (a
  small segmented pill pair) dropped at the top of both `WorkoutPage.vue` and `RunsPage.vue`,
  navigating via `RouterLink`. Also fixed the sr-only `pageTitle` fallback in `App.vue` (it looked
  up the current route in `navItems`, which no longer has `/runs`) so `/runs` still gets a real
  heading instead of falling back to "Liftr". Verified live via screenshot on both `/workout` and
  `/runs`.
- [x] Resulting nav: `Übersicht, Workout, Ränge, Übungen, Profil` (5 items). Since colors are
  assigned per-item in `navItems`, they should travel with the route/icon identity when Läufe's
  entry is removed, not silently reshuffle onto a different tab. *(2026-09-02)* Confirmed by
  deletion order: only the `/runs` entry was removed from the `navItems` array, every other
  entry (including its own `color`) is untouched, so no color reassignment happened. Verified
  live: nav bar renders exactly `Übersicht, Workout, Ränge, Übungen, Profil` at 390px.

---

## Phase 3 — Data integrity / anti-cheat

Current state, precisely: `packages/shared/src/rank/plausibility.ts` computes a soft
`multiplier` (never below `PLAUSIBILITY_FLOOR = 0.05`) from three heuristics (pace, same-session
jump vs. stored peak, hard ceiling vs. Apex threshold). `packages/server/src/services/
rankService.ts` already uses this for **peak/rank-up eligibility** — `PEAK_ELIGIBILITY_FLOOR =
0.3` (line ~176), `peakEligible = plausibilityMultiplier >= PEAK_ELIGIBILITY_FLOOR` (line 177),
gating whether a session's `peak` value advances at all. **PR detection does not check this at
all** — `rankService.ts` lines ~308-321 insert a new PR purely from
`bestE1rm > existingPr.value`, with no plausibility check whatsoever. This is the exact gap the
user identified.

- [ ] **Hard-block PRs on implausible workouts.** Gate the PR-insertion block
  (`rankService.ts` ~308-321) behind plausibility, reusing `PEAK_ELIGIBILITY_FLOOR` (or a
  stricter PR-specific floor — judgment call, err stricter per the user's explicit ask) so a
  badly-flagged session cannot produce a PR record at all, not just a discounted one.
- [ ] **Stricter XP/LP soft-discount.** Current thresholds in `plausibility.ts`:
  `PACE_FINE_THRESHOLD_S = 12`, `PACE_MAX_SEVERITY_THRESHOLD_S = 4`,
  `JUMP_FINE_THRESHOLD = 0.4`, `JUMP_MAX_SEVERITY_THRESHOLD = 1.0`, `CEILING_MULTIPLE = 1.5`,
  `PLAUSIBILITY_FLOOR = 0.05`. Tighten these — exact new values are a judgment call requiring
  real workout-pace data or careful reasoning, not a blind guess; document the reasoning next to
  whatever values land here, the existing code already does this well (follow that convention).
  Risk to explicitly guard against: too strict punishes real breakthrough sessions — a
  genuinely fast, genuinely real PR session (short rest, good day) must not get crushed by the
  same heuristic that catches a fabricated one.
- [ ] **New heuristic candidate: implausible single-set sessions.** Check whether the existing
  pace/jump/ceiling heuristics already catch "one suspiciously heavy set, otherwise realistic
  pace" or whether that's a gap needing a fourth heuristic.
- [ ] **Multi-user-forward review** (review only, not implementation): confirm
  `plausibility.ts`'s inputs and `rankService.ts`'s storage are already strictly scoped per-user
  in the schema (check `packages/db/src/schema.ts`) so this logic doesn't implicitly assume a
  single global trusted actor. If a gap is found, note it here for a future multi-user phase —
  do not fix it now, that's out of scope (see below).

---

## Phase 4 — Motion audit

Current inventory (from the prior session's Assessment B static scan, re-verify before acting
since Phase 1 of *this* audit may add new motion): route-fade cross-fade (`App.vue`),
`streak-pulse` on genuine streak growth, staggered `pop-in` entrances on Übersicht/Ränge page
load, `stamp-in` on level-up (`FinishSequence.vue`), the two-layer blue glow on rank-up badges
added this session, `RestTimer`'s `@property` conic sweep, shimmer loading skeletons.

- [ ] Apply 0c's decision framework to every animation in the inventory above: keep as-is /
  retune (duration, easing, or trigger condition) / cut entirely.
- [ ] **Priority explicitly set by the user:** the mid-workout and post-workout animations are
  the ones that most directly reward the user (a logged set, a rest-timer completion, the
  `FinishSequence` beats) — these are where investment should concentrate, not where cuts should
  land. Treat them as the protected core to strengthen (informed by 0a/0c), while ambient/
  routine motion (page-load entrances, tab switches) is the pool to cut from.
- [ ] Specific complaint to resolve: the staggered `pop-in` entrance on every Übersicht/Ränge
  page load fires on *every navigation*, not an earned moment — likely reads as the "wasted
  time" the user means. Strong candidate for cutting or reducing to near-zero duration; confirm
  against 0c's framework rather than cutting on instinct alone. This is exactly the kind of
  ambient motion the priority note above says to cut from, in contrast to mid/post-workout
  motion which should be strengthened, not touched by this cut.
- [ ] Re-verify motion.css's own stated convention still holds after changes: `--dur-cele`/
  `--ease-spring` reserved for genuinely earned moments only — don't let Phase 1's new medal
  animations or Phase 3's stricter gates quietly violate this.

---

## Phase 5 — Share-card redesign

Current state, precisely (`packages/client/src/lib/shareCard.ts`):
- **Font drift:** hardcoded `'Plus Jakarta Sans'` in every `ctx.font` call (7 call sites) — this
  is the *exact* font `tokens.css` explicitly removed app-wide, on the documented grounds that
  it's "an overused font, category-interchangeable with any other AI-generated UI," replacing it
  with Hanken Grotesk + Unbounded. The share-card never got that update and is now visibly
  off-brand from the rest of the app.
- **Color drift:** the `COLORS` constant (lines 18-28) hardcodes `surface: "#1c2233"` and
  `surface2: "#28304a"` — these are the **pre-Phase-1** `tokens.css` values. This session's own
  Phase 1 widened the ramp to `#212a42`/`#2f3a5c` and the share-card was never updated, so it
  drifted out of sync with the live app *during this same rework*, not before it.
- **Wasted space, confirmed:** `CARD_DIMENSIONS.square` (in `packages/shared/src/share/
  layout.ts`) is a fixed 1080×1080 regardless of content — a short routine leaves large dead
  vertical space at the bottom. `CardSize` already has unused `"story"` and `"wide"` variants
  defined in the type but never passed anywhere in the client — the layout math for a better
  aspect ratio may already partially exist and just need wiring up. Square also doesn't match
  the format most people actually share to (Stories = 9:16).
- **No rank/tier shown at all:** the card shows Dauer/Volumen/Sätze/PRs and a muscle figure —
  never the tier badge or level, despite the whole app being built around the rank ladder. This
  is the biggest "boring" contributor: the one thing genuinely worth showing off never appears.

**Liftoff's own share-card, for concrete inspiration (not to copy plainly — this rule applies
app-wide, not just here):** `examples/ReactNative-snapshot-image4658256710183484041.png`
(workout card) and `examples/ReactNative-snapshot-image589238852839200053.png` (run card) are
Liftoff's actual exported share cards. Reviewed directly — what's worth borrowing, and what's
worth explicitly avoiding:
- **Borrow:** each headline stat (Dauer/XP/Volumen) is its own full, solid-colored rounded card
  — a small icon+label pill at the top, a larger dark inset box below holding the value — not
  colored text sitting on a shared dark background the way Liftr's current stat row does. This
  is a stronger, more concrete version of the "single colored stats, engaging not childish"
  choice Liftr already made; adapt the *card-around-each-stat* structure, not Liftoff's specific
  purple/blue/red hues (Liftr has its own palette from Phase 1).
- **Borrow the row treatment, not the content it holds.** Liftoff's exercise rows show only a
  bare per-exercise set *count* ("Push Ups 2"). Liftr's `renderExerciseLines`
  (`packages/shared/src/share/layout.ts`) already does more: below `COMPRESS_EXERCISE_THRESHOLD`
  it lists every individual set with reps×weight (e.g. "8×7,5kg  8×9kg  6×12kg"), only
  collapsing to a count/range once an exercise count makes that impractical. **Keep Liftr's
  existing detail level — this is explicitly more useful than Liftoff's, don't regress it.**
  What's actually worth borrowing is the *visual container*: render each exercise as its own
  bordered/pill row in a 2-column grid (icon + name + Liftr's own per-set detail string inside
  that row), not a single-column plain list the way the card draws it today. Visual polish, not
  a content downgrade.
- **Consider:** the wordmark is small and bottom-anchored, not a bold top-left header competing
  with the headline date — worth weighing against Liftr's current top-left "LIFTR" treatment.
- **Do not repeat this flaw:** Liftoff's own run card (the second reference image) has the exact
  same wasted-space problem Phase 5 already flagged in Liftr's card — a short session (one
  activity, two stats) leaves roughly half the fixed card height empty. Borrowing the card-per-
  stat *structure* does not mean borrowing the fixed-aspect-ratio problem that causes this; the
  space-efficiency fix (below) still stands regardless of layout inspiration.

Scope:
- [ ] Sync fonts (Hanken Grotesk/Unbounded) and colors with the live palette (including
  whatever Phase 1 lands on, not just the current Phase-1-from-last-session values — check
  order of operations, this phase should run *after* Phase 1 settles the palette).
- [ ] Redesign the stat row as individual colored cards (icon/label pill + dark value box per
  stat), per the Liftoff-inspired structure above, using Liftr's own palette.
- [ ] Redesign the exercise list as a 2-column grid of bordered rows (Liftoff-inspired
  container), while keeping Liftr's existing per-set detail string inside each row — do not
  collapse it to a bare set count.
- [ ] Evaluate wiring up the already-defined `"story"` (9:16) format for the share flow instead
  of leaving it dead code, or at minimum make the square format's content fill its space
  properly regardless of routine length — this is a Liftr-specific fix Liftoff's own card does
  *not* solve (see "do not repeat this flaw" above), not something research needs to justify.
- [ ] Add the tier badge (and ideally the session's highest rank-up, mirroring what
  `FinishSequence.vue`'s terminal frame now shows in-app) as a real visual element on the card.

---

## Phase 6 — Copy pass

Depends on 0d. Apply only the rewrites approved in review (not an automatic bulk-apply) — check
both `locales/de.json`/`locales/exercises.de.json` and inline template strings, since both exist
in this codebase (the i18n scaffolding is only partially adopted per `liftr-audit.md` §1: "i18n
scaffolding, not translation").

---

## Verification (every phase, not just at the end)

Same discipline the prior session established — repeat it here so a future session doesn't
have to reconstruct it:
1. `pnpm typecheck`, `pnpm test` (218 tests as of this writing — any new failure is a real
   regression), `pnpm lint`.
2. Live screenshots against a **copy** of `data/liftr.db`, never the original — start
   `packages/server` with `LIFTR_DB_PATH` pointed at the copy, `packages/client`'s dev server
   separately, screenshot via `npx playwright@latest screenshot --browser chromium
   --viewport-size=390,844 ...` (Chrome itself is not installed on this machine; Playwright's
   bundled Chromium is — MCP browser tools default to channel `chrome` and will fail). Stop both
   servers and delete the DB copy when done.
3. Design detector: `node <impeccable-skill-path>/scripts/detect.mjs --no-config --json
   packages/client/src`. Known baseline as of this writing: 6 false positives (bounce-easing on
   motion.css's own token declarations / documented earned-moment usage) + 1 detector bug
   (`MuscleFigure.vue:12`, comment-parsing). Any *new* finding beyond that baseline is real.
4. For any layout change, measure the live rendered layout with `getBoundingClientRect()`
   rather than trusting the CSS by inspection — this audit's own Phase-4-adjacent top-HUD work
   caught a real bug this way (a `margin-top` reservation that silently resolved to `0px`
   because a custom property was declared on the wrong element) that looked correct by eye.
5. `mobile-viewport-check` skill for any change touching `packages/client/src`.

---

## Explicitly out of scope

- Building actual multi-user/accounts support. Phase 3 only reviews the schema for
  forward-compatibility; it does not implement multi-tenancy.
- Payments or a premium tier — doesn't exist in this app, not being added. The "no dark
  patterns" constraint is about not importing manipulative *engagement* mechanics from research,
  not about avoiding paywalls that were never going to exist anyway.

---

## Research Findings

### 0b — Competitive engagement research (2026-09-02, deep re-run — 23 tool calls, 14 web searches/fetches, sources linked)

**Adopt:**

| Mechanism | Source app | Why it's ethical | Citation | Application to Liftr |
|---|---|---|---|---|
| Live PR banner mid-workout, detecting 5 distinct record types (heaviest-at-reps, e1RM, set volume, most reps, longest duration), **toggleable in settings** | Hevy | Rewards a just-verified real achievement at the moment it happens; multiple record axes mean a mediocre day can still yield *a* legitimate win; opt-out respects autonomy | Hevy Live PR docs; RepReturn review: "celebrates them in-workout... motivating without being obnoxious" | Fire an inline moment when a set moves a lift's e1RM; ship the settings toggle from day one; model multiple record axes, not just one |
| Previous-set autofill in grey above the current input | Strong | Not gamification — makes honest history legible at the decision point; cited as the biggest reason Strong's logging is fast, and logging speed is itself the retention driver | PRPath teardown | Lowest-risk win available; retention here comes from frictionlessness, not a hook |
| Streak protection granted **before** it's needed (freeze/amulet mechanics) | Duolingo | Protects motivation from one bad day; Chou's rule: "add recovery mechanics early... let users earn back a broken streak through action, not payment" | Chou, streak-design framework | Any consistency element needs a free, automatic, non-purchasable grace mechanic from launch. Liftr has no payments, so the "pay to repair" trap is structurally impossible — a real advantage, not just an absence |
| **Cap the streak; keep a separate never-resetting milestone counter** | Chou's critique of Duolingo | Directly defuses the loss-aversion trap: "a single missed day represents two and a half years of effort wasted... the weight of the streak grows every day and the reward stays exactly the same" | Chou | Liftr's 9-tier ladder **is already** a non-resetting milestone counter — do not bolt an uncapped streak on top of it. If a short-cycle loop is wanted, cap it at 7 days |
| "Protect the channel" notification discipline — quantity capped, gains come only from timing/copy, not volume | Duolingo (ex-CPO Jorge Mazal) | Explicit organizational rule against notification creep, motivated by watching Groupon permanently destroy its own opt-in rates via aggressive testing | Lenny's Newsletter interview | Fix a hard notification budget (≤1/day, opt-in, user-chosen time) and treat it as immutable, not a target to optimize upward |
| Muscle-group recovery heatmap | Fitbod | Genuinely useful honest derived info made exciting — the open-reason is real information, not a badge; most-praised feature in 2026 reviews | Multiple Fitbod reviews | A German "was ist bereit / was braucht Pause" body map, derived from logged volume, gives a legitimate daily open-reason with zero manipulation |
| Align challenges with the user's pre-existing goal, not app-native currency | Decision Lab / ethical-gamification literature | "Exercise restraint — trust that quality products retain users without artificial pressure" | Decision Lab, *Streak Creep*; UX Magazine | Liftr's tiers are denominated in things lifters already want (a squat number, a bodyweight ratio) — never invent app-native points as the goal |
| Autonomy: clear exits, flexible goals, celebration without demanding perfection | Ethical-gamification synthesis | "Autonomy itself is motivating — we want to feel we chose the action, not that the interface chose it for us" | UX Magazine, *Gamification or Manipulation?* | Every engagement surface needs a non-buried off switch; the app must be fully usable with all of it disabled |

**Reject:**

| Pattern | Source app | Why it's manipulative | Citation |
|---|---|---|---|
| Guilt-trip mascot copy / confirmshaming after inactivity | Duolingo | Frames inactivity as letting someone down; textbook confirmshaming (Brignull: "guilting the user... the option to decline is worded so as to shame"); the 2018 mascot redesign deliberately widened facial expressions to increase emotional reaction | deceptive.design; dark-pattern roundups |
| Loss-aversion streaks, uncapped | Duolingo, Snapchat, Apple Watch rings | Starts on pride, ends up "driven by Loss & Avoidance... compelled to maintain the streak to avoid losing it" — dread-bought engagement that burns out | Chou; Decision Lab |
| **Streak creep** — the activity becomes about the counter, not itself | Duolingo, Chess.com, LinkedIn, NYT Games | The overjustification effect: the activity "starts to feel like work... done in exchange for compensation"; users who break a streak are more likely to abandon the platform entirely | Decision Lab |
| Gamification metrics displacing the actual goal (peer-reviewed) | Duolingo | 9 years forum data + 15 interviews: users "become too fixated on gamification and get distracted from learning" via competitiveness, overindulgence, herding — badges/points *paradoxically undermine* the underlying activity | Mogavi et al., arXiv 2203.16175 |
| Ring-closing compulsion / achievement pressure | Apple Watch Activity Rings | Users report guilt when targets are missed, prioritizing the ring over genuine wellness, some abandoning the device — **the closest analogue to Liftr's own risk**: training through fatigue to protect a number is an injury vector, not a feature | Wearable-anxiety reporting |
| Infinitely-variable-reward tuning (Hook Model applied literally) | Common implementation of Nir Eyal's *Hooked* | Prescribes deliberately withholding predictability to sustain compulsion — Eyal himself later wrote *Indistractable* partly in response; Chou: "a start on ethics but not a solution" | Chou; Hook Model critiques |
| Slightly-too-aggressive PR detection | Hevy (mild, noted vs. Strong) | Inflating what counts as a record trades honesty for a dopamine hit — exactly the failure mode Liftr's `≈` stance exists to prevent | PRPath teardown |
| Streak-repair-for-money | Duolingo | Manufactures loss, then sells relief. Structurally impossible in Liftr (no payments) — worth naming so no non-monetary equivalent sneaks in | dark-pattern roundups |

**On the `≈` trust marker:** genuine differentiator, confirmed against real sources this time, not just absence of counter-examples. Searched specifically for any fitness/wearable product that hedges confidence in its *primary* progress display — found none: **not a single wearable manufacturer discloses how headline scores are calculated**, so the same person wearing three devices gets three confidently-stated, mutually contradictory numbers (Sensai comparison). Fetched Symmetric Strength's standards page directly — it hedges nothing, presents percentile thresholds as established fact. Hevy's docs describe a "1RM" record type without ever distinguishing measured from Epley-calculated. Where hedging exists at all in this category, it's legal-liability boilerplate, not a confidence signal in the display itself. The nearest real prior art sits **outside fitness entirely**, in emerging AI/ML "Confidence UI" pattern language: show uncertainty with labels/ranges/a next step, because "trust comes from calibration — confident when you should be, cautious when you must be, explicit about the difference." Two concrete refinements from that literature: make `≈` **tappable** (a one-line German explanation converts a hedge into a credibility moment), and map it to a decision, not just a caveat — the implication should be "test this to make it exact," turning the honesty marker into Liftr's most ethical possible engagement hook, since it's the one place the app's interest and the user's information interest point the same direction.

*Sources: PRPath (Strong vs Hevy 2026), Hevy Live PR docs, RepReturn Hevy review, Lenny's Newsletter (Duolingo growth interview), Yu-kai Chou (streak design; Hook Model critique), Decision Lab (Streak Creep), Mogavi et al. arXiv 2203.16175, deceptive.design (confirmshaming), UX Magazine (Gamification or Manipulation?), Symmetric Strength standards, Modexa (Confidence UI Pattern), TechRadar (wearable anxiety), Sensai (Garmin/WHOOP/Oura score-calculation comparison).*

### 0c — Motion decision framework (2026-09-02, deep re-run — `emil-design-eng` skill loaded in full, 23 tool calls including live doc fetches, cross-checked against real Liftr code)

**Method:** loaded `emil-design-eng` in full — drew its frequency-first table ("100+ times/day → no animation, ever"; rare/first-time → delight is fine), its transitions-retarget-vs-keyframes-restart distinction (keyframes are wrong for rapidly re-triggered elements), and its reduced-motion position ("fewer and gentler, not zero — keep opacity/color that aids comprehension, remove movement/position"). Grounded token guidance in live docs: Material Design 3 easing/duration tokens (emphasized `cubic-bezier(0.2,0,0,1)`, duration ladder short1 50ms→short4 200ms→medium4 400ms), the Norton motion scale (simple 100ms / simple-enter 150ms / simple-exit 75ms / complex 200ms / detailed 500ms, reduced-motion via a duration-scalar of 0 — exactly Liftr's own pattern), WCAG SC 2.3.3, Apple HIG Motion, and IxDF on Disney's 12 principles applied to UI. Read `motion.css`, `tokens.css`, `App.vue`, `WorkoutPage.vue`, `RestTimer.vue`, `FinishSequence.vue`, `RanksPage.vue`, `OverviewPage.vue`, `ExerciseList.vue`, `useCelebrate.ts`, `useCountUp.ts`, `useXpChip.ts`.

**Why earned moments get more budget, sourced on three independent grounds:** *Frequency* — Emil's table is a cost function; an animation's cost scales with how often it's seen, its benefit does not. A dashboard stagger fires on every mount; a level-up stamp fires a handful of times a month. *Semantics* — IxDF maps celebration to Disney's "secondary action" (confetti after a long form rewards effort) while warning "animation for the sake of animation will result in a poor interface" and over-exaggeration "may annoy users" — overshoot is a finite currency, spending it on chrome devalues it where it means something. *Standards* — WCAG 2.3.3 exempts only motion "essential to the functionality or information being conveyed"; a rest timer completing conveys information, a page entrance conveys that a page loaded (which the page already conveys). Net rule: **motion earns runtime in proportion to the information it carries, divided by how often it fires.**

**The checklist** (must pass 1-7 to ship; failing Q2 while wanting `--dur-cele`/`--ease-spring` is the single most common defect found in the sanity check below):
1. What is the trigger, and is it an event or a state? Event-driven (a set logged, timer hit zero, streak grew) is a keep candidate. Mount/route/render-driven is ambient chrome — presumed cut. A class bound to *persistent* state (not a one-shot flag) will replay on unrelated re-renders — that's a bug, not a design choice.
2. How often does one user see it per session? >10× → cut or reduce to `--dur-fast` opacity/color only. 1-3× → standard. <1×/session → eligible for `--dur-cele`/`--ease-spring`.
3. What state change does it communicate that the end state alone doesn't? If a before/after screenshot already makes the difference legible, the motion is decoration (WCAG's "essential" test, applied per-animation).
4. Can it be interrupted or re-fired faster than its own duration? If yes, it must be a `transition`, not `@keyframes` — keyframes restart from zero and visibly stutter under rapid re-trigger.
5. Does it animate only `transform`/`opacity`/`filter`? Anything touching layout (`width`/`height`/`margin`) fails; `.bar-fill` is the house standard.
6. Is the easing right for direction and tier? Entering/exiting → `--ease-out`. Overshoot only if Q2 answered "<1×/session." Continuous progress → `linear`.
7. Does the global `prefers-reduced-motion` collapse actually cover it? Only if every timing value is a `--dur-*` token AND the 1ms end-state is correct. It does **not** cover: hardcoded ms literals in CSS, `setTimeout`/`rAF` timing in JS, infinite loops, or any case where instant arrival produces a flash or a value that never renders — those need an explicit branch.
8. Would a haptic or a static end-state carry the same message? If yes, prefer it (HIG) — the tiebreaker that kills the marginal ambient motion.

**Duration/easing reference** (Liftr's real tokens, not invented categories):

| Category | Range | Easing | Liftr token | Real example |
|---|---|---|---|---|
| Press feedback | 100-160ms (Norton "simple" 100ms) | `--ease-out` | `--dur-fast` 120ms | `tokens.css:291` `.btn-primary:active` |
| Ambient chrome / route fade | 100-200ms (M3 short4 200ms) | `--ease-out` | `--dur-fast` | `App.vue:250` `.route-fade-*-active` |
| Real state change, entrance | 200-250ms (Norton "complex" 200ms) | `--ease-out` | `--dur-base` 220ms | `motion.css:65` `.bar-fill`; `ToastHost.vue:43` |
| Sheet/page-level surface | 400-500ms (M3 medium4 400ms) | `--ease-out` | `--dur-slow` 420ms | reserved; currently **unused** in the app |
| Earned moment | 500-700ms (Norton "detailed" 500ms) | `--ease-spring` | `--dur-cele` 700ms | `motion.css:84` `.stamp-in`; `RestTimer.vue:116` |
| Continuous progress | tick interval | `linear` | `--dur-base` | `RestTimer.vue:113` `transition: --p ... linear` |

Note: Liftr's `--ease-out` `cubic-bezier(0.2,0.8,0.2,1)` sits between M3 standard `(0.4,0,0.2,1)` and emphasized `(0.2,0,0,1)` — a legitimate, punchier-than-default curve, no change needed.

**Sanity check against real Liftr code:**
- `RestTimer.vue:115` `.ring-done` — **keep, unmodified**. Event trigger, once per rest period, one-shot iteration, `--dur-cele`/`--ease-spring` correctly spent, collapses to 1ms via tokens. Passes 1-8. **This is the template** for what the rest of the celebration-tier animations should look like.
- `OverviewPage.vue:375` `.dashboard > *` (+ `RanksPage.vue:147`, `ExerciseList.vue:233`) — **cut or reduce**. Fails Q1 (mount trigger) and Q2 (every navigation to the tab). The prior session already downgraded the easing to `--ease-out` for the right reasons; this framework says go one step further and drop the stagger entirely, or reduce to opacity-only at `--dur-fast`.
- `WorkoutPage.vue:563` `li` `:class="{ 'pop-in': s.logged }"` — **keep the intent, fix the mechanism**. Fails Q1 (class bound to durable state, replays on any list re-render) and Q4 (`@keyframes`, and sets can be logged in quick succession, which will visibly stutter). Needs a one-shot key or conversion to a `transition`.
- `WorkoutPage.vue:1127` `.xp-chip` `xp-float 1600ms` — **keep**, but flag: the 1600ms literal bypasses the token collapse entirely, which is *why* an explicit `@media (prefers-reduced-motion: reduce)` block exists at line 1147 for the CSS side. Its matching 1600ms JS lifetime in `useXpChip.ts:10` has **no such branch** — a real gap Phase 4 should close, not just note.

### 0a — Liftoff visual deep-dive (2026-09-01)

Sources: `overview.jpg`, 13 individual frames spread across the walkthrough, all 5
`mid-workout/` screenshots, 4 loose `Screenshot_*` files, 6 filmstrips (28 tool calls total —
this is the deep re-grounded pass).

**Medal/badge rendering** — five stacked layers make it read as metal, not the gradient alone:
1. *Extrusion plate*: a second hexagon ~6% larger, darkest tier shade, offset down ~3% —
   visible thickness on the bottom two edges (`drop-shadow(0 3px 0 var(--b0))` or a `::before`
   hex).
2. *Bevel rim*: a ~9%-wide ring whose gradient runs **opposite** to the face gradient (rim
   bright top-left while face is bright top-centre) — the single strongest metal cue.
3. *Face*: **3 gradient stops, not 2**. Bronze: dark-brown→mid-tan, ~25% luminance spread,
   broad soft highlight (matte). Silber: near-black→near-white, ~70% spread, highlight
   compressed to a narrow band (polished). Gold: **non-monotonic** — dark amber→saturated
   yellow→near-white→back to amber; that double-bright inflection is what separates gold from
   plain yellow. Platin/Diamant: hue *rotates* across the gradient (mint→white, lilac→cyan-white)
   rather than only lightening, for iridescence.
4. *Specular streak*: a hard, straight ~35° white band across the upper-left third plus a
   weaker parallel streak lower-right — a separate `linear-gradient(35deg, transparent 30%,
   rgba(255,255,255,.55) 38% 42%, transparent 50%)` layer clipped to the hex, ignoring the hex's
   own geometry (that mismatch is why it reads as reflection).
5. *Glyph relief*: the icon fills in a **lighter tint of the same metal, never white**, plus
   `drop-shadow(0 1px 0 rgba(0,0,0,.45))` so it sits proud of the face. Liftr's current
   all-tiers-white glyph fill is named as the main thing currently killing the material read.

Wings are a **tier signal, not decoration**: none at the low tiers, 3 chevron feathers/side at
mid tiers, gold gets 4 feathers plus a scalloped outer border. All tiers share a small trapezoid
clasp banner at the bottom vertex. Pure SVG paths, tinted by `currentColor` per tier — no raster
needed, compatible with Liftr's offline-PWA constraint.

**HUD composition**: fixed top bar ~56px, **same background as the page** (no bar surface, no
border, no blur — contradicts an assumption the earlier top-HUD implementation made). Left: one
compound pill (~40% width, 1px cyan border) — circular avatar overlapping/breaking the pill's
top+bottom edges, then `Lv.6`, then an inset XP bar (~10px, flat cyan fill, no gradient, 1px
lighter top edge) filling the rest of the pill. Centre: streak flame+count (egg/coin counter
here is **rejected**, see below). Right: **one contextual slot only** — the one HUD element that
changes per tab (bell / `?` / unit toggle); everything else is global and constant.

**Tab bar**: active state does **not** recolour the icon — icons stay full-colour permanently
(contradicts the "colored at rest, full on active" choice made in the prior session's Phase 2).
Active state instead: a filled rectangular block spanning the whole tab cell + full bar height,
one surface-lightness step up, plus a 2px accent rule across the block's *top* edge, plus the
label going grey→white. Square corners, no pill, no glow, no scale, no indicator animation.

**Color/saturation — structural, not just brighter**, five moves: (1) no shadows anywhere,
elevation is a surface-lightness step only; (2) saturation is *rationed* — at most one
saturated element per screen, high local contrast against a fully desaturated periphery; (3)
**reward surfaces take the tier as the whole card background** (`linear-gradient(155deg, …)` in
the metal hue + a second wide, low-opacity diagonal sheen band) — named as the single
biggest-bang-for-CSS move in the whole app; (4) the ladder screen has a trapezoid spotlight
wedge behind the tier column, current tier as a full-width band; (5) the purple→cyan gradient is
reserved for rank events only — a semantic marker used exactly once, not decoration.

**Typography**: one geometric-humanist sans, effectively two weights (400/500 and 700), no
light weights. Scale: 28-30px/700 section headers → 22px/700 card titles → 17-18px/400 body →
15px/500 list labels → 13px/400 secondary → 11px/700 uppercase ~0.06em tracking for tier
names/status chips. Numbers get the same face one step up at 700 with the unit as a smaller 400
sibling on the same baseline. Only display treatment: LEVEL UP wordmark, ~44px/900 all-caps
~0.12em tracking.

**Iconography**: deliberately two systems split by role — monochrome ~2px-stroke outline for
chrome/system (back arrow, X, timer), full-colour flat 2-3-tone SVG for content/identity (tab
bar, exercise thumbnails). Never emoji for the identity set (emoji is called out as where
Liftoff itself cheats).

**Motion — chrome never animates**: header/tab bar pinned, never move/fade/shrink/gain a border
on scroll; tier-card diagonal sheen is static, doesn't sweep; medals never rotate/pulse/glint.
Screen navigation: incoming card scale ~0.85→1.0 + translateY ~120px, ~280-320ms decelerating,
**no overshoot**. Banner dismiss: ~250ms ease-out collapse, no bounce. Skeletons resolve by
cross-fade, not shimmer sweep. Level-up screen fades in **as one group** (no per-element
stagger), XP bar fill is a separate beat after. Across 6 filmstrips spanning the whole
walkthrough: **nothing springs or overshoots** — directly informs Phase 4's `--ease-spring`
scarcity principle from 0c.

**Rejected elements, confirmed present and confirmed still rejected**: HUD egg/coin counter
(+ "Eierbonus" line, "Eier verdient" card); second horizontally-scrolling tab strip under the
HUD (which also clips under the HUD and gets half-covered by the promo pill); floating orange
"Wiederherstellen" promo pill overlapping the tab strip on every frame; rainbow-gradient borders
used inconsistently for both "unranked" and "promo" (no fixed semantics); "???  x  ??" locked-row
teaser placeholders (same upsell family).

**Conflicts with prior-session work to resolve in Phase 1:**
- Tab-bar active state: prior session made icons colored-at-rest/full-on-active; Liftoff keeps
  icons full-colour *always* and signals active via a filled block + top rule instead. Pick one
  — 0a's finding is the more direct "specific visual language" match per the team's stated
  direction.
- Top HUD background: prior session gave `.top-hud` a solid `--surface` backdrop; Liftoff's HUD
  has no bar surface at all, blending into the page. Needs a decision, not an assumption either
  way — a borderless HUD may reintroduce exactly the "content visible through gaps" bug the
  original bottom-chrome P0 fix solved, so verify against real scroll content before adopting.

### 0d — Copy tone audit (2026-09-01)

**Calibration reference (do not touch):** `WorkoutPage.vue:413-419`'s routine empty state
remains the bar — explains *why* the app works the way it does, in the app's own terms, at the
moment the user needs it. Also confirmed good: `WorkoutPage.vue:313` ("Du warst stärker als
geplant"), `:531` ("Letztes Mal an dieser Stelle"), `SetEntry.vue:61`'s plate-mismatch warning,
`RanksPage.vue:54`, the onboarding steps, and the `PLAUSIBILITY_NOTE_DE` strings in
`useWorkoutFinish.ts:33-36`.

**~35 flagged findings** — full table below. Two structural patterns emerged, more useful than
the individual fixes:

1. **The dividing line is almost exactly active states vs. absent states.** Wherever something
   is *happening* (a set beaten, a plate mismatch, a rank explained, a routine being built), the
   copy is specific, addresses the user as "du", says why it matters. Wherever something is
   *missing* (empty tiles, no ranks yet, no history, nothing loaded), copy collapses into one of
   ~4 interchangeable formulas — "Noch keine X.", "Noch nicht genug Daten.", "Konnte nicht
   geladen werden." — each repeated verbatim in 2-3 places, none saying when/how the emptiness
   ends. **This directly compounds Phase 3's dashboard-overflow work and the original critique's
   "wall of dashes" finding** — the empty-state copy was never actually fixed, just visually
   reorganized around.
2. **Passive mechanism-speak in explanatory hints** — "Wird für … verwendet", "Wird genutzt, um
   … zu beschränken", "werden … zusammengestellt" — describes the implementation to the user
   instead of the outcome. Concentrated in `ProfilePage.vue` and onboarding/wizard hints.
3. **A separate, distinct problem**: `locales/exercises.de.json`'s how-to cues are templated per
   muscle group (~10 templates fanned across the whole catalog) rather than per-exercise, and
   some are outright grammatically broken (accusative object on an intransitive verb, repeated
   across ~15 exercises) or factually wrong for the movement (a barbell-press cue applied
   verbatim to Liegestütze/pushups). This is the single largest concentration of "on the nose"
   text in the app and reads as machine-templated because it is.

**Findings table** (file:line | current | proposed | reasoning) — apply only after review, not
automatically:

| File:line | Current | Proposed | Reasoning |
|---|---|---|---|
| `OverviewPage.vue:224` | Leg im Workout-Tab deine erste Routine an. | Ohne Routine kein Rang — eine Routine legt fest, welche Übungen du wiederholt trainierst. | Names a tab instead of what a routine is/why it matters |
| `OverviewPage.vue:225` | Zum Workout-Tab → | Erste Routine anlegen → | Labels navigation, not the outcome |
| `OverviewPage.vue:269` | Noch nicht genug Daten. | Ab dem zweiten Trainingstag zeichnet sich hier deine Volumenkurve ab. | Generic; doesn't say how much is "genug" |
| `OverviewPage.vue:291` | Noch nicht genug Daten. | Zwei Einträge, und dein Gewichtsverlauf steht hier. | Same string reused verbatim on a different tile |
| `OverviewPage.vue:285` | Noch keine Ränge. | Dein erster Rang entsteht, sobald du eine Übung geloggt hast. | Restates the header, no path forward |
| `OverviewPage.vue:327` | Noch keine abgeschlossenen Workouts oder Läufe. | Hier landet ab dem ersten beendeten Workout alles, was du gemacht hast. | Restates "Letzte Aktivität" + visible emptiness |
| `OverviewPage.vue:325` | Keine Verbindung — Verlauf konnte nicht geladen werden. | Keine Verbindung zum Server. Was du geloggt hast, ist lokal gespeichert. | Doesn't say the offline-first guarantee, exactly when it matters |
| `OverviewPage.vue:311` | Workouts, Sätze, Läufe & Körpergewicht als CSV in einer ZIP-Datei sichern | Deine Daten als CSV — lesbar auch ohne Liftr | Describes format, not the point (data ownership) |
| `ProfilePage.vue:231` | Ein Nutzer · selbst gehostet. | Dein Server, dein Konto, deine Daten. | Flat architecture fact |
| `ProfilePage.vue:235` | Wird für die Rang-Berechnung (Gewicht / Körpergewicht) verwendet. | Dein Rang misst Gewicht immer im Verhältnis zu deinem Körpergewicht. | Passive, mechanism-first |
| `ProfilePage.vue:293` | Wird genutzt, um Übungsvorschläge auf das zu beschränken, was dir tatsächlich zur Verfügung steht. | Damit dir nur Übungen vorgeschlagen werden, die du hier auch machen kannst — sonst Alternativen. | Frames a benefit as a restriction |
| `ProfilePage.vue:258` + `ExperienceStep.vue:17` | Bestimmt (u.a.) den Startpunkt für Gewichtsvorschläge bei Übungen ohne eigene Trainingshistorie. | Legt fest, mit welchen Gewichten Liftr startet, solange du eine Übung noch nie gemacht hast. | Data-model vocabulary, near-duplicate elsewhere |
| `ProfilePage.vue:361` | Wird angezeigt / Ausgeblendet | XP erscheinen im Workout und auf der Übersicht. / XP bleiben verborgen. | Redundant with the adjacent button label |
| `ProfilePage.vue:114/134/144` | Gespeichert | Körpergewicht/Profil/Equipment gespeichert. | Generic, interchangeable across 3 forms |
| `ProfilePage.vue:186` | Berechtigung nicht vollständig erteilt. | Health Connect hat nicht alle Freigaben bekommen — bitte in den Health-Connect-Einstellungen nachtragen. | Bureaucratic passive, no next step |
| `RanksPage.vue:64` + `ExerciseInfoPanel.vue:175` | Noch keine Ränge — logge ein paar Sätze, um deinen ersten Rang zu sehen. | Noch kein Rang — er entsteht aus deinem besten Satz, sobald du diese Übung einmal trainiert hast. | Vague ("ein paar Sätze"), duplicated verbatim in 2 places |
| `RankProgress.vue:73-74` | nächster: 100 kg × 5 | Nächstes Ziel: 100 kg × 5 | Dangling lowercase adjective, no noun |
| `RankProgress.vue:63` | Bestleistung: Gold II | Schon mal erreicht: Gold II | Flat data label at the moment rank was *lost* |
| `FinishSequence.vue:149` | 3 Schutz-Token übrig | Deine Serie übersteht noch 3 Ruhetage. | Names internal mechanism mid-celebration |
| `FinishSequence.vue:168` | Tippen für weiter → | Weiter tippen → | Grammatically broken, sits on the app's emotional climax |
| `WorkoutPage.vue:262` | Workout abgeschlossen | Geschafft | Restates what the whole screen already communicates |
| `WorkoutPage.vue:290` | Rang-Hinweise | Was sich verändert hat | System vocabulary for the session's actual outcomes |
| `WorkoutPage.vue:426` | Quick Start (erste 4 Übungen, ohne Routine) | Ohne Routine loslegen · die ersten 4 Übungen | Parenthetical implementation note as a button label |
| `WorkoutPage.vue:433-434` | …oder wurde vergessen, es zu beenden? | …oder hast du vergessen, es zu beenden? | Impersonal passive in an app that otherwise uses "du" |
| `WorkoutPage.vue:553` | Wiederholungen eingeben, um den Satz zu speichern | Erst Wiederholungen, dann speichern. | Restates the disabled button directly below it |
| `ErholungszoneCard.vue:33` | BEREIT ZUM TRAINING | (make conditional, or "DEIN STATUS") | Static pill stays green even when nothing's recovered |
| `ErholungszoneCard.vue:24` | …vollständig erholt. Lass uns trainieren! | …vollständig erholt. | Duplicates the CTA button right below it |
| `ErholungszoneCard.vue:20` | Fast alles ist noch erholt oder noch nicht trainiert — leg direkt los. | Nichts ist gerade belastet — du kannst frei wählen. | Leaks data-model uncertainty into user-facing copy |
| `RankUpCalendar.vue:41` | Diese Woche noch keine Rangaufstiege. | Der erste Aufstieg dieser Woche steht noch aus. | Redundant with the eyebrow + visibly empty dot strip |
| `ExerciseHistoryList.vue:47` | Noch keine Sätze für diese Übung protokolliert. | Diese Übung hast du noch nie geloggt. | "protokolliert" is bureaucratic; app says "loggen" elsewhere |
| `ProgressChart.vue:75` | Noch nicht genug Daten für einen Verlauf. | Ab dem zweiten Trainingstag zeichnet sich hier eine Kurve. | Third instance of the same interchangeable formula |
| `ExerciseList.vue:125` | Keine Übungen gefunden. | Keine Übung passt zu diesen Filtern. | No escape hint, generic search-result phrasing |
| `PickStep.vue:43` | Passende Übungen inkl. Satz-/Wiederholungs-/Gewichtsvorschlag werden anhand deiner bisherigen Trainingsdaten zusammengestellt. | Liftr stellt passende Übungen zusammen — mit Sätzen, Wiederholungen und Gewichten, die zu dem passen, was du bisher geschafft hast. | Slash-compound noun stack, passive voice |
| `ArrangeStep.vue:143` | Gewicht nicht verfolgen | Ohne Gewicht loggen | "verfolgen" is tracking-app jargon |
| `AuthGate.vue:65` | Weiter | Entsperren | Labels the wizard step, not unlocking the server |
| `WorkoutDetail.vue:155` | Konnte nicht geladen werden. | Dieses Workout ließ sich nicht laden — möglicherweise keine Verbindung zum Server. | Subject-less passive, no cause, no next step |
| `RunsPage.vue:11` vs `:35-36` | Same "kein Drittanbieter-Konto" claim, twice on one screen | Keep only the empty-state version | Duplicated 7 lines apart |
| `locales/exercises.de.json` (~10 exercises) | Shared verbatim cue text across unrelated exercises (e.g. a barbell-press cue applied to Liegestütze) | Per-exercise cues | Templated-per-muscle-group, not per-exercise — largest single source of "on the nose" text |
| `locales/exercises.de.json` (~15 exercises) | "— den oberen Rücken zieht." (broken accusative-on-intransitive-verb pattern) | "— du spürst es im oberen Rücken." | Grammatically broken German shipped repeatedly, reads as machine-templated |
