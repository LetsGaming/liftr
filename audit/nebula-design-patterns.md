# Nebula — Design Patterns

Reusable component patterns built from `nebula-design-framework.md`'s tokens. Each pattern names
the real component/file it touches, what changes, and what explicitly does not. Screen-level
composition of these patterns is `nebula-design-layout.md`'s job, not this document's.

---

## 1. HUD chrome — level-ring & streak chip

**Files:** `App.vue` (`.level-chip`, `.streak-chip`, `.top-hud`, `.side-nav`'s desktop equivalents).

**What changes:**
- `.level-chip`'s accent (currently implicit blue via `--tier-accent` fallback) becomes a small
  filled dot/ring using `--nebula-grad`, matching the mockups' `level-ring .dot` pattern —
  `Lv. N` text stays solid `--text`, only the small circular accent element carries the gradient.
- `.streak-chip`'s flame icon color becomes `--nebula-ink` at rest; the chip's border/glow lights
  up with `--nebula-glow` only during the existing `.streak-pulse` window (framework §5) — resting
  state is unchanged from today's flat treatment otherwise.
- `App.vue`'s existing `hideTopHud` logic (already suppresses the HUD during active-workout
  contexts to avoid the duplicate-XP-display bug `lens-3` §2.3 flagged) is untouched — Nebula is a
  paint change to a component whose *visibility* logic already got fixed in the engagement rework.

**What doesn't change:** layout, positioning, the mobile/desktop (`top-hud`/`side-nav`) split,
conditional visibility rules.

---

## 2. Rank medallion (hexagon badge)

**Files:** `tokens.css`'s `.badge`/`.t-<tier>` system, wherever it's consumed (rank cards, Ranks
page, Finish Sequence rank-up beat).

**What changes:** nothing about the badge itself — see `nebula-design-philosophy.md` §2. The
9-tier metal-gradient system stays exactly as built.

**What's new:** a **Nebula ring** — an optional 2-3px outer ring around the badge, rendered as a
`::before`-adjacent element (not replacing the existing bevel-rim `::before`, which is already
using that slot) using `--nebula-grad`, shown *only* during a rank-up's celebratory beat window
(same rule as framework §5), signaling "this specific badge just changed" independent of which
tier it changed to. Resting-state badges (browsing the Ranks list, no event just happened) never
show this ring — only the tier's own metal gradient.

Implementation note: since `.badge::before` is already occupied by the bevel rim, the Nebula ring
needs a genuinely new element (a wrapping `<span class="badge-ring">` around `.badge` in the Vue
template, not a third pseudo-element) — flagged here as a markup change, not just a CSS addition,
so it's scoped correctly in the plan.

---

## 3. Primary CTA

**Files:** `tokens.css`'s `.btn-primary`.

**What changes:** background becomes `var(--nebula-grad-cta)` (framework §4), ink token
`--nebula-ink-on-fill` replaces `--blue-ink`. Press/hover feedback rules (`transform: scale(0.97)`
on `:active`, `filter: brightness(1.08)` on hover) are unchanged — this is a fill/ink swap, not a
new interaction. `.btn-primary:disabled`'s flat `--surface-3`/`--faint` treatment is unchanged
(disabled state should never carry brand gradient — it's specifically the "this is NOT
interactable right now" signal, and Nebula's whole meaning is "this is interactive/earned").

**What doesn't change:** `.btn-secondary` — stays on the existing neutral `--surface-2` treatment.
Reserving Nebula for exactly one button tier (primary) keeps the "which button is *the* action"
signal legible; a secondary button wearing the brand gradient would flatten that hierarchy.

---

## 4. Progress bars (`.rankbar`)

**Files:** `tokens.css`'s `.rankbar`/`.rankbar > i`, `motion.css`'s `.bar-fill`.

**What changes:** the existing fallback-to-blue behavior (`linear-gradient(90deg, var(--b2,
var(--blue)), var(--b3, var(--blue-hi)))` when no `.t-<tier>` ancestor sets `--b2`/`--b3`) becomes
a fallback to `--nebula-grad` instead. Tier-context bars (inside a `.t-<tier>` ancestor) are
unaffected — they keep rendering that tier's own metal gradient, exactly as today.

**What doesn't change:** the `transform: scaleX()` animation contract (`motion.css`'s `.bar-fill`,
already correctly avoiding a layout-property animation) — untouched.

---

## 5. Reward panels (`.panel-reward`)

**Files:** `tokens.css`'s `.panel`/`.panel-reward`.

**What changes:** nothing to `.panel-reward`'s own fill logic (`--b1`/`--b2` tier fallback to
`--blue`/`--blue-ink`) — a reward panel's *background* is still the tier color, per
`nebula-design-philosophy.md` §2's table. What's new: a panel representing a genuinely *new* PR or
milestone (not tier-anchored — e.g. Phase 2's Personal Records ledger entries, `plan-c` §3 Phase 2)
gets a distinct modifier class, `.panel-reward.panel-reward--nebula`, whose fill falls back to
`--nebula-grad` when no `--b1`/`--b2` tier context exists — the same fallback pattern `.rankbar`
already uses, applied consistently.

---

## 6. Empty/loading/disabled states

**No Nebula treatment.** Explicit exclusion, stated because it's the kind of gap that's easy to
miss once a shiny new gradient exists: empty states, loading skeletons, and disabled controls stay
on the existing neutral `--surface`/`--faint` system. `lens-2` §7's rule (no locked/teaser fake-
achievement empty states) extends naturally here — an empty state wearing the "earned" gradient
would misrepresent the state as something achieved.

---

## 7. List rows & tables (dense surfaces)

**Files:** exercise lists, set-logging rows, routine lists.

No structural change from `plan-c`'s existing Phase 1/3 specs (density modes, `TruncatingLabel`
primitive). `liftr-liftoff-variations.html`'s L3 "Liftoff Compact" register (tight tabular rows,
small circular icons, single flat accent) was explored as a possible *visual* treatment for these
surfaces and is explicitly not adopted wholesale — Liftr's existing dense-list patterns already
satisfy the same functional goal (scan-ability, tabular numerals via `.tnum`) without a parallel
visual system to maintain. Where a list row needs a "just earned" accent (a PR flag on a set row,
per `plan-c` §3 Phase 2), it uses `--nebula-ink` as a small inline marker, not a row-level
background change — consistent with keeping earned-signal chrome small and specific rather than
loud and area-filling.
