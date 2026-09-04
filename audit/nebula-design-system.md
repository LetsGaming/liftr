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
- The app's base background/ground in either theme — see §3.

### Text: gradient-clip vs. solid ink

- Large, single-instance, decorative display text (a Finish Sequence beat's headline tier name) may
  use `-webkit-background-clip: text` with `--nebula-grad`, dark mode only.
- Everything else — rank labels inside a list row, HUD chip text, body copy — uses solid
  `--nebula-ink`. This is the default; gradient text is the rare exception.

---

## 3. Base background/ground — ratified decision

**This was the single most consequential open question this rewrite resolves.** The finalist
mockup (`liftr-pulse-liftoff-finalists.html`) wraps its entire dark-mode phone screen in a
violet-tinted radial wash (`#1c1a3a → #0a0912`). The shipped app's dark `--bg`/`--surface`
(`#0a0c14`/`#161c22`-family, neutral blue-black) never adopted that tint. The prior version of this
document carried this forward silently ("existing dark values stay here as the default") without
weighing it against the mockup — an omission, not a decision, and exactly the kind of ambiguity
that let round 2's live-browser audit read it as a fidelity failure.

**Ratified: the neutral background stays. This is correct, not a gap, and must not be "fixed" to
match the mockup's violet wash.** Reasoning:
- §1's central rule is that Nebula is *rationed* — it signals a specific, narrow thing (interactive
  or just-earned), and that signal only works if it is not also the ambient wallpaper of every
  screen. A violet-tinted ground the user stares at through every idle moment of every screen is
  the definition of ambient decoration, not a rationed signal — it would flatten the exact
  distinction (resting vs. earned) the whole system exists to draw.
- The mockup's raw violet ground was tuned for a handful of static hero shots, not for a screen a
  user looks at for minutes at a time during active logging. `nebula-design-components.md` §Train
  already separately established that Train's high-frequency surfaces deliberately use solid
  `--nebula-ink`, not gradient, for exactly this "stared-at dozens of times a session" reason — the
  same logic extends to the ground itself, a fortiori.
- Keeping the ground neutral is also why the CTA gradient reads clearly when it appears (confirmed
  in round 2: the CTA gradient is legible and correctly rendered against the neutral ground in both
  themes) — a violet ground would reduce the CTA's contrast against its own background.

If a future redesign wants a tinted ground, that is a new brainstorm and a new decision, not a
"finish what Nebula started" task — this document closes that question for the current system.

---

## 4. Glow — the rationing rule

No new duration/easing tokens; `--dur-fast/base/slow/cele` and `--ease-out/--ease-spring` from
`motion.css` are reused as-is.

**Glow activates only on a state transition the user just caused, for the duration of that
transition's existing motion primitive, then it turns off.** It is never a resting/ambient effect.

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

1. Does this surface appear on the §2 positive list? If not, it does not get `--nebula-*` — use the
   existing neutral/tier system instead. When in doubt, the answer is "no gradient."
2. If it's a CTA: is there already a `.btn-primary` gradient surface at rest on this screen? There
   must be exactly one. A second always-on gradient surface on the same screen is a violation — flatten
   it back to `.btn-secondary`'s neutral treatment or re-read §1 before adding a second one.
3. If it's glow: does it fire only on a `success`-tier event the user just caused, for that event's
   existing motion duration, then turn off? If it's visible at rest, it's wrong.
4. If it's a tier badge or tier progress bar: it stays on the metal-gradient system. Do not add
   Nebula to it, even "just a little," even for emphasis.
5. If it's the base background of a screen: it stays neutral (§3). Do not add a tint "to make it
   feel more branded" — that is the ambient-decoration failure mode this system is built to avoid.
