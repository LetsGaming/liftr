# Share-Card Design Variations

Ten concrete design directions for Liftr's post-workout share card, written to give the product
owner something specific to react to on **`workplan-v1.md` open question 8** — "Share-card palette
vs. app palette … still open; a self-consistent but app-independent color set, product-identity
call, not a standards violation." This is exploration, not a spec, and nothing here is implemented.

Grounded in: `packages/client/src/lib/shareCard.ts` (the actual canvas routine — note it lives in
`lib/`, not `services/`), `packages/shared/src/share/layout.ts` (`WorkoutCardModel`, the data the
card is allowed to show), `packages/client/src/styles/tokens.css` (the shipped Nebula tokens and the
9-tier `.badge` system), and the five Nebula documents (`nebula-design-philosophy.md`,
`-framework.md`, `-patterns.md`, `-layout.md`, `-plan.md`). Where a variation names a color, it
either cites a real token or is flagged as a deliberate new value.

## What the card draws today (the fixed content contract)

Every variation below has to place the same nine things, so they are named once here and referenced
by name afterwards:

1. **Background** — diagonal `linear-gradient(#0a0c14 → #212a42)` across the full card, plus a
   radial blue glow (`rgba(59,140,255,0.22)` → transparent) centered at 82% width / 8% height.
2. **Wordmark** — `LIFTR`, Unbounded 800 / 30px, `--blue-hi` (#5ba0ff), top-left at the 64px pad.
3. **Header** — routine name, Unbounded 800 / 60px `--text`, wrapped to at most 2 lines; below it
   `dateLabel` in Hanken Grotesk 600 / 24px `--dim`.
4. **Four stat cards** — 176px tall, each a *solid* accent-filled rounded card (r=22) holding a dark
   label pill (`rgba(6,8,14,0.32)`, 11px/800 uppercase) and a `--bg`-filled inset box with the value
   in Unbounded 800, auto-shrinking 32 → 19px. Order and accents today:
   Dauer / `--violet`, Volumen / `--blue-hi`, Sätze / `--fire-hi`, PRs / `--pr`.
5. **Tier medallion** — a 168px layered hex medal, a canvas port of `.badge`: tier-hued radial halo
   at `b3` ~30% alpha, extrusion plate in `b1`, bevel rim at −25°, per-tier `--face-grad` face at
   155°, two hard 35° white specular streaks, tier glyph filled in `--tt`.
6. **Tier caption** — `«Tier» «Division»` in Unbounded 800 / 26px `--text`, then `Level N` in
   600 / 20px `--dim`. (There is no LP number in `WorkoutCardModel` today — only `level`. Any
   variation that wants a literal LP figure needs a new model field; flagged per variation.)
7. **Rank-up caption** (optional) — `model.topRankUp`, one line, `--fire-hi`, 700 / 19px, reading
   either `«Übung»: neuer Rekord` or `«Übung»: «Tier» «Division»`.
8. **Muscle block** — `TRAINIERTE MUSKELN` eyebrow (800 / 20px `--dim`, centered) over the front and
   back anatomical silhouettes at 300px, primary muscles brighter than secondary.
9. **Exercise grid** — two columns of 118px bordered cells on `--surface-2` with a `--line` hairline,
   a generic dumbbell glyph in a `--surface-3` rounded square, exercise name 700 / 21px, up to two
   detail lines 600 / 17px `--dim`; plus a `+N weitere Übungen` overflow footer.

Two structural facts constrain every variation: the card is drawn on a 2× canvas with hardcoded
colors (no CSS-var resolution), and `WorkoutCardModel` carries no plausibility/discount flag at all
today — so the honesty case (variation 9) is the only one that requires a shared-package change.

---

## 1. Nebula Halo

**Idea.** The zero-risk read: keep today's structure exactly, and swap only the two places the card
currently says "blue" for Nebula's brand gradient. The card stops looking like it was designed
before the design system existed, without a single new drawing routine.

**Color.** Background stays `--bg` → `--surface-2`. The top-right radial glow becomes a two-lobe
Nebula wash: `rgba(47,159,224,0.20)` (`--nebula-1`) at 82%/8% and a second, smaller
`rgba(214,58,255,0.16)` (`--nebula-2`) at 18%/4%, both to transparent. Wordmark is painted with a
120° linear gradient across its own text box using `--nebula-1 → --nebula-m (#8a6dff) → --nebula-2`,
matching `--nebula-grad` exactly. Stat accents shift to `--nebula-m`, `--nebula-1`, `--fire-hi`,
`--pr` — Volumen loses `--blue-hi` and picks up glacier blue, Dauer moves from `--violet` to the
near-identical `--nebula-m`.

**Content rendering.** Header, stat cards, muscle block, divider, and exercise grid are untouched
geometry. Only the wordmark fill, the two background lobes, and two of four stat accents change.

**Tier badge.** Completely untouched — full layered metal medal, tier halo, tier glyph, caption in
`--text`/`--dim`. Nebula appears nowhere near it, which is exactly `nebula-design-philosophy.md` §2's
division of labor: the gradient answers "is this Liftr / was this earned," the medal answers "which
of nine tiers."

**Why it appeals.** Closest to zero-risk brand consistency — the smallest diff that makes the card
legibly part of the same product as the app.

---

## 2. Medal Poster

**Idea.** Reorders the card around the thing the design review already called "the most premium
element": the medallion moves to the top as a hero, and everything else becomes supporting caption.
The card reads as a trophy photograph rather than a receipt.

**Color.** Background is a tier-derived vertical wash — `b1` of the earned tier at the top fading to
`--bg` by 45% height (e.g. Apex `#152449 → #0a0c14`, Lifter `#0f2e1f → #0a0c14`), so the whole image
takes on the tier's color temperature. Stat cards drop their four different accents entirely and
become one uniform `--surface-2` fill with a `b3`-tinted 1px rim and the value in `--text`; color
budget is spent on the medal, not the numbers.

**Content rendering.** Wordmark stays top-left in `--nebula-m` as a small, quiet mark. Medallion
renders at ~260px (up from 168) directly under it, centered, with the tier caption in Unbounded 800
at 34px and `Level N` beneath. The routine name and `dateLabel` drop *below* the medal at 40px
instead of 60px. Stat row, muscle block, and exercise grid follow in the existing order at existing
sizes. The `topRankUp` caption sits immediately under the tier caption as the emotional payload.

**Tier badge.** The tier is the whole composition: the background wash, the rim on all four stat
cards, and the medal itself all derive from that tier's `b1`/`b3`. An Initiate card is a near-
monochrome graphite poster; an Advanced card is warm gold; an Apex card is deep navy-blue. Same
layout, nine visibly different images.

**Why it appeals.** Boldest and most trophy-like — the version most likely to make someone screenshot
a rank-up specifically. Also the most implementation-expensive: real layout reordering, not a
palette swap.

---

## 3. Glacier Light

**Idea.** A light-mode-native card. Nebula's framework §2 built a real light palette for the app but
the share card has never had one; on a bright Instagram feed or a WhatsApp chat in day mode, a
near-black 1080px image is the odd one out. This is the same card on paper instead of glass.

**Color.** Background `--bg` light (`#f6f4fb`) with a very soft `rgba(47,159,224,0.10)` lobe top-
right. Text `#14121c` (`--text` light), secondary `#635f78` (`--dim` light). Card surfaces
`#ffffff` with a `rgba(20,16,32,0.10)` (`--line` light) hairline. Stat card fills keep their accent
hues but as *tints*, not saturated fills: `--nebula-m` at 14% over white, `--nebula-1` at 14%,
`--fire-hi` at 16%, `--pr` at 20%, with the value drawn in solid `--text` on white instead of on a
dark inset. Wordmark in solid `--nebula-ink` (#6b3fd6) — framework §1.3's hard rule, no gradient-clip
text on a light ground.

**Content rendering.** Every element keeps its position and size. The stat card's dark inset box
inverts to a plain white inset with a hairline. The exercise cells become white-on-lilac with the
dumbbell glyph in `--dim` light. The muscle silhouettes need light-mode fills (`.mm-body`/`.mm-mus`
at ~`#d9d5e6`/`#b9b2cf`, primaries in `--nebula-1`) — the one asset-level dependency here.

**Tier badge.** The medal is unchanged material-wise — the tier system's identity "should not shift
with theme, only its background does" (framework §2.1). The one adjustment: the `b3` radial halo
drops from 30% to ~18% alpha, since a saturated halo that reads as a glow on black reads as a smudge
on lilac.

**Why it appeals.** Best light-mode-native option, and the only one that looks deliberate rather than
dark-mode-leaked when someone posts it to a white-background story.

---

## 4. Rationed Ink

**Idea.** The most restrained variation: almost no color at all, with the entire chromatic budget
spent on exactly two things — the medal and one accent number. It's the share-card expression of
`nebula-design-layout.md` §7's "exactly one gradient surface per screen" rule.

**Color.** Flat `--bg` (#0a0c14) background, no gradient, no glow lobe. All four stat cards become
`--surface` (#161c2d) with a `--line` hairline and values in `--text`; only the stat that actually
*earned* something gets color — PRs fills solid `--pr` when `prCount > 0`, otherwise it stays
neutral like the rest. Wordmark in solid `--nebula-ink`. Divider and exercise cell borders in
`--line` as today.

**Content rendering.** Identical geometry to today, drastically reduced saturation. Header white on
black, date in `--dim`. Exercise cells lose their `--surface-2` fill and become border-only on the
flat background, which visually quiets the bottom half of the card. The `topRankUp` caption moves
from `--fire-hi` to `--pr`, so the card has exactly one accent hue plus the medal's.

**Tier badge.** Because everything around it is neutral, the medal is the only saturated object in
the frame and needs no help: the halo drops to ~20% alpha and the badge size stays 168px, yet it
wins the first glance more decisively than the current 168px-plus-halo version does against four
colored stat cards.

**Why it appeals.** The most "expensive-looking" and least gamified — this is the version a serious
lifter would not be embarrassed to post. It also directly answers the critique that first triggered
the badge upsizing (the blue Volumen card out-competing the medal) by removing the competition
instead of enlarging the medal.

---

## 5. Story Native

**Idea.** Designed for the vertical 9:16 story format first and the square second — big type, huge
safe margins, content pruned to what survives a thumb-scroll at 30% scale. Accepts that the share
image lives on Instagram, not in the app, and optimizes for that context specifically.

**Color.** Full-bleed `--nebula-grad` at 160° as the actual card background
(`--nebula-1 → --nebula-m → --nebula-2`), with a `rgba(10,12,20,0.62)` scrim over the lower 65% so
content stays legible. This is the one variation that deliberately breaks framework §1.2's positive
list — the gradient becomes an area fill — justified because outside the app there is no chrome for
it to compete with, and no "which button is the action" hierarchy to flatten.

**Content rendering.** Wordmark centered at top in `--nebula-ink-on-fill` (#1a0f2e) on the exposed
gradient band — dark ink on bright fill, the same inversion `.btn-primary` uses. Routine name at
72px, one line, hard-truncated. Only **two** stat cards survive, at double width: Volumen and Sätze,
as glass panels (`rgba(255,255,255,0.10)` fill, `rgba(255,255,255,0.22)` hairline) rather than solid
accent cards. Dauer and PRs demote to a single small line of `--dim` text. The exercise grid caps at
four cells with `+N weitere Übungen` doing more work than today. Muscle silhouettes stay — they are
the most visually distinctive asset the card has and read fine at thumbnail scale.

**Tier badge.** Medal at 200px, bottom-center, over the darkest part of the scrim so its metal
gradients still read. Its radial halo is dropped entirely (a colored halo over a magenta gradient is
mud); the scrim itself provides the separation. Tier caption underneath in white, `Level N` omitted
for space.

**Why it appeals.** Most Instagram-native — the only variation designed around how the image is
actually consumed rather than around what the app looks like.

---

## 6. Tier Duotone

**Idea.** One card, nine genuinely different-looking images, achieved purely through color
constants: every neutral surface on the card is tinted toward the earned tier's own hue, so the
image is unmistakably "an Elite card" or "a Lifter card" at a glance, from across a room.

**Color.** Take the tier's `b1` and mix it into each neutral: background becomes `b1` at 55% over
`--bg`; `--surface-2` cells become `b1` at 35% over `--surface-2`; the hairline becomes `b3` at 18%
alpha instead of white at 14%. The background's radial lobe uses `b3` at 18% instead of blue. Stat
accents collapse to a two-color scheme derived from the tier: `b3` for Volumen and PRs, `b2` for
Dauer and Sätze, with the existing dark inset boxes retained for value legibility.

**Content rendering.** Geometry is untouched — this is a pure constant swap in `COLORS`, `STAT_COLORS`
and the two background gradients, parameterized by `model.tier.tier`. The wordmark becomes `--text`
rather than blue so it stays constant across all nine variants (the one element that must not shift,
or brand recognition suffers). The `topRankUp` caption uses `tt`, the tier's own light tint, instead
of `--fire-hi`.

**Tier badge.** Unchanged in construction, but now sits in a matched environment rather than a blue
one — the halo can drop to 20% because the whole card is already doing the tinting work. The risk to
watch: Initiate (`#1a1a1a`/`#9a9a9a`) produces a fully greyscale card, which may read as "broken" to
a new user rather than as "early tier." Worth pairing with a floor that keeps a trace of Nebula in
the wordmark and PR accent regardless of tier.

**Why it appeals.** Highest collectability — nine visually distinct cards give a user a reason to
re-share as they climb, and it costs only color constants.

---

## 7. Blueprint

**Idea.** A deliberate departure: technical, gridded, engineering-drawing language. Thin rules,
monospaced-feeling tabular numbers, no fills at all — the workout as a specification sheet. Nebula
appears only as the accent line color, never as an area.

**Color.** Background is a flat near-black `#080a10` with a faint drawn grid: 48px lines at
`rgba(255,255,255,0.035)` and heavier 192px lines at `rgba(255,255,255,0.06)`. Every card, stat, and
cell is border-only — 1.5px strokes in `--nebula-1` for structural rules and `rgba(255,255,255,0.16)`
for secondary ones. Values in `--text`, labels in `--dim`, corner ticks and dimension marks in
`--nebula-m`.

**Content rendering.** Wordmark top-left in Unbounded with letterspacing, plus a small
`SESSION / «dateLabel»` slug in `--dim` on the same baseline. The routine name reads as a drawing
title in the top-left title block. Stat cards become four bordered boxes with the label in the top-
left corner (not a centered pill) and the value bottom-right, right-aligned, tabular — a spec-sheet
convention rather than a dashboard one. Exercise cells lose their fill and dumbbell glyph entirely
and become numbered rows (`01`, `02`, …) with the detail string set in the same tabular treatment.
Muscle silhouettes render as outline-only (stroke, no fill) with primaries in `--nebula-1`.

**Tier badge.** The most radical badge treatment here: the medal renders at 168px as today, but with
a thin `--nebula-grad` hairline hexagon drawn concentrically around it at +14% inset — the canvas
analogue of `nebula-design-patterns.md` §2's Nebula ring. Tier color is carried entirely by the
medal's own face; nothing else on the card shifts by tier, which keeps all nine cards
system-consistent at the cost of the collectability variation 6 buys.

**Why it appeals.** Most distinctive and least like every other fitness app's share image — the one
that would get asked "what app is that?"

---

## 8. Receipt

**Idea.** The card as a printed till receipt / gym logbook page: a narrow, tall, off-white paper
column with the workout itemized. Minimal chrome, maximal honesty, deliberately unglamorous — which
is itself a strong personality in a category full of neon gradients.

**Color.** Paper `#f4f1ea` (a warm off-white, deliberately *not* `--bg` light's cool `#f6f4fb` — this
variation departs from Nebula's light palette on purpose), ink `#1a1720`, secondary ink `#6a6478`,
rules as 1px dashed `rgba(26,23,32,0.25)`. The single color accent in the whole image is
`--nebula-ink` (#6b3fd6) for the wordmark and for the PR line, plus the medal.

**Content rendering.** Requires the most new drawing logic of any variation. Header centers the
wordmark and the date as a receipt header. Stats stop being cards entirely and become four
right-aligned label/value rows separated by dashed rules (`DAUER ......... 58:12`). Exercises become
itemized line entries, one per row, single column, with the set detail indented beneath in the
secondary ink — closer to `renderExerciseLines`' original single-column form than today's 2-column
grid. `TRAINIERTE MUSKELN` and the silhouettes render small, side by side, as a footer illustration.
A `+N weitere Übungen` line reads naturally here as a continuation marker.

**Tier badge.** The medal is rendered *small* (~96px) and top-right, like a stamp on a receipt, with
its halo removed and a subtle `rgba(0,0,0,0.18)` drop shadow instead — the material read survives on
paper, the glow does not. The tier caption sets beside it, right-aligned, in small caps. Deliberately
demotes the medal, which is the point: this variation says the *work* is the content, and the rank is
an annotation.

**Why it appeals.** The strongest anti-gamification statement, and the most differentiated from
Liftoff-style references. Also the most implementation-expensive after variation 2.

---

## 9. Honest Card (plausibility-aware)

**Idea.** The only variation that treats the discounted-session case as a first-class visual state
rather than an omission. `nebula-design-philosophy.md` §3 and `-framework.md` §5 make it a hard rule
that a plausibility-discounted session never receives the earned treatment — but that rule currently
stops at the app boundary. A shared image is exactly where a discounted session is most likely to be
mistaken for a genuine one, because the viewer has none of the in-app context. This variation extends
the rule across that boundary.

**Color.** The genuine state is Variation 1's Nebula Halo, unchanged. The discounted state is a
parallel palette: the background's Nebula lobes are removed entirely; every stat accent desaturates
to `--surface-3` (#2f3a5c) with values still in `--text`; the wordmark drops from gradient to solid
`--dim` (#98a2c0). Nothing is hidden, nothing is red or scolding — the numbers are all still there and
still accurate. The card simply has no earned-color layer.

**Content rendering.** Same geometry as Variation 1 in both states. The differences are: (a) the two
background lobes present vs. absent, (b) saturated vs. desaturated stat cards, (c) the `topRankUp`
caption is **not drawn at all** in the discounted state — a discounted session by definition did not
produce a celebration-grade rank-up, so printing one would be the exact lie the rule exists to
prevent, (d) a small `--dim` eyebrow above the tier caption reading `WERTUNG REDUZIERT`, using the
existing `.eyebrow` treatment (11px/800, 0.12em tracking) so the state is stated rather than merely
implied by dullness.

**Tier badge.** The medal still renders — the user's overall tier is a true fact and hiding it would
be its own dishonesty. What is removed is the tier-hued radial halo and the two white specular
streaks: the medal renders matte, as face gradient plus rim plus plate only. A discounted card and a
genuine card of the same tier are then distinguishable at thumbnail scale by whether the medal
glints, which is a pre-attentive difference, not a fine-print one.

**Implementation note.** This is the only variation that needs a data change: `WorkoutCardModel` has
no plausibility field, so a `plausibilityDiscounted: boolean` (or the multiplier itself, which
`packages/shared/src/rank/plausibility.ts` already computes per workout) would have to be threaded
into the model in `packages/shared/src/share/layout.ts` and populated at the `WorkoutPage.vue` call
site.

**Why it appeals.** It is the only variation that closes a real correctness gap rather than a taste
gap, and it makes a recently-fixed bug class structurally unable to reappear in the share surface.
Worth noting it composes with any of the other nine — it is a *state* treatment, not a competing look.

---

## 10. Split Field

**Idea.** Divides the card into two visually distinct zones with a hard horizontal seam: an
identity/reward zone on top (Nebula gradient ground, medal, headline) and a data zone below (flat
dark, all the numbers). Resolves the tension every other variation negotiates — "brand gradient vs.
readable data" — by not mixing them in the same space at all.

**Color.** Top zone (roughly the first 42% of the card height): `--nebula-grad` at 120°, exactly the
token value, no scrim. Bottom zone: flat `--bg` (#0a0c14). The seam is a 3px `--nebula-2` rule. All
top-zone text is `--nebula-ink-on-fill` (#1a0f2e) — dark ink on bright fill, the contrast-safe
inversion `.btn-primary` already established. All bottom-zone text is `--text`/`--dim` as today.
Stat cards live in the bottom zone and keep their existing four accents, which now read as data
coding rather than as brand color because they are spatially separated from the brand gradient.

**Content rendering.** Top zone holds the wordmark (dark ink, top-left), the routine name at 60px in
dark ink, the `dateLabel`, the medal, the tier caption and the `topRankUp` line — everything
identity-related. Bottom zone holds the four stat cards, the muscle block, the divider, and the
exercise grid — everything measured. No divider is needed between stats and muscles anymore; the
seam does the structural work.

**Tier badge.** The medal sits half-overlapping the seam, centered, so its lower third crosses onto
the dark ground — a classic magazine device that makes the badge feel physically placed on the card
rather than drawn into it. Its radial halo is removed on the gradient half (it would be invisible)
and retained at ~25% on the dark half, which is where the eye needs the separation anyway. Tier
coloring stays entirely within the medal; the bands never shift by tier, so all nine cards share the
identical frame.

**Why it appeals.** The best structural argument for Nebula on a share surface: it uses the gradient
generously without ever putting it behind a number, so brand expression and data legibility stop
competing. Middling implementation cost — new background geometry, but no content reordering.

---

## Cross-cutting observations

**Implementation cost, cheapest first.** Variations **1, 4, 6, and 9** are essentially color-constant
changes: they touch `COLORS`, `STAT_COLORS`, the two background gradient definitions, and (for 6) a
small tier-parameterized tint helper. Variation 9 additionally needs one boolean threaded through
`WorkoutCardModel`, but no new drawing routine. Variation **10** needs new background geometry and a
seam, plus repositioning existing draws — moderate. Variations **3, 5, and 7** need new
per-element treatments (light-mode surface inversions and muscle-SVG light fills; a scrim plus a
reduced content set; a grid renderer plus border-only cells) — real work but bounded. Variations
**2 and 8** require genuine layout reordering and, in 8's case, abandoning the 2-column exercise grid
for a single itemized column — these are rewrites of `drawWorkoutCard`'s layout math, not palette
work, and would want their own fill-gap distribution logic since `distributeFillGap`'s slot
assumptions encode today's section order.

**They are not all mutually exclusive.** Variation 9 is a *state* layered onto any base look, and
variation 3 is a *theme* of any of them. A plausible shipping combination is one base direction (say
1, 4, or 10) plus 9's discounted state plus 3's light rendering, chosen by the user's own theme
setting — which would make the share card the first surface in the app to honor `themeStore` outside
the DOM.

**One system-level tension worth deciding explicitly.** Variations 2 and 6 make the *whole card* shift
color by tier; variations 1, 7, and 10 keep the card constant and let only the medal carry tier. That
is the real fork in this exploration, and it maps onto a product question rather than a design one:
is the share card a *collectible that should look different every rank* (6/2) or a *consistent brand
frame the medal sits inside* (1/7/10)? `nebula-design-philosophy.md` §2's division of labor argues
for the latter; collectability argues for the former.

**A note on the hardcoded palette.** Whatever is chosen, `shareCard.ts`'s header comment already
documents the drift risk that comes with hardcoded copies of `tokens.css` values — this file has
silently fallen behind the token file twice. If a variation is adopted, it is worth pairing it with a
small build-time or test-time assertion that the hardcoded `COLORS`/`TIER_COLORS` still match
`tokens.css`, since the next drift will otherwise be found the same way the last two were: by looking
at a rendered card and noticing it looks wrong.
