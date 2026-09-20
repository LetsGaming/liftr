# Nebula — Components & Screens (Ground Truth)

**Status: normative**, companion to `nebula-design-system.md` (read that first for the tokens and
the rationing rules this document applies). Supersedes and consolidates the deleted
`nebula-design-patterns.md` and `nebula-design-layout.md`. Each entry states the rule and the real
component/file it governs.

**Point-in-time note:** this document describes the design system as last verified against the
shipped app (2026-09-04/05). Treat it as a design reference, not a live-updated spec — check
current behavior in the linked files before assuming a claim still holds, and treat the "Known gap"
notes below as things to re-check rather than confirmed-permanent facts.

---

## Component patterns

### 1. HUD chrome — level-ring & streak chip
**Files:** `App.vue` (`.level-chip`, `.streak-chip`, `.top-hud`).
**Rule:** `.level-chip`'s accent is a small filled dot/ring using `--nebula-grad`; `Lv. N` text
stays solid `--text`. `.streak-chip`'s flame icon is `--nebula-ink` at rest; its glow lights up only
during the existing `.streak-pulse` window. Layout/positioning/visibility (`hideTopHud`) is
unchanged by any of this.

### 2. Rank medallion (hexagon badge) + rank-up ring
**Files:** `tokens.css`'s `.badge`/`.t-<tier>` system; `FinishSequence.vue`'s wrapping ring markup.
**Rule:** the badge itself never changes — stays on the 9-tier metal system, always (see
`nebula-design-system.md` §1). What's new is a **Nebula ring**, a wrapping element (not a third
pseudo-element on `.badge`, which is already using `::before` for its bevel) shown only during a
rank-up's celebratory beat, muted (`.badge-ring-muted`) for a plausibility-discounted rank-up.
Resting badges (browsing Ranks) never show a ring.

### 3. Primary CTA
**Files:** `tokens.css`'s `.btn-primary`.
**Rule:** background is `var(--nebula-grad-cta)`, ink is `--nebula-ink-on-fill`. Press/hover
feedback unchanged. `.btn-primary:disabled` stays flat/neutral — disabled must never carry brand
gradient. `.btn-secondary` stays neutral, always — Nebula is reserved for exactly one button tier.

### 4. Progress bars (`.rankbar`)
**Files:** `tokens.css`'s `.rankbar > i`, `motion.css`'s `.bar-fill`.
**Rule:** non-tiered bars (no `.t-<tier>` ancestor) fall back to `--nebula-grad` instead of plain
blue. Tier-context bars keep rendering their tier's own metal gradient, unaffected.

### 5. Reward panels (`.panel-reward`)
**Files:** `tokens.css`'s `.panel`/`.panel-reward`.
**Rule:** a reward panel's background is still the tier color by default (unchanged). A panel
representing a genuinely new, non-tier-anchored milestone (a Personal Records ledger entry at the
moment it's achieved) gets `.panel-reward--nebula`, falling back to `--nebula-grad` — same fallback
pattern as `.rankbar`. The PR ledger's steady-state list (browsing past PRs) stays on plain
`.panel` with a small `--nebula-ink` badge, not a gradient card per row.

### 6. Empty/loading/disabled states
**Rule:** no Nebula treatment, ever. Empty states, loading skeletons, and disabled controls stay on
the neutral `--surface`/`--faint` system — an empty state wearing the "earned" gradient would
misrepresent the state as achieved.

### 7. List rows & tables (dense surfaces)
**Files:** exercise lists, set-logging rows, routine lists.
**Rule:** no gradient background on rows. Where a row needs a "just earned" accent (a PR flag on a
set row), it's a small inline `--nebula-ink` marker, never a row-level background change.

---

## Screen-level application

### Navigation shell
The active-tab indicator falls back to `--nebula-grad` only when no tier context is in scope at
all (the nav chrome itself, outside any specific rank card). The app's actual nav (`App.vue`'s
`navItems`) is 5 flat tabs — Übersicht/Workout/Ränge/Übungen/Profil — not a deeper five-zone
information architecture some older planning docs described; that IA was never built and this
document does not resurrect it as a requirement. Runs (`/runs`) isn't a top-level tab — it's
reached via the Workout tab's in-page switcher, though the route itself is separate and gets its
own active-tab and heading handling in `App.vue`.

### Today / Overview
Exactly one `.btn-primary` at rest (the routine-start CTA); everything else — the readiness card,
routine cards, status-strip stat tiles — stays on the neutral/tier system per
`nebula-design-system.md` §2's positive list (this explicitly includes `StatTile.vue`'s streak/level
values staying solid, not gradient — see the ratified resolution there).

### Train (active workout)
No HUD chrome at all (`hideTopHud` stays true here — unrelated to Nebula, an existing rule). The
set-kind picker and rest-timer active states use solid `--nebula-ink`, not gradient — these are
~30×/session interactions, too frequent for gradient-clip per `nebula-design-system.md` §2's
text rule. The log-set CTA gets the gradient fill; it never gets glow (glow is reserved for
`success`-tier events downstream of the tap — a rank-up, a PR — not the tap itself, or a button
pressed 30×/session would read as noise, not reward). The rank/tier progress card at the top of the
active-workout screen (the first thing a user sees on entering a set) correctly stays on the tier
metal-color system per this rule, even where that visually diverges from the mockup — that's the
system working as designed, not a defect; no action needed.

### Finish Sequence & Ranks
Rank-up beat: tier medallion in its own metal gradient; surrounding chrome (background wash,
continue prompt) gets Nebula's glow for that beat's hold only, plus the badge ring (component §2).
Same-band recovery gain: LP bar still animates, no glow/ring layered on top. Plausibility-discounted
session: structurally cannot reach the glow/ring path (see `nebula-design-system.md` §4). Ranks
page's weekday rank-up strip: cells with a genuine rank-up get a small Nebula-tinted dot — this is
the one *persistent* (non-transient) Nebula usage in the app, justified because it marks a
historical fact, not ambient decoration. Resting Ranks-list badges show tier colors, not Nebula —
correct per design, not a gap.

### Plan (routines, mesocycles, exercise catalog)
Explicitly low-Nebula by design — a denser, form-like "planning desk," not a reward surface. Only
touchpoint: the wizard's final "Speichern"/"Routine erstellen" button.

### Profile, Data & Auth
Theme toggle lives here (Dunkel/Hell), styled like any other settings row, no special treatment.
Account-level overall-tier summary follows the same medallion+ring rule as Ranks (resting = no
ring, no glow).

**Known gap:** see `nebula-design-system.md` §6 — the theme toggle had a real bug (rank-ladder/
exercise-card surfaces not visually going light even though `--bg` resolves correctly). Check
current behavior before assuming it's fixed or still open.

### Runs
No Nebula touchpoint beyond the shared `.btn-primary` fill — Runs has no rank/XP/streak surface of
its own to carry the identity further.

---

## Cross-cutting rule

Across every screen: **exactly one `.btn-primary` carries Nebula's gradient at rest; every other
appearance is transient, tied to a specific `success`-tier event, and reverts to neutral once that
event's motion window ends.** If a future screen spec calls for a second always-on gradient surface
on the same screen, re-read `nebula-design-system.md` §1 before adding it.
