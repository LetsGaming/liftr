# Nebula — Design Philosophy

The "why" behind a complete UI/UX rework of Liftr, grounded in the direction chosen through
`examples/liftr/liftr-directions.html` → `liftr-pulse-variations.html` → `liftr-liftoff-variations.html`
(L4, Pulse × Liftoff) → `liftr-pulse-liftoff-variations.html` → `liftr-pulse-liftoff-colorways.html`
→ `liftr-pulse-liftoff-finalists.html` (Nebula: Glacier × Berry, blue → violet → magenta). This
document resolves Open Question 1 in `audit/plan-c-new-ui-rebuild.md` §6 — "how ambitious should
the visual reinvention be" — in favor of a distinctive identity, and states how that identity
coexists with the restraint principles `plan-c` already established from `lens-1`/`lens-2` evidence.
Read alongside `nebula-design-framework.md` (tokens), `nebula-design-patterns.md` (components),
`nebula-design-layout.md` (screens), and `nebula-design-plan.md` (phasing).

---

## 1. What Nebula actually is

Nebula is not a new palette bolted onto the app. It's the answer to a question the mockup rounds
kept testing from different angles: **what does "earned" look like, and what does everything else
look like?**

Every round converged on the same shape of answer:
- A single, continuous three-stop gradient (blue → violet → magenta) means *one specific thing*:
  this is interactive, or this was earned. It never decorates plain content.
- A hexagon medallion — not a circle, not a card — is the one shape reserved for rank/tier
  identity, echoing Liftoff's medal language without copying its gating mechanics.
- Glow (colored shadow, gradient-clipped text) is rationed the same way: `liftr-pulse-liftoff-colorways.html`'s
  G1/G2 pair proved the gradient alone still reads as "earned" with the glow removed entirely —
  glow is an amplifier, not the thing doing the work. Default to off; turn it on only where
  `motion.css`'s own `--dur-cele` comment already draws the line ("reserve this... for things the
  user actually earned; using them for routine UI would cheapen the moments that are supposed to
  feel different").
- Light mode isn't a filter over the dark palette — `liftr-pulse-liftoff-finalists.html` found that
  a gradient-clipped text label and a colored glow shadow both read as muddy on white. Light mode
  keeps the gradient on filled, decorative surfaces (badge, CTA, progress fill) and moves text
  accents to a solid ink color instead.

## 2. Nebula is a second layer, not a replacement

`tokens.css` already ships a mature, evidence-based 9-tier hex-medallion badge system
(`.badge`, `.t-initiate` … `.t-apex`) with per-tier metal-material gradients (bronze/silver/gold/
iridescent), built specifically because *tier is information* — nine states need nine
distinguishable colors, and a fixed 3-stop brand gradient structurally cannot encode nine states
without lying about which tier something is.

Nebula does not touch that system. It answers a different question: not "which of nine tiers is
this," but "is this thing interactive, or was it just earned, right now, independent of tier."
Concretely:

| Question the color answers | System | Where it lives |
|---|---|---|
| "Which of the 9 tiers is this?" | The existing `--initiate-*` … `--apex-*` metal-gradient badge system | Per-exercise rank medallions, `.panel-reward` fills, `.rankbar` fills |
| "Is this interactive / was this just earned?" | Nebula (`--nebula-1/2/3`) | Primary CTA buttons, the HUD level-ring dot, streak chip accents, progress-fill on non-tiered bars, focus/active chrome |

This is the single most load-bearing decision in this rework: **Nebula is the app's brand-identity
gradient — chrome, CTAs, XP/streak, focus states. The 9-tier badge system is untouched.** A rank-up
event can therefore layer both: the tier medallion itself renders in its own metal gradient
(bronze, silver, whatever tier was actually earned), while the surrounding "you ranked up" chrome —
the CTA to continue, the beat's ambient glow — uses Nebula. They read as related (both are "hex
medallion, gradient identity, glow-on-earned") without collapsing into one indistinguishable color.

## 3. What carries over from Plan C unchanged

`plan-c-new-ui-rebuild.md` §2's restraint principles are not undone by choosing a bolder palette —
they constrain *how* Nebula is allowed to show up, not *whether* it does:

- **Utility-first over gamified-forward** (Plan C §2, citing `lens-1` §2B: Liftoff itself uses
  fast, undecorated micro-motion with no confetti anywhere in 73 filmstrips). Nebula's gradient is
  a *color* decision, not a *motion* one — it does not license louder animation. The three-tier
  haptic vocabulary (`tap`/`bump`/`success`) and `--dur-fast/base/slow/cele` stay exactly as
  specified; Nebula rides on top of `--dur-cele` for earned moments, it doesn't add a fourth tier.
- **Single-column, thumb-zone-anchored mobile layout** (Plan C §2, `ThumbZoneAction` primitive) —
  unchanged. HUD chrome (level-ring, streak chip) stays a persistent top strip, not a layout
  restructure; `liftr-pulse-liftoff-variations.html`'s P3 "Hero Rank" and P4 "Rail" layout
  experiments are documented as considered and explicitly **not** adopted (see §5 below) precisely
  because they'd fight this principle.
- **Honest numbers, no fake gating** (`lens-1` §3C items 5/6/8/10, reaffirmed in every mockup
  round's footer note: "no masked '???' targets, no currency, no gating"). Nebula's hexagon
  medallion always shows the real next-rank number. The masked-target/placement-gate mechanic that
  gives Liftoff's medallion its retention function was deliberately never adopted, in every round.
- **44×44px touch targets, desaturated dark-mode elevation via lightness not shadow** (Plan C §2,
  Phase 0) — unchanged; Nebula adds a gradient *option* for earned surfaces, it does not replace
  the existing `--surface`/`--surface-2`/`--surface-3` elevation ramp for everything else.
- **Trust as a visual language** (Plan C §2, `lens-2` §4 rule 5 / §8.2: plausibility-discounted
  sessions get muted, non-celebratory treatment). This is now a hard rule inside the glow system
  specifically: a discounted session must never receive Nebula's earned-glow treatment, full stop
  — see `nebula-design-framework.md` §5.

## 4. The one open question this resolves, and how

Plan C §6 Q1 asked whether the visual reinvention should be "quiet utility-first" or "more visually
distinctive," and declined to choose, calling it "a genuine product-taste decision this plan cannot
resolve alone." Six mockup rounds and an explicit finalist pick later, the decision is made:
**distinctive, via a single rationed brand gradient layered over an otherwise quiet system** — not
a wholesale rejection of restraint, but restraint applied to *when Nebula appears* rather than to
*whether color exists at all*. The rest of Plan C §2's quiet-utility direction (motion, density,
layout, honesty) stands as written.

## 5. What was explored and deliberately not carried forward

Documented here so the reasoning isn't lost, and so a future pass doesn't re-litigate it from
scratch:

- **P3 "Hero Rank" / P4 "Rail" layouts** (`liftr-pulse-liftoff-variations.html`) — reordering the
  screen around the rank medallion, or splitting into a persistent sidebar rail — were explored and
  not chosen. Both increase the rank medallion's visual weight relative to the actual logging
  content, which cuts against the "sacred loop" principle (`lens-2` §2.6: set-logging is the ~30×-
  per-session action; everything else is secondary chrome around it). The vertical card-stack
  layout from the baseline mixture is what `nebula-design-layout.md` specifies.
- **P5 "Liquid Hex"** (fill-level rendered inside the badge itself, replacing the separate progress
  bar) — visually appealing but redundant with the existing `.rankbar`/`.bar-fill` system, which
  already has a correct `transform: scaleX()` animation contract (`motion.css`) that a liquid-fill
  badge would have to reinvent. Not adopted; the separate progress bar stays.
- **Liftoff Metal / Liftoff Compact's masked-target and dense-table registers**
  (`liftr-liftoff-variations.html` L2/L3) — the metal-medallion *material* language is already
  native to `tokens.css`'s `.badge` system (see §2); the masked "???" target and placement-gate
  mechanics specifically were never adopted, consistent with `lens-1`'s comparison table.
- **Forged and Ledger directions** (`liftr-directions.html`, Directions A/B) — the two directions
  not carried into any later round. Not evaluated further here; if either is worth revisiting, that
  is a fresh brainstorm, not a Nebula variant.
