# Nebula — Components & Screens (Ground Truth)

**Status: normative**, companion to `nebula-design-system.md` (read that first for the tokens and
the rationing rules this document applies). Supersedes and consolidates the deleted
`nebula-design-patterns.md` and `nebula-design-layout.md`. Each entry states the rule, the real
component/file it governs, and — new in this rewrite — its verified implementation status, so
future work knows what to trust vs. what still needs a live check or a fix.

Status legend: ✅ Verified shipped and working (confirmed live, round 2) · 🟡 Shipped in code,
confirmed via static read only, not yet independently confirmed live · ⚠ Known bug, needs a fix ·
⬜ Not built / open work item.

---

## Component patterns

### 1. HUD chrome — level-ring & streak chip
**Files:** `App.vue` (`.level-chip`, `.streak-chip`, `.top-hud`).
**Rule:** `.level-chip`'s accent is a small filled dot/ring using `--nebula-grad`; `Lv. N` text
stays solid `--text`. `.streak-chip`'s flame icon is `--nebula-ink` at rest; its glow lights up only
during the existing `.streak-pulse` window. Layout/positioning/visibility (`hideTopHud`) is
unchanged by any of this.
**Status:** 🟡 — round 1 confirmed `.level-dot` and `.streak-pulse` glow wiring exist in `App.vue`
with matching token values (`audit/verify/agent-6.md`). Not independently re-confirmed rendering
live in round 2 (round 2's design agents screenshotted Overview/Workout page content, not the
top-of-screen HUD strip specifically) — a live spot-check is a cheap follow-up, not a rebuild.

### 2. Rank medallion (hexagon badge) + rank-up ring
**Files:** `tokens.css`'s `.badge`/`.t-<tier>` system; `FinishSequence.vue`'s wrapping ring markup.
**Rule:** the badge itself never changes — stays on the 9-tier metal system, always (see
`nebula-design-system.md` §1). What's new is a **Nebula ring**, a wrapping element (not a third
pseudo-element on `.badge`, which is already using `::before` for its bevel) shown only during a
rank-up's celebratory beat, muted (`.badge-ring-muted`) for a plausibility-discounted rank-up.
Resting badges (browsing Ranks) never show a ring.
**Status:** 🟡 — round 1 confirmed `.badge-ring`/`.badge-ring-muted` exist in `FinishSequence.vue`
and are structurally scoped to the rank-up beat condition (`audit/verify/agent-8.md`). Round 2
could not trigger a genuine rank-up live in either session to visually confirm the ring/glow render
(`audit/verify/round2-agent-3.md`, `round2-design-agent-3.md`) — **this is the single highest-value
live check left to do**: complete a workout that crosses a rank threshold and screenshot the beat.

### 3. Primary CTA
**Files:** `tokens.css`'s `.btn-primary`.
**Rule:** background is `var(--nebula-grad-cta)`, ink is `--nebula-ink-on-fill`. Press/hover
feedback unchanged. `.btn-primary:disabled` stays flat/neutral — disabled must never carry brand
gradient. `.btn-secondary` stays neutral, always — Nebula is reserved for exactly one button tier.
**Status:** ✅ — round 2 independently confirmed this live on Overview ("Jetzt trainieren"), Workout
("Satz speichern"), and Profile ("Speichern") in both dark and light mode, with the gradient stops
matching tokens.css exactly (`round2-design-agent-1.md`, `-2.md`, `-3.md`). This is the one element
of the whole system confirmed working end-to-end.

### 4. Progress bars (`.rankbar`)
**Files:** `tokens.css`'s `.rankbar > i`, `motion.css`'s `.bar-fill`.
**Rule:** non-tiered bars (no `.t-<tier>` ancestor) fall back to `--nebula-grad` instead of plain
blue. Tier-context bars keep rendering their tier's own metal gradient, unaffected.
**Status:** 🟡 — fallback chain confirmed in source (`audit/verify/agent-1.md`). Round 2 only
observed tier-context bars live (bronze/silver, correctly not Nebula per rule); the non-tiered
fallback case wasn't separately exercised live. Low-risk, single-line CSS — no action needed unless
a future non-tiered bar is added and visually spot-checked then.

### 5. Reward panels (`.panel-reward`)
**Files:** `tokens.css`'s `.panel`/`.panel-reward`.
**Rule:** a reward panel's background is still the tier color by default (unchanged). A panel
representing a genuinely new, non-tier-anchored milestone (a Personal Records ledger entry at the
moment it's achieved) gets `.panel-reward--nebula`, falling back to `--nebula-grad` — same fallback
pattern as `.rankbar`. The PR ledger's steady-state list (browsing past PRs) stays on plain
`.panel` with a small `--nebula-ink` badge, not a gradient card per row.
**Status:** 🟡 — class and token confirmed present in `tokens.css` and wired into `RecordsPage.vue`
(`audit/verify/agent-6.md`). The "just achieved" one-time-vs-steady-state distinction was not
independently exercised live (would require triggering a fresh PR mid-session).

### 6. Empty/loading/disabled states
**Rule:** no Nebula treatment, ever. Empty states, loading skeletons, and disabled controls stay on
the neutral `--surface`/`--faint` system — an empty state wearing the "earned" gradient would
misrepresent the state as achieved.
**Status:** ✅ consistent with everything observed in both rounds — no violation found anywhere.

### 7. List rows & tables (dense surfaces)
**Files:** exercise lists, set-logging rows, routine lists.
**Rule:** no gradient background on rows. Where a row needs a "just earned" accent (a PR flag on a
set row), it's a small inline `--nebula-ink` marker, never a row-level background change.
**Status:** ✅ consistent with everything observed — no violation found.

---

## Screen-level application

### Navigation shell
The active-tab indicator falls back to `--nebula-grad` only when no tier context is in scope at
all (the nav chrome itself, outside any specific rank card).
**Status:** ✅ round 2 confirmed the live nav is a static 5-tab bar (Overview/Workout/Ranks/
Exercises/Profile — `round2-agent-1.md`); active-tab treatment (filled block + full-color icon) was
separately confirmed live (`round2-design-agent-1.md`). **Note:** the app's actual nav is 5 flat
tabs, not the "Today/Train/Progress/Plan/Profile" five-zone IA some older planning docs (Plan C)
described — that IA was never built and this document does not resurrect it as a requirement; the
current flat nav is the accepted shipped shape.

### Today / Overview
Exactly one `.btn-primary` at rest (the routine-start CTA); everything else — the readiness card,
routine cards, status-strip stat tiles — stays on the neutral/tier system per
`nebula-design-system.md` §2's positive list (this explicitly includes `StatTile.vue`'s streak/level
values staying solid, not gradient — see the ratified resolution there).
**Status:** ✅ confirmed live — CTA gradient present and correct, StatTile solid colors confirmed
and now understood as correct-by-design, not a gap (`round2-design-agent-1.md`).

### Train (active workout)
No HUD chrome at all (`hideTopHud` stays true here — unrelated to Nebula, an existing rule). The
set-kind picker and rest-timer active states use solid `--nebula-ink`, not gradient — these are
~30×/session interactions, too frequent for gradient-clip per `nebula-design-system.md` §2's
text rule. The log-set CTA gets the gradient fill; it never gets glow (glow is reserved for
`success`-tier events downstream of the tap — a rank-up, a PR — not the tap itself, or a button
pressed 30×/session would read as noise, not reward).
**Status:** ✅ CTA gradient confirmed live and correct. 🟡 the rank/tier progress card at the top of
the active-workout screen (the first thing a user sees on entering a set) correctly stays on the
tier metal-color system per this rule — round 2 flagged this as "not matching the mockup"
(`round2-design-agent-2.md`), which per `nebula-design-system.md` §1 is the system working as
designed, not a defect; no action needed.

### Finish Sequence & Ranks
Rank-up beat: tier medallion in its own metal gradient; surrounding chrome (background wash,
continue prompt) gets Nebula's glow for that beat's hold only, plus the badge ring (component §2).
Same-band recovery gain: LP bar still animates, no glow/ring layered on top. Plausibility-discounted
session: structurally cannot reach the glow/ring path (see `nebula-design-system.md` §4). Ranks
page's weekday rank-up strip: cells with a genuine rank-up get a small Nebula-tinted dot — this is
the one *persistent* (non-transient) Nebula usage in the app, justified because it marks a
historical fact, not ambient decoration.
**Status:** 🟡 LP-bar animation and plausibility-muting confirmed live and working correctly
(`round2-agent-3.md` — a forced-implausible session was correctly caught and visually flagged).
Ring/glow during an actual rank-up beat: not yet confirmed live (see component §2 above — top
follow-up item). Resting Ranks-list badges correctly show tier colors, not Nebula — confirmed, and
correct per design, not a gap.

### Plan (routines, mesocycles, exercise catalog)
Explicitly low-Nebula by design — a denser, form-like "planning desk," not a reward surface. Only
touchpoint: the wizard's final "Speichern"/"Routine erstellen" button.
**Status:** ✅ consistent with everything observed — no violation found.

### Profile, Data & Auth
Theme toggle lives here (Dunkel/Hell), styled like any other settings row, no special treatment.
Account-level overall-tier summary follows the same medallion+ring rule as Ranks (resting = no
ring, no glow).
**Status:** ✅ CTA gradient confirmed on Save buttons. ⚠ See `nebula-design-system.md` §6 — the
theme toggle itself has a real bug (rank-ladder/exercise-card surfaces don't visually go light even
though `--bg` resolves correctly) that needs fixing; track it in `workplan-v1.md`, not here.

### Runs
No Nebula touchpoint beyond the shared `.btn-primary` fill — Runs has no rank/XP/streak surface of
its own to carry the identity further.
**Status:** ✅ consistent with everything observed.

---

## Cross-cutting rule (unchanged, still the governing check)

Across every screen: **exactly one `.btn-primary` carries Nebula's gradient at rest; every other
appearance is transient, tied to a specific `success`-tier event, and reverts to neutral once that
event's motion window ends.** If a future screen spec calls for a second always-on gradient surface
on the same screen, re-read `nebula-design-system.md` §1 before adding it.
