# Engagement & Rank Rework — Audit + Plan

**Status:** Round 1 (W1–W6) and Round 2 (W7–W9) **done, committed**. Round 3 (rank engine
redesign, R1–R3) **planned, not yet built**. This document consolidates all three rounds
into one living reference; see §4 for the up-to-date implementation status.

---

## 1. Why this exists

Liftr's own project audit (`workout-tracker-project-audit-v2.md` §2, principle 2) states the
core design philosophy plainly: *"ADHD-friendly motivation is a design philosophy, not a
checkbox... immediate/variable rewards beat long-term abstract goals."* Two external
references were used to pressure-test how well the app actually delivers on that:

1. **`examples/walkthrough_bundle/`** — an 89-frame + 73-filmstrip breakdown of a 303-second
   screen recording of a competitor fitness app (German-language, gitignored, local-only
   reference material — not redistributed). It leans hard on: a persistent level/streak/XP
   HUD, League-of-Legends-style per-exercise rank ladders with LP, a whole-body recovery
   heatmap gauge, rank-distribution/rank-up analytics, a "discover" hub surfacing buried
   features, and a full social layer (friends, feeds, reactions, shareable templates,
   cosmetic profile customization).
2. **A comparative study of seven competitive games' ranked systems** (League of Legends,
   Rainbow Six Siege Ranked 3.0, Apex Legends, Deadlock, VALORANT, CS2 Competitive, CS2
   Premier) — evaluating what makes ranked progression feel rewarding vs. frustrating across
   the industry.

**Governing constraint, unchanged from the project's original scope decisions:** Liftr is
single-user, self-hosted, no accounts (`liftr-code-audit.md`; `workout-tracker-project-audit-v2.md`
§3 "Deprioritized/Skip Entirely: Multi-user accounts, social sharing, leaderboards"). Every
recommendation below that only makes sense with real other users (friends, feeds, reactions,
leaderboards, hidden MMR/matchmaking, placement matches, entry costs, smurf detection) was
evaluated and **rejected as out of scope** — not overlooked. What's built and planned here is
everything from both references that is genuinely single-player-safe.

---

## 2. Round 1 — Engagement/"dopamine" rework (W1–W6) — ✅ done, pre-existing

Built before this document existed, from a single reference screenshot. Verified via
`grep -rn "engagement rework" packages/` — every planned item has a matching code comment.

| Workstream | What it built |
|---|---|
| W1 | Motion + haptics foundation (`motion.css`, `haptics.ts`, `useCountUp`, `useCelebrate`) |
| W2 | In-session rank progress bar — the reward moves *during* the set, not just on a separate tab |
| W3 | Set-logging feedback — press states, `+N XP` chip, haptics, continuously-sweeping rest-timer ring |
| W4 | Three-beat finish sequence (rank-ups → streak → XP/level), replacing one flat summary card |
| W5 | "Erholungszone" — whole-body recovery heatmap hero on the dashboard, a reason to open the app on a rest day |
| W6 | Ambient polish — pulsing streak chip, route cross-fade, staggered dashboard entrance |

---

## 3. Round 2 — Per-exercise depth + rank analytics (W7–W9) — ✅ done, this session

Built from the richer `walkthrough_bundle` video reference, filtered through the same
single-player constraint. Full design rationale and file:line citations live in
`~/.claude/plans/liftr-engagement-rework-w7-w9.md` (local plan file, not repo-tracked).

| Workstream | What it built | Commit |
|---|---|---|
| W7 | `ExerciseInfoPanel.vue` gains a 4-tab sheet: Über / Rang / Statistiken / Verlauf — reuses `RankProgress`/`ProgressChart` as-is, adds one new `ExerciseHistoryList.vue` | `f903f32` |
| W8 | `rank_events` table (rank-up history), a rank-distribution donut + rank-ups-per-weekday calendar on `RanksPage.vue`, "nächster: ???" curiosity framing when no next target exists | `313dc09` |
| W9 | "Entdecken" discovery grid on `OverviewPage.vue`, surfacing CSV export and the new rank analytics — the plate calculator was checked and found to have no standalone entry point, so it was correctly left out rather than built new | `6019128` |
| fix | Two routine (non-reward) page entrances were using the overshoot easing reserved for earned moments (`motion.css`'s own documented convention) — corrected to `--ease-out` | `8c0f158` |

**Explicitly rejected from the video reference** (present in the app, absent from Liftr by
design): Friends tab, social "For You"/feed home layout, shareable/forkable routine
templates with reactions, an aggregate League-of-Legends-style discipline rank with hidden
"placement matches" against a population, unlockable cosmetics (avatar border/banner/title)
whose entire point is being seen by others. None of these solve a problem a single-user app
has.

---

## 4. Round 3 — Rank engine redesign (R1–R3) — 📋 planned, not yet built

Full design rationale, exact schema/function signatures, and verification checklists live in
`~/.claude/plans/liftr-rank-engine-redesign.md` (local plan file, not repo-tracked). Summary:

### 4.1 What the seven-game comparison actually tells us

**Almost none of it transfers directly.** Every game studied solves problems specific to PvP
matchmaking — hidden MMR vs. visible rank divergence, opponent-relative scoring, demotion,
placement matches, entry costs, smurf detection, teammate dependency. Liftr has no opponents
and no matches, so none of these problems exist here, and importing their solutions (hidden
MMR, entry costs, placement matches) would be actively wrong for a single-player app.

**What does transfer** is the psychology of progression systems in general:
- Transparency beats mathematical purity (Deadlock/CS2 Premier's strength; every hidden-MMR
  game's weakness) — Liftr's `resolveRank` is already pure and deterministic; this must stay true.
- Boundary crossings should feel earned (Deadlock doubles the cost of the final subrank
  before a tier change) — already served by the existing `RankUpCelebration.vue`.
- Protect against demotion frustration without removing all stakes — the one place a real
  new mechanic is warranted (see 4.3).
- A single account-level number matters — every game has one visible headline rank; Liftr
  has ~15+ independent per-exercise ladders and nothing answering "how good a lifter am I,
  overall" (see 4.4).

### 4.2 A real bug found while grounding this design

`recomputeRankForExercise` (`packages/server/src/services/rankService.ts:69-157`) computes
rank from `e1RM / getCurrentBodyweightKg(db)` for bodyweight-relative exercises, using
*current* bodyweight against the *all-time-best* e1RM. A legitimate bodyweight increase with
no strength loss can silently lower this ratio — an accidental, undocumented violation of the
system's own "rank never decreases" property. **R1 fixes this.**

### 4.3 R1 + R2 — Peak Rank vs. Current Rank

User decision this session: rank should never risk losing *all* progress, but total
permanence removes the motivation to keep training a lift.

- **R1 — Peak Rank** (new, permanent, ratchet-only): additive columns on the `ranks` table
  (`peakTier`, `peakDivision`, `peakLp`, `peakE1rm`, `peakAchievedAt`), updated only when a
  new value's ordinal position exceeds the stored peak. Fixes 4.2 structurally — peak is
  locked in using the bodyweight at the moment it was achieved, never recomputed retroactively.
- **R2 — Current Rank** (existing fields, repurposed): softens with inactivity toward a floor,
  but **the floor is the bottom of the peak tier** — a Gold peak can drift down to Gold III
  within the tier, never into Silver. Logging one new set snaps current rank back to peak
  instantly (not a second climb-back-up grind). A visible caption
  (`"-1 Division seit 24 Tagen"`) keeps the mechanism transparent, per 4.1's #1 lesson.

### 4.4 R3 — Overall Lifter Rank (aggregate)

A single tier/number derived from current (decayed) per-exercise ranks, weighted toward
real/derived-trust anchor lifts (back-squat, bench-press, deadlift, overhead-press,
barbell-row, plus bodyweight anchors) so the ~94-exercise synthetic long tail can't dilute or
inflate it. Shown as one more stat tile on the existing dashboard alongside a separate
Career-Peak aggregate — no new page, no leaderboard, no social surface.

### 4.5 Sequencing

R1 (bug fix, foundation) → R2 (decay mechanic, the biggest user-visible behavior change) →
R3 (aggregate, purely additive). Each independently shippable, same philosophy as Round 2.

---

## 5. Reference inventory

- `examples/walkthrough_bundle/` — gitignored (`examples/` in `.gitignore`), local-only video
  breakdown; not part of this repo's tracked history.
- `~/.claude/plans/the-ui-works-and-buzzing-pony.md` — Round 1 (W1–W6) plan, pre-existing.
- `~/.claude/plans/liftr-engagement-rework-w7-w9.md` — Round 2 (W7–W9) plan, this session.
- `~/.claude/plans/liftr-rank-engine-redesign.md` — Round 3 (R1–R3) plan, this session, not
  yet implemented.
- `workout-tracker-project-audit-v2.md` — the master project audit/status log (§8 is the
  authoritative "what's built" reference for everything outside this document's scope).
- `liftr-code-audit.md` — the separate security/code-quality audit.

**Next step:** implement R1–R3 per the plan above, following the same implement → verify →
commit cadence used for W7–W9 in this session.
