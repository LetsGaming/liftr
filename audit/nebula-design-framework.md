# Nebula — Design Framework

The token system. Extends `packages/client/src/styles/tokens.css` and `motion.css` in place —
this is additive, not a rewrite. Every existing token (`--surface`, `--r-md`, `--dur-base`, the
9-tier `.badge` system, `.panel`/`.panel-reward`) keeps its current meaning; new tokens are listed
against what they add and why. Read `nebula-design-philosophy.md` §2 first — it's the reason this
framework introduces exactly one new gradient identity and touches the tier system not at all.

---

## 1. Color

### 1.1 New tokens — `--nebula-*`

```css
:root {
  /* Brand-identity gradient — chrome/CTA/streak/focus only. Never a tier color. */
  --nebula-1: #2f9fe0;   /* Glacier blue */
  --nebula-m: #7c5cff;   /* bridge violet — same hue family as the existing --violet (#8f6dff),
                             chosen close on purpose so Nebula reads as a saturated extension of
                             a color already in the palette, not an unrelated import */
  --nebula-2: #d63aff;   /* Berry magenta */
  --nebula-grad: linear-gradient(120deg, var(--nebula-1), var(--nebula-m), var(--nebula-2));
  --nebula-grad-cta: linear-gradient(135deg, var(--nebula-1), var(--nebula-m), var(--nebula-2));

  /* Solid ink fallbacks — used wherever gradient-clipped text would fail contrast (see §1.3). */
  --nebula-ink: #6b3fd6;        /* dark mode: mid-violet, readable on --surface/--surface-2 */
  --nebula-ink-on-light: #6b3fd6; /* same value currently suffices on the light surfaces in §2;
                                      kept as a separate token so light/dark can diverge later
                                      without a rename */
}
```

`--nebula-m` deliberately sits close to the existing `--violet: #8f6dff` token already in
`tokens.css`. Nebula is not a foreign accent color grafted onto the app — it's the app's existing
violet, pulled into a full brand gradient with a blue and a magenta partner.

### 1.2 Where Nebula is allowed to appear

Positive list, not a negative one — if a surface isn't on this list, it does not get the gradient:

- `.btn-primary` background (replaces the current `linear-gradient(160deg, var(--blue-hi), var(--blue))`
  — see §4 migration note)
- `.level-chip`'s ring/dot accent (App.vue's HUD, currently blue-only)
- `.streak-chip`'s icon/accent color on a genuine extension (not the resting state — see §5)
- Non-tiered `.rankbar`/`.bar-fill` instances (XP/level bars with no `.t-<tier>` ancestor — these
  already fall back to `var(--blue, var(--blue-hi))` per `tokens.css`'s own comment on `.rankbar > i`;
  that fallback becomes `--nebula-grad` instead of blue-only)
- `:focus-visible` ring, as an optional brighter variant on primary actions (default stays
  `--blue-hi` per the existing accessibility-motivated rule; do not regress contrast chasing brand)
- New PR-ledger and rank-up "just earned" one-shot accents (Phase 2 screens, `nebula-design-plan.md`)

Everything else — `.panel`, body text, secondary buttons, non-earned list rows, form controls —
keeps its existing `--surface`/`--text`/`--dim` treatment untouched.

### 1.3 Text: gradient-clip vs. solid ink

`liftr-pulse-liftoff-finalists.html` established this concretely: gradient-clipped text reads
muddy against a light ground, and only marginally better against dark. Rule:

- **Decorative, large, single-instance display numbers** (a Finish Sequence beat's headline tier
  name, a rank-up stamp) may use `-webkit-background-clip: text` with `--nebula-grad` in dark mode
  only.
- **Everything else that happens to sit near Nebula chrome** (rank labels inside a list row, HUD
  chip text, body copy) uses the solid `--nebula-ink` token. This is a hard rule in light mode
  (§2), and the *default* in dark mode too — gradient text is the exception, not the baseline.

### 1.4 Glow

```css
:root {
  --nebula-glow: rgba(124, 92, 255, 0.4);        /* dark-mode card/badge halo */
  --nebula-glow-strong: rgba(214, 58, 255, 0.55); /* dark-mode CTA halo */
}
```

Dark mode only. Applied exclusively per the rationing rule in §5 — never as an always-on ambient
effect on chrome that's simply present, only on chrome reacting to something that just happened.
Light mode has no glow token at all; elevation there is `0 8px 20px -14px rgba(15,15,25,0.18)`
(neutral, matching `liftr-pulse-liftoff-finalists.html`'s light-mode card shadow), scaled the same
way `--shadow` already scales dark-mode elevation in `tokens.css`.

---

## 2. Light mode — net-new capability

`tokens.css` currently has exactly one palette (`:root` is the dark palette; there is no
`prefers-color-scheme` block and no `data-theme` attribute anywhere in the client). Light mode is
therefore genuinely new infrastructure, not a copy-and-invert exercise — flagged explicitly here
because it's the single biggest scope item in this framework.

### 2.1 Token structure

Following the same three-state pattern used for Artifact theming (explicit choice beats system
preference beats default), applied to the actual app shell:

```css
:root {
  /* existing dark values stay here as the default — Liftr ships dark-first, matching its
     current-only palette and its Capacitor/PWA mobile-first posture (lens-2 §2.1/§7) */
  --bg: #0a0c14;
  --surface: #161c2d;
  /* ...every existing token unchanged... */
}

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
  /* --blue/--fire/--green/--red/--pr and the 9-tier badge tokens (--initiate-* … --apex-*)
     are re-checked for contrast against the new --surface/--surface-2 but keep the same hues —
     the tier-metal system's identity should not shift with theme, only its background does */
}
```

No `@media (prefers-color-scheme)` block is added at this layer — Liftr is an authenticated,
single-user app with a Profile screen, not a marketing page rendered inside an unknown host; theme
is a user setting (§2.2), not inferred from OS preference on every load. This deliberately departs
from the Artifact three-state pattern for that reason.

### 2.2 Theme selection

- New `themeStore` (Pinia, matching `streakStore`/`xp` store conventions already in
  `packages/client/src/stores/`): holds `'dark' | 'light'`, persisted to the same local-storage
  mechanism the app already uses for other client-only preferences, applied by setting
  `data-theme` on `document.documentElement` at app boot (before first paint, to avoid a flash).
- Toggle lives in Profile (Phase 4 territory per `plan-c-new-ui-rebuild.md` §3) — not a persistent
  HUD control; this is a low-frequency setting, not something reached for mid-session.
- Default: dark. Liftr has never shipped light mode; changing the out-of-box default is a separate
  product decision from *building* light mode, and is out of scope here.

### 2.3 What must be re-verified per surface, not assumed

Every color decision in `tokens.css` that currently hardcodes an assumption about the dark
background (white icon fills, `rgba(255,255,255,…)` sheens, the `.badge svg` drop-shadow direction)
needs an explicit light-mode check, not a blanket invert:

- `.panel-reward::after`'s diagonal sheen (`rgba(255, 255, 255, 0.08)`) — invisible/wrong on a
  light `--surface`; needs a `[data-theme="light"]`-scoped override to a dark-tinted sheen instead.
- `.badge svg`'s `filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.45))` — still correct in light mode
  (shadow direction is about the icon sitting proud of its own face, not about page background),
  kept as-is.
- `--on-blue-lo`, `--k-warmup-text`/`--k-failure-text`/`--k-dropset-text` — all were tuned for
  contrast against their own bright fills, not against the page background; these need a contrast
  re-check against light-mode `--surface` where the parent isn't the bright fill itself, but likely
  need no change since they sit on saturated fills either way.

This list is not exhaustive — `nebula-design-plan.md`'s Phase 0 work item is a systematic contrast
pass across every token, not a spot-check of the items named here.

---

## 3. Typography

No change. `Hanken Grotesk` (body) / `Unbounded` (`--font-display`, tier labels, `.tnum` stat
numbers) already satisfies the "bold, rounded, geometric-weight, loot-system-appropriate" brief
that `liftr-liftoff-variations.html`'s L1 "Liftoff Bold" and L4 "Pulse × Liftoff" both hand-rolled
with a generic system-font stack for the mockup. The production fonts are already closer to the
target than the mockups were — no font swap, no new `@font-face` blocks.

---

## 4. Shape, spacing, radius, elevation

No change to the scale itself (`--r-sm/md/lg/xl`, `--sp1…8`, `--content-w-*`). Two additions:

- **Hexagon clip-path is already a token-adjacent pattern** — `.badge`'s
  `clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)` is the exact
  Liftoff-medallion shape every mockup round used. No new shape token needed; Nebula-branded
  surfaces that want the hex silhouette (a HUD-level "overall progress" glyph, if Phase 2 adds one)
  reuse this clip-path value directly rather than inventing a second one.
- **`.btn-primary` migration note**: its current background
  (`linear-gradient(160deg, var(--blue-hi), var(--blue))`) becomes `var(--nebula-grad-cta)`, and its
  text-ink strategy (dark ink on a bright fill, chosen in `tokens.css`'s own comment to fix a past
  contrast bug) is preserved — `color: var(--blue-ink)` becomes a new `--nebula-ink-on-fill: #1a0f2e`
  token computed the same way (dark violet-black, checked ≥4.5:1 against the gradient's darkest
  stop, `--nebula-1`).

---

## 5. Motion & the glow-rationing rule

No new duration/easing tokens. `--dur-fast/base/slow/cele` and `--ease-out/--ease-spring` are
reused exactly as specified in `motion.css`. What's new is a explicit, checkable rule for when
Nebula's glow (§1.4) is allowed to activate, since "rationed to earned moments" was a mockup-round
principle, not yet an enforceable one:

**Glow activates only on a state transition the user just caused, and only for the duration of
that transition's existing motion primitive.** Concretely:

- A streak extending (`streakJustExtended` in `App.vue`, already driving `.streak-pulse` for
  `--dur-cele`) — the *same* trigger now also permits the streak chip's Nebula glow, for the same
  `--dur-cele` window, then it turns off. It does not stay lit as a resting state.
- A rank-up beat in the Finish Sequence (`useCelebrate`) — glow permitted for that beat's hold only.
- A logged set, a screen navigation, a routine list render, a resting HUD chip with no pending
  change — **no glow**, ever, regardless of tier or streak length. This is the direct implementation
  of `nebula-design-philosophy.md` §3's plausibility-discount rule: a discounted session cannot
  trigger this path at all, because it never fires the same `success`-tier haptic/motion event a
  genuine rank-up does (`lens-2` §5, already encoded in the existing haptic-tier contract).

This rule is what `liftr-pulse-liftoff-colorways.html`'s G2 "Flat Pulse" round tested for: the
gradient carries the "earned" signal on its own; glow is allowed to reinforce it at the exact
moment something happened, never as ambient brand decoration.
