# Nebula — Design System (Ground Truth)

**Status: normative.** This document is the authoritative spec for Liftr's visual identity. It
does not describe a proposal under discussion — it states what must be true of the shipped app,
and any new screen, component, or PR that touches color/chrome/CTA/reward surfaces must conform to
it. If code and this document disagree, the code is a bug (open one), not evidence the document is
outdated — the reverse (updating this document to match a bug) is the drift future work must not
repeat.

Supersedes and consolidates: `nebula-design-philosophy.md`, `nebula-design-framework.md`,
`nebula-design-layout.md`, `nebula-design-patterns.md` (deleted — their content lives here and in
the companion `nebula-design-components.md`). Read this document first for the *why* and the
tokens; read `nebula-design-components.md` for how each component/screen applies it; read
`nebula-design-plan.md` for phased rollout status.

**Provenance:** the direction was chosen through a mockup sequence in `examples/liftr/`:
`liftr-directions.html` (three directions — Pulse chosen) → `liftr-liftoff-variations.html`
(Pulse × Liftoff chosen) → `liftr-pulse-liftoff-variations.html` → `liftr-pulse-liftoff-colorways.html`
→ `liftr-pulse-liftoff-finalists.html` (Nebula: Glacier × Berry, blue → violet → magenta, chosen).

**Verification provenance (2026-09-04):** every implementation-status claim in this document is
sourced from two independent verification passes, not from memory of what was planned:
- Round 1 (static code read): `audit/verify/agent-6.md`, `audit/verify/SUMMARY.md`
- Round 2 (live browser + rendered screenshot comparison against the mockups):
  `audit/verify/round2-design-agent-1.md` (Overview), `-2.md` (Workout), `-3.md` (Ranks),
  `audit/verify/ROUND2-SUMMARY.md`

---

## 1. What Nebula is, and is not

Nebula answers exactly one question: **is this thing interactive right now, or was it just
earned?** It is not a palette, not a re-skin, and not a replacement for the app's existing 9-tier
badge system.

- **One gradient, everywhere it appears the same way.** `--nebula-1 → --nebula-m → --nebula-2`
  (blue → violet → magenta). No situational second brand gradient — a distinct "streak color"
  separate from "rank-up color" was considered and rejected; it would recreate the inconsistent
  active-state color semantics `lens-3` §2.3 already flagged as a defect elsewhere in the app.
- **A hexagon is the one shape reserved for rank/tier identity** — not a circle, not a plain card.
  Already implemented as `.badge`'s `clip-path` in `tokens.css`; no second shape token.
- **Glow is rationed, not ambient.** It activates only on a state transition the user just caused,
  for the duration of that transition's existing motion primitive, then it is gone. A resting HUD
  chip, a resting badge on the Ranks list, a routine card — none of these get glow, ever, regardless
  of tier or streak length. See §4.
- **Nebula is a second layer over the tier system, not a replacement for it.** `tokens.css` already
  has a mature, evidence-based 9-tier metal-gradient badge system (`.t-initiate` … `.t-apex` —
  bronze/silver/gold/iridescent-equivalent per tier). That system answers *which* of nine tiers
  something is; Nebula answers whether something is *interactive or just-earned*, independent of
  tier. **The 9-tier badge system's own colors are explicitly out of scope for Nebula and must stay
  untouched** — this is a rejected idea, not a deferred one. A rank-up event legitimately layers
  both: the tier medallion renders in its own metal gradient (whichever tier was actually earned),
  while the surrounding "you ranked up" chrome (the ring around the badge, the beat's background
  wash, the continue CTA) uses Nebula. **Confirmed as correctly implemented**: round 1 verified
  `FinishSequence.vue`'s `.badge-ring`/`.badge-ring-muted` split exists and is structurally scoped
  to the rank-up beat only, never the resting Ranks list (`audit/verify/agent-8.md`). Round 2's
  observation that `/ranks`' resting tier bars are bronze/silver, not violet-magenta
  (`audit/verify/round2-design-agent-3.md`) is **not a defect** — it is this rule working as
  designed. Do not "fix" this by adding Nebula to resting tier badges.

| Question the color answers | System | Where it lives |
|---|---|---|
| "Which of the 9 tiers is this?" | The existing per-tier metal-gradient badge system | Rank medallions at rest, `.panel-reward` tier fills, tier-context `.rankbar` fills |
| "Is this interactive / was this just earned, right now?" | Nebula (`--nebula-1/m/2`) | Primary CTA buttons, the HUD level-ring dot, a streak *extending* (not resting), non-tiered progress fills, the rank-up ring/glow during its beat only |

---

## 2. Color tokens

Already shipped in `packages/client/src/styles/tokens.css` — do not rename or restructure these;
this section documents the contract, it doesn't propose new values.

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
is **ratified as correct** — do not "fix" it back to match the mockup file byte-for-byte; the
mockup is a reference for direction, not a pixel contract.

### Where Nebula is allowed to appear (positive list — if a surface isn't listed, it does not get the gradient)

**Scope note (2026-09-05 complete-redesign, superseding this list's premise): this positive list
still governs exactly one thing — the concentrated `--nebula-grad`/`--nebula-grad-cta` FILL (a CTA
button's own background, the rank-up ring, a just-earned PR row). It no longer governs the whole
app's visual identity.** Two other, separate mechanisms are now pervasive by design (every screen,
not gated by this list) and are documented in §3/§4 below, not here:
- the cosmic **background sweep** every screen sits on (`body::before`, `--nebula-sweep-*` tokens) —
  a low-opacity wash *derived from* Nebula's hues, not the CTA gradient itself, and
- the **surface-hybrid** hairline edge (`--surface-hybrid-edge-grad`) on every card/panel/nav/header
  — also a low-opacity gradient echo, not the CTA fill.
Do not read "pervasive background exists now" as license to apply the concentrated CTA gradient
more widely — that rationing (below) is unchanged and still real.

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
  (This was ambiguous in the prior version of this document, which never named `StatTile.vue`
  explicitly — now resolved: solid color is correct.)
- Empty states, loading skeletons, disabled controls — an empty state wearing the "earned" gradient
  would misrepresent the state as achieved.
- The concentrated CTA fill specifically, on the base background/ground of a screen — the ground
  itself now carries a low-opacity Nebula-derived wash by design (see §3, rewritten 2026-09-05);
  what stays off this list is stamping the full-strength `--nebula-grad-cta` fill onto a background
  the way it appears on `.btn-primary`.

### Text: gradient-clip vs. solid ink

- Large, single-instance, decorative display text (a Finish Sequence beat's headline tier name) may
  use `-webkit-background-clip: text` with `--nebula-grad`, dark mode only.
- Everything else — rank labels inside a list row, HUD chip text, body copy — uses solid
  `--nebula-ink`. This is the default; gradient text is the rare exception.

---

## 3. Base background/ground — superseded 2026-09-05, now a pervasive cosmic sweep

**This section previously ratified a neutral (non-tinted) ground as correct-not-a-gap. That
ruling is superseded, not amended — the current rule is the literal opposite of what this section
used to say.** The supersession is recorded in
`docs/superpowers/specs/2026-09-05-nebula-complete-redesign-design.md`: the product owner's
judgment, after `audit/nebula-application-gap-audit-2026-09-05.md` confirmed the old rationed plan
was fully shipped as originally written, was that the plan itself undersold what Nebula should mean
for Liftr — "only buttons have the new styling" was accurate and insufficient. This section's old
reasoning (a violet ground would flatten the resting-vs-earned distinction; the mockup's raw wash
was tuned for hero shots, not minutes-long screens) is not wrong as far as it went, but it was
reasoning about the *concentrated* CTA-strength gradient, not a restrained, low-opacity ambient
wash — the new system is deliberately not what that reasoning was rejecting.

**Current rule: every screen sits on one continuous, low-opacity cosmic background sweep, in both
themes — a `body::before` layer (`--nebula-sweep-*` tokens, `tokens.css`), not a per-page node.**
This is pervasive *in reach* (every route, not just hero moments) but stays deliberately restrained
*in intensity*, per explicit product-owner correction during the redesign's brainstorming pass (an
earlier, brighter draft — roughly 3x the shipped wash opacities — was rejected as "cheap" and "a
strain on the eye"; a discrete-radial-blob draft was rejected for reading as separate patches
instead of one blended scene; a literal starfield draft was rejected as "screen dust"). Concretely:
- One diagonal base gradient plus three wide, heavily-blurred radial washes, blended via
  `mix-blend-mode: screen` in dark mode (plain layered opacity in light mode, since screen-blending
  onto a near-white base washes out immediately) so hues melt into each other rather than reading
  as separate blobs.
- Fully static — no ambient motion, ever (battery/perf on a mobile PWA; motion stays reserved for
  existing interaction/celebration primitives, which already respect `prefers-reduced-motion`).
- The values in `tokens.css`'s `--nebula-sweep-*` tokens are the literal validated spec numbers —
  do not re-brighten or re-derive them "to make it feel more branded"; that is the exact mistake
  this redesign corrected twice during its own brainstorming pass.
- The CTA gradient's own legibility (the old section's other supporting argument) still holds:
  the sweep's washes are low-opacity enough that `.btn-primary`'s full-strength fill still reads as
  clearly the loudest element on any screen — this was re-verified live during Foundation task F2/F3
  rather than assumed.

Tier badges, resting progress bars, and the concentrated §2 positive-list CTA fill are unaffected —
this section is about the ground only, exactly as before; §1's tier-vs-Nebula split and §2's
rationing of the concentrated fill are both restated, not reopened, by this rewrite.

---

## 4. Glow — the rationing rule (restated for interactive/reward glow; the ground is no longer
   evidence for this rule — see 2026-09-05 update below)

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
- A plausibility-discounted session **cannot** reach the glow/ring path at all — this must be
  structural (the ring component only mounts inside the genuine-rank-up branch, never the
  discounted branch), not a runtime `if` that could be gotten wrong. This is the concrete
  implementation of the honesty principle already established elsewhere in the audit (discounted
  sessions get muted, non-celebratory treatment, never the "earned" gradient/glow).

**2026-09-05 update — this rule never applied to the ground, and still doesn't, but §3 changed
what "the ground" is.** Before this date, this section's rationing was easy to conflate with §3's
old "the ground stays neutral" ruling — both pointed the same direction (nothing ambient), so the
distinction between "glow is event-gated" and "the ground carries no color" didn't need separating.
Now that §3's ground *does* carry a low-opacity Nebula-derived wash pervasively, the distinction
matters: **the background sweep is not glow, and is not subject to this section's event-gating
rule.** It is a different mechanism serving a different job (ambient scene-setting, always on, by
explicit product-owner design) — it is allowed to be always-on precisely because it is restrained
(soft diffusion only, never a bloom/haze aura per the redesign spec's guardrails) and does not
compete with the signal glow provides. The rule above — glow fires only on a just-caused
success-tier transition, then turns off — is otherwise completely unchanged and still governs every
interactive/reward glow use listed above, including the showcase-moment intensification the same
redesign adds (Rank-up, Finish Sequence, share-card temporarily increase the *sweep's* saturation
for the celebration's existing motion duration, then settle back — an extension of this exact
mechanic to the background as a whole, not a new one; see the design spec §3.3, numbers tuned live
in a later phase, not specified here).

**Verified status:** round 1 confirmed `--nebula-glow`/`--nebula-glow-strong` are defined with
values matching the mockup and are wired to exactly one live trigger app-wide — the `.streak-pulse`
celebration in `App.vue` — with no other standing usage (`audit/verify/round2-design-agent-1.md`).
That is the rule working correctly, not an under-adoption bug: glow being rare in the live DOM is
the intended outcome of "rationed, not ambient." The Finish Sequence rank-up ring/glow's live
rendering during an actual rank-up beat was not independently confirmed in round 2 (no rank-up was
triggerable in that session) — flagged as **needs a live confirmation pass**, not as broken.

---

## 5. Typography, shape, spacing — unchanged

No font swap. `Hanken Grotesk` (body) / `Unbounded` (`--font-display`, tier labels, `.tnum` stat
numbers) already satisfies the bold/geometric brief the mockups hand-rolled with a generic font
stack. No new radius/spacing scale — `--r-sm/md/lg/xl` and `--sp1…8` are reused as-is. The hexagon
`clip-path` already defined on `.badge` is the one shape token; no second hex-shape variant.

**Open, non-blocking drift noted by round 2:** card/CTA corner radius currently varies across three
values (16/22/28px) where the mockup used one uniform value. This is a minor consistency cleanup,
not a Nebula-identity question — track it as a small follow-up, not part of this ground truth's
enforcement scope.

**Open, non-blocking drift noted by round 2:** the mockup's CTA typography (small, uppercase,
letter-spaced) was not carried into the shipped `.btn-primary` (15px, sentence-case, no tracking).
Also a minor follow-up, not a Nebula-identity violation — the gradient fill (the actual identity
carrier) is correct; the type treatment is a separate, smaller taste call left open for whoever
picks up the radius cleanup above.

---

## 6. Light mode

Light mode is a genuine second theme, not a filter over dark. Token structure (already shipped in
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

### ⚠ Known open defect (not a design question — a bug, log it and fix it)

Round 2 (`audit/verify/round2-design-agent-3.md`) found that toggling to light mode correctly sets
`data-theme="light"` and `--bg` correctly resolves to `#f6f4fb` in CSS, but the **actual rendered**
background of the Ranks-page tier ladder and exercise cards stays near-black
(`rgb(24,26,27)`) — light mode does not visually apply to these surfaces. This is a real
implementation bug, not a spec gap. It must be tracked and fixed like any other bug (see
`workplan-v1.md`); do not confuse it with the §3 ground-tint decision above — that is about
*whether the dark ground should be violet*, this is about *light mode failing to render light at
all* on specific surfaces.

---

## 7. Enforcement checklist for future work

Before merging anything that touches color, chrome, a CTA, or a reward/celebration surface:

1. Does this surface appear on the §2 positive list? **Note the 2026-09-05 scope narrowing: this
   question now applies only to the concentrated `--nebula-grad`/`--nebula-grad-cta` FILL** (a CTA's
   own background, the rank-up ring, a just-earned PR row) — not to the pervasive background sweep
   or the surface-hybrid hairline edge, which are separate, always-on-by-design mechanisms (§3/§4).
   If the surface in front of you wants the concentrated fill and isn't on the list, it does not get
   `--nebula-*` — use the existing neutral/tier system (or, for a card/panel, the surface-hybrid
   utility) instead. When in doubt about the concentrated fill specifically, the answer is "no
   gradient."
2. If it's a CTA: is there already a `.btn-primary` gradient surface at rest on this screen? There
   must be exactly one. A second always-on **concentrated CTA-strength** gradient surface on the
   same screen is a violation — flatten it back to `.btn-secondary`'s neutral treatment or re-read
   §1 before adding a second one. (This does not count the background sweep or a surface-hybrid
   hairline — both are pervasive by design and present on every screen already, not a second CTA.)
3. If it's glow: does it fire only on a `success`-tier event the user just caused, for that event's
   existing motion duration, then turn off? If it's visible at rest, it's wrong. (The background
   sweep is not glow and is exempt from this — see §4's 2026-09-05 update.)
4. If it's a tier badge or tier progress bar: it stays on the metal-gradient system. Do not add
   Nebula to it, even "just a little," even for emphasis.
5. **Superseded 2026-09-05 — the base background of a screen is no longer neutral; it is the
   pervasive cosmic sweep by design (§3).** The check that survives from this item's original
   intent: does the sweep still use the exact validated `--nebula-sweep-*` token values, unmodified?
   Do not re-brighten or re-derive them "to make it feel more branded" — that overshoot-then-correct
   history is exactly what produced the current restrained values; second-guessing them back upward
   without live product-owner re-validation repeats a mistake this system's own history already
   made and fixed twice.
