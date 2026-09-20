# Nebula — Design System (Ground Truth)

**Status: normative.** This document is the authoritative spec for Liftr's visual identity. It
does not describe a proposal under discussion — it states what must be true of the shipped app,
and any new screen, component, or PR that touches color/chrome/CTA/reward surfaces must conform to
it. If code and this document disagree, the code is a bug (open one), not evidence the document is
outdated — the reverse (updating this document to match a bug) is the drift future work must not
repeat.

**Point-in-time note:** this document — and its companions `nebula-design-plan.md` and
`nebula-design-components.md` — describe the design system as last verified against the shipped
app (2026-09-04/05). Treat it as a design reference, not a live-updated spec; if the app has since
drifted from what's written here, that's the code's own bug to fix, per the normative framing
above, not silent evidence this document should be updated to match.

Supersedes and consolidates: `nebula-design-philosophy.md`, `nebula-design-framework.md`,
`nebula-design-layout.md`, `nebula-design-patterns.md` (deleted — their content lives here and in
the companion `nebula-design-components.md`). Read this document first for the *why* and the
tokens; read `nebula-design-components.md` for how each component/screen applies it; read
`nebula-design-plan.md` for phased rollout status.

**Provenance:** the direction was chosen through a mockup sequence in `examples/liftr/`:
`liftr-directions.html` (three directions — Pulse chosen) → `liftr-liftoff-variations.html`
(Pulse × Liftoff chosen) → `liftr-pulse-liftoff-variations.html` → `liftr-pulse-liftoff-colorways.html`
→ `liftr-pulse-liftoff-finalists.html` (Nebula: Glacier × Berry, blue → violet → magenta, chosen).

---

## 1. What Nebula is, and is not

Nebula answers exactly one question: **is this thing interactive right now, or was it just
earned?** It is not a palette, not a re-skin, and not a replacement for the app's existing 9-tier
badge system.

- **One gradient, everywhere it appears the same way.** `--nebula-1 → --nebula-m → --nebula-2`
  (blue → violet → magenta). No situational second brand gradient — a distinct "streak color"
  separate from "rank-up color" was considered and rejected; it would recreate the inconsistent
  active-state color semantics elsewhere in the app that this system is meant to avoid.
- **A hexagon is the one shape reserved for rank/tier identity** — not a circle, not a plain card.
  Implemented as `.badge`'s `clip-path` in `tokens.css`; no second shape token.
- **Glow is rationed, not ambient.** It activates only on a state transition the user just caused,
  for the duration of that transition's existing motion primitive, then it is gone. A resting HUD
  chip, a resting badge on the Ranks list, a routine card — none of these get glow, ever, regardless
  of tier or streak length. See §4.
- **Nebula is a second layer over the tier system, not a replacement for it.** `tokens.css` has a
  mature, evidence-based 9-tier metal-gradient badge system (`.t-initiate` … `.t-apex` —
  bronze/silver/gold/iridescent-equivalent per tier). That system answers *which* of nine tiers
  something is; Nebula answers whether something is *interactive or just-earned*, independent of
  tier. **The 9-tier badge system's own colors are explicitly out of scope for Nebula and must stay
  untouched** — this is a rejected idea, not a deferred one. A rank-up event legitimately layers
  both: the tier medallion renders in its own metal gradient (whichever tier was actually earned),
  while the surrounding "you ranked up" chrome (the ring around the badge, the beat's background
  wash, the continue CTA) uses Nebula, via `FinishSequence.vue`'s `.badge-ring`/`.badge-ring-muted`
  split, structurally scoped to the rank-up beat only, never the resting Ranks list. The resting
  `/ranks` tier bars stay bronze/silver, not violet-magenta — that is this rule working as designed,
  not a defect. Do not "fix" this by adding Nebula to resting tier badges.

| Question the color answers | System | Where it lives |
|---|---|---|
| "Which of the 9 tiers is this?" | The existing per-tier metal-gradient badge system | Rank medallions at rest, `.panel-reward` tier fills, tier-context `.rankbar` fills |
| "Is this interactive / was this just earned, right now?" | Nebula (`--nebula-1/m/2`) | Primary CTA buttons, the HUD level-ring dot, a streak *extending* (not resting), non-tiered progress fills, the rank-up ring/glow during its beat only |

---

## 2. Color tokens

Shipped in `packages/client/src/styles/tokens.css` — do not rename or restructure these; this
section documents the contract, it doesn't propose new values.

```css
:root {
  --nebula-1: #2f9fe0;   /* Glacier blue */
  --nebula-m: #8a6dff;   /* bridge violet */
  --nebula-2: #d63aff;   /* Berry magenta */
  --nebula-grad: linear-gradient(120deg, var(--nebula-1), var(--nebula-m), var(--nebula-2));
  --nebula-grad-cta: linear-gradient(135deg, var(--nebula-1), var(--nebula-m), var(--nebula-2));
  --nebula-ink: #6b3fd6;
  --nebula-ink-on-fill: #1a0f2e;
  --nebula-glow: rgba(124, 92, 255, 0.4);
  --nebula-glow-strong: rgba(214, 58, 255, 0.55);
}
```

Note: the shipped middle stop (`--nebula-m: #8a6dff`) drifted slightly from the finalist mockup's
`#7c5cff` during implementation. This is cosmetically negligible (both read as "bridge violet") and
is ratified as correct — do not "fix" it back to match the mockup file byte-for-byte; the mockup is
a reference for direction, not a pixel contract.

### Where Nebula is allowed to appear (positive list — if a surface isn't listed, it does not get the gradient)

This positive list governs exactly one thing — the concentrated `--nebula-grad`/`--nebula-grad-cta`
FILL (a CTA button's own background, the rank-up ring, a just-earned PR row). It does not govern the
whole app's visual identity. Two other, separate mechanisms are pervasive by design (every screen,
not gated by this list) and are documented in §3/§4 below, not here:
- the cosmic **background sweep** every screen sits on (`body::before`, `--nebula-sweep-*` tokens) —
  a low-opacity wash *derived from* Nebula's hues, not the CTA gradient itself, and
- the **surface-hybrid** hairline edge (`--surface-hybrid-edge-grad`) on every card/panel/nav/header
  — also a low-opacity gradient echo, not the CTA fill.
The pervasive background does not license applying the concentrated CTA gradient more widely — the
rationing below is unchanged and still real.

- `.btn-primary` background (the single primary CTA per screen — see `nebula-design-components.md` §3)
- The HUD `.level-chip`'s ring/dot accent
- The `.streak-chip`'s glow **during** an extension event only (`.streak-pulse`, `--dur-cele`), not
  at rest
- Non-tiered `.rankbar`/`.bar-fill` fallback (bars with no `.t-<tier>` ancestor)
- `:focus-visible`, as an optional brighter variant on primary actions only
- The rank-up ring (`.badge-ring`) during a Finish Sequence rank-up beat only
- `.panel-reward--nebula` for a newly-achieved (not steady-state) Personal Record row

**Explicitly NOT on this list, by design, not by omission:**
- Resting tier badges and tier progress bars anywhere (Ranks list, Overview's rank tile, Workout's
  active-routine rank card) — these stay on the 9-tier metal system.
- Always-visible numeric stat tiles (streak count, level number) that are not mid-transition — e.g.
  Overview's `StatTile.vue` 2×2 status strip. A resting numeric display is neither a CTA nor a
  transient earned-moment; solid `--fire-hi`/`--blue-hi` colors there are correct, not a bug.
- Empty states, loading skeletons, disabled controls — an empty state wearing the "earned" gradient
  would misrepresent the state as achieved.
- The concentrated CTA fill specifically, on the base background/ground of a screen — the ground
  itself carries a low-opacity Nebula-derived wash by design (see §3); what stays off this list is
  stamping the full-strength `--nebula-grad-cta` fill onto a background the way it appears on
  `.btn-primary`.

### Text: gradient-clip vs. solid ink

- Large, single-instance, decorative display text (a Finish Sequence beat's headline tier name) may
  use `-webkit-background-clip: text` with `--nebula-grad`, dark mode only.
- Everything else — rank labels inside a list row, HUD chip text, body copy — uses solid
  `--nebula-ink`. This is the default; gradient text is the rare exception.

---

## 3. Base background/ground — pervasive cosmic sweep

Every screen sits on one continuous, low-opacity cosmic background sweep, in both themes — a
`body::before` layer (`--nebula-sweep-*` tokens, `tokens.css`), not a per-page node. This is
pervasive *in reach* (every route, not just hero moments) but stays deliberately restrained *in
intensity* — an earlier, brighter draft (roughly 3x the shipped wash opacities) was rejected during
design review as "cheap" and "a strain on the eye"; a discrete-radial-blob draft was rejected for
reading as separate patches instead of one blended scene; a literal starfield draft was rejected as
"screen dust." Concretely:
- One diagonal base gradient plus three wide, heavily-blurred radial washes, blended via
  `mix-blend-mode: screen` in dark mode (plain layered opacity in light mode, since screen-blending
  onto a near-white base washes out immediately) so hues melt into each other rather than reading
  as separate blobs.
- Fully static — no ambient motion, ever (battery/perf on a mobile PWA; motion stays reserved for
  existing interaction/celebration primitives, which already respect `prefers-reduced-motion`).
- The values in `tokens.css`'s `--nebula-sweep-*` tokens are the validated spec numbers — do not
  re-brighten or re-derive them "to make it feel more branded"; that is the exact mistake this
  system's design review corrected twice during development.
- The CTA gradient's own legibility still holds: the sweep's washes are low-opacity enough that
  `.btn-primary`'s full-strength fill still reads as clearly the loudest element on any screen.

Tier badges, resting progress bars, and the concentrated §2 positive-list CTA fill are unaffected —
this section is about the ground only; §1's tier-vs-Nebula split and §2's rationing of the
concentrated fill both still apply.

---

## 4. Glow — the rationing rule

No new duration/easing tokens; `--dur-fast/base/slow/cele` and `--ease-out/--ease-spring` from
`motion.css` are reused as-is.

**Glow on an interactive/reward element activates only on a state transition the user just caused,
for the duration of that transition's existing motion primitive, then it turns off.** It is never a
resting/ambient effect on these elements.

- A streak extending (`streakJustExtended` in `App.vue`) permits the streak chip's glow for that
  `--dur-cele` window only.
- A rank-up beat in the Finish Sequence permits the ring/glow for that beat's hold only.
- A logged set, a screen navigation, a routine list render, any resting chip — **no glow, ever**,
  regardless of tier or streak length.
- A plausibility-discounted session **cannot** reach the glow/ring path at all — this is structural
  (the ring component only mounts inside the genuine-rank-up branch, never the discounted branch),
  not a runtime `if` that could be gotten wrong. This is the concrete implementation of the honesty
  principle established elsewhere in the app: discounted sessions get muted, non-celebratory
  treatment, never the "earned" gradient/glow.

**The background sweep (§3) is not glow, and is not subject to this section's event-gating rule.**
It is a different mechanism serving a different job (ambient scene-setting, always on, by explicit
design) — it is allowed to be always-on precisely because it is restrained (soft diffusion only,
never a bloom/haze aura) and does not compete with the signal glow provides. The rule above — glow
fires only on a just-caused success-tier transition, then turns off — otherwise governs every
interactive/reward glow use listed above, including showcase-moment intensification (Rank-up,
Finish Sequence, share-card temporarily increase the *sweep's* saturation for the celebration's
existing motion duration, then settle back — an extension of this exact mechanic to the background
as a whole, not a new one).

`--nebula-glow`/`--nebula-glow-strong` are wired to exactly one live trigger app-wide — the
`.streak-pulse` celebration in `App.vue` — with no other standing usage. Glow being rare in the live
DOM is the intended outcome of "rationed, not ambient," not under-adoption.

---

## 5. Typography, shape, spacing — unchanged

No font swap. `Hanken Grotesk` (body) / `Unbounded` (`--font-display`, tier labels, `.tnum` stat
numbers) already satisfies the bold/geometric brief the mockups hand-rolled with a generic font
stack. No new radius/spacing scale — `--r-sm/md/lg/xl` and `--sp1…8` are reused as-is. The hexagon
`clip-path` already defined on `.badge` is the one shape token; no second hex-shape variant.

**Known gap:** card/CTA corner radius currently varies across three values (16/22/28px) where the
mockup used one uniform value. This is a minor consistency cleanup, not a Nebula-identity question.

**Known gap:** the mockup's CTA typography (small, uppercase, letter-spaced) was not carried into
the shipped `.btn-primary` (15px, sentence-case, no tracking). Also a minor follow-up, not a
Nebula-identity violation — the gradient fill (the actual identity carrier) is correct; the type
treatment is a separate, smaller taste call.

---

## 6. Light mode

Light mode is a genuine second theme, not a filter over dark. Token structure (shipped in
`tokens.css`):

```css
:root[data-theme="light"] {
  --bg: #f6f4fb;
  --surface: #ffffff;
  --surface-2: #f4f2f9;
  --surface-3: #ece7f7;
  --line: rgba(20, 16, 32, 0.10);
  --line-2: rgba(20, 16, 32, 0.16);
  --text: #14121c;
  --dim: #635f78;
  --faint: #6c6178;
  --shadow: 0 8px 20px -14px rgba(15, 15, 25, 0.18);
  --nebula-ink: #6b3fd6;
}
```

Light mode has no glow token — elevation is the neutral `--shadow` value above, matching the
mockup's own light-mode rule (gradient stays on filled/decorative surfaces; shadows go neutral, not
colored, on a white ground).

Default: theme follows OS preference (`prefers-color-scheme`) on first launch via a one-time
`matchMedia` read in `themeStore.ts`; once a user explicitly toggles it (Profile → Darstellung),
that choice persists and overrides system preference from then on.

**Known gap:** toggling to light mode correctly sets `data-theme="light"` and `--bg` correctly
resolves to `#f6f4fb` in CSS, but as of the last verification pass the actual rendered background of
the Ranks-page tier ladder and exercise cards stayed near-black (`rgb(24,26,27)`) — light mode did
not visually apply to these surfaces. This is an implementation bug, not a spec gap; do not confuse
it with the §3 ground-tint design (that's about *whether the dark ground should be violet*, this is
about *light mode failing to render light at all* on specific surfaces). Check current behavior
before assuming it's still open.

---

## 7. Enforcement checklist for future work

Before merging anything that touches color, chrome, a CTA, or a reward/celebration surface:

1. Does this surface appear on the §2 positive list? This question applies only to the concentrated
   `--nebula-grad`/`--nebula-grad-cta` FILL (a CTA's own background, the rank-up ring, a just-earned
   PR row) — not to the pervasive background sweep or the surface-hybrid hairline edge, which are
   separate, always-on-by-design mechanisms (§3/§4). If the surface in front of you wants the
   concentrated fill and isn't on the list, it does not get `--nebula-*` — use the existing
   neutral/tier system (or, for a card/panel, the surface-hybrid utility) instead. When in doubt
   about the concentrated fill specifically, the answer is "no gradient."
2. If it's a CTA: is there already a `.btn-primary` gradient surface at rest on this screen? There
   must be exactly one. A second always-on **concentrated CTA-strength** gradient surface on the
   same screen is a violation — flatten it back to `.btn-secondary`'s neutral treatment or re-read
   §1 before adding a second one. (This does not count the background sweep or a surface-hybrid
   hairline — both are pervasive by design and present on every screen already, not a second CTA.)
3. If it's glow: does it fire only on a `success`-tier event the user just caused, for that event's
   existing motion duration, then turn off? If it's visible at rest, it's wrong. (The background
   sweep is not glow and is exempt from this — see §4.)
4. If it's a tier badge or tier progress bar: it stays on the metal-gradient system. Do not add
   Nebula to it, even "just a little," even for emphasis.
5. If it's the base background of a screen: it is not neutral; it is the pervasive cosmic sweep by
   design (§3). Does it still use the exact validated `--nebula-sweep-*` token values, unmodified?
   Do not re-brighten or re-derive them "to make it feel more branded" — that overshoot-then-correct
   history is exactly what produced the current restrained values.
