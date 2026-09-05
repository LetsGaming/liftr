# Nebula Complete Redesign — Design Spec

**Status:** Approved by product owner in brainstorming session, 2026-09-05. Ready for
`writing-plans`.

## 1. Problem statement

The existing "Nebula" visual identity (`audit/nebula-design-system.md`,
`audit/nebula-design-components.md`, `audit/nebula-design-plan.md`) was deliberately scoped as a
*rationed accent* — a brand gradient applied to a short list of interactive/reward moments (the
primary CTA, background glow on a couple of hero screens, the rank-up ring, the share-card), with
explicit rules against tinting base backgrounds, adding gradients to tier badges, or any "ambient
decoration." An independent gap audit (`audit/nebula-application-gap-audit-2026-09-05.md`)
confirmed that plan is essentially fully shipped as written.

The product owner's judgment, after seeing that audit: the *plan itself* undersells what "Nebula"
should mean for Liftr. "Only buttons have the newer styling" is an accurate description of the
shipped result, and that result does not communicate a cosmic/space identity — it reads as a
conventional app with one branded button color. This spec supersedes the rationing philosophy in
`nebula-design-system.md` §3 and §4 with a new, still-restrained-but-pervasive design.

## 2. Vision

Liftr's UI lives inside one continuous cosmic scene: a soft, smoothly-blended nebula gradient as
the literal ground every screen sits on (dark mode) or its "daytime" translation (light mode), with
UI surfaces reading as translucent objects floating in that scene rather than opaque panels
stacked on a plain background.

**This is not a return to unrestrained decoration.** The redesign is pervasive in *reach* (every
screen, not just hero moments) but stays disciplined in *intensity* — the guardrails below are
hard rules, arrived at through explicit user correction during this design's brainstorming pass,
not soft preferences:

- **Glow stays restrained everywhere.** Soft diffusion only, never a bloom/haze aura. This applies
  to the background wash, any badge/celebration glow, and anything added later. ("Glow can easily
  be read as cheap and a strain on the eye" — direct product-owner feedback that overturned an
  earlier, brighter draft of this same background.)
- **No literal stars or particle fields.** An earlier draft included a scattered-dot starfield;
  rejected because it "can look like dust on the screen." The cosmic feel comes from color and
  gradient smoothness, not literal astronomical imagery.
- **One smooth, continuous gradient sweep, never separate overlapping color blobs.** An earlier
  draft used discrete radial gradients that read as distinct patches; rejected in favor of a single
  blended sweep (see §3).
- **Tier badges (Initiate → Apex) keep their existing separate metal/medal gradient system.** The
  cosmic redesign wraps around them; it never absorbs them. Rank must keep reading as earned status,
  not brand decoration — this was affirmed, not reopened, in this design pass.
- **No ambient motion.** Fully static backgrounds, for battery/performance on a mobile PWA. Motion
  stays reserved for existing interaction/celebration moments (rank-up beats, transitions), which
  already respect `prefers-reduced-motion`.
- **Pervasive, not concentrated.** Every screen gets the background system, not just Overview/Ranks/
  Finish Sequence. Showcase moments differentiate themselves by *briefly intensifying* the same
  system, not by only they having it (see §3.3).

## 3. The visual system

### 3.1 Background — dark mode

A single diagonal linear gradient base with three wide, heavily-blurred radial washes layered on
top via `mix-blend-mode: screen`, so hues melt into each other rather than sitting as separate
circles. This exact recipe was validated interactively with the product owner (mockup "Option 2 /
b2") and should be used as the literal starting values, not re-derived:

```css
/* base */
background: linear-gradient(155deg, #0a0c14 0%, #0b0d19 30%, #0e0d20 55%, #0a0c14 100%);

/* washes, layered on top, mix-blend-mode: screen */
radial-gradient(ellipse 140% 100% at 60% -20%, rgba(138, 109, 255, 0.10), transparent 65%),
radial-gradient(ellipse 120% 90% at 100% 90%, rgba(214, 58, 255, 0.07), transparent 65%),
radial-gradient(ellipse 100% 80% at -10% 60%, rgba(47, 159, 224, 0.06), transparent 65%);
```

This intensity was reached by deliberately overshooting first (roughly 3x these opacities, to make
the *shape* judgeable) and then halving, then quieting further — implementers should not
second-guess these numbers back upward without re-validating live with the product owner, since the
whole point of this pass was correcting a previous "too bright/too strong" miss.

### 3.2 Background — light mode

Same structural recipe, translated to the light ground ("Option B" — the more present of two
tested washes, still meeting AA text contrast per manual review during the mockup pass, but this
needs a real automated contrast check during implementation against actual rendered card content,
not just the isolated gradient):

```css
background: linear-gradient(155deg, #f6f4fb 0%, #f2eff9 30%, #eeeafa 55%, #f6f4fb 100%);

radial-gradient(ellipse 140% 100% at 60% -20%, rgba(138, 109, 255, 0.12), transparent 65%),
radial-gradient(ellipse 120% 90% at 100% 90%, rgba(214, 58, 255, 0.08), transparent 65%),
radial-gradient(ellipse 100% 80% at -10% 60%, rgba(47, 159, 224, 0.07), transparent 65%);
```

No `mix-blend-mode: screen` on light mode (screen-blending against a white base washes out
immediately) — plain layered opacity, as tested.

### 3.3 Showcase-moment intensification

Rank-up celebration, the Finish Sequence, and the share-card do not get a *different* background —
they get the *same* background system, temporarily increased in wash saturation/reach for the
celebration's existing motion duration, then settling back to baseline. This reuses the existing
"glow fires on a success-tier event, for that event's motion duration, then turns off" mechanic
already codified in `nebula-design-system.md` §7 checklist item 3 — it is extended to cover the
background wash as a whole, not introduced as a new mechanic. Exact intensified values (how much
brighter, exact duration/easing) are an implementation detail to tune live against the real
celebration timing, not specified numerically here.

The share-card (`packages/client/src/lib/shareCard.ts`) is a static PNG, not a live DOM surface, so
"intensification" there just means: its background may use a stronger version of the same gradient
recipe than the in-app baseline, since a share image has no "settling back" — this is consistent
with how the share-card already uses its own hardcoded color copies (see that file's header
comment on why canvas can't read CSS custom properties).

### 3.4 Surfaces (cards, panels, stat tiles)

A hybrid of "glass" (translucent + blurred) and "elevated" (opaque + gradient hairline edge),
validated interactively as the product owner's pick between the two pure directions:

```css
background: rgba(23, 26, 45, 0.88);
backdrop-filter: blur(6px);
-webkit-backdrop-filter: blur(6px);
border-radius: 16px;
box-shadow: 0 10px 28px -14px rgba(0, 0, 0, 0.6);

/* 1px gradient-tinted hairline edge, mask-based double-gradient border */
/* pseudo-element or wrapper, per the existing mask-composite pattern: */
background: linear-gradient(155deg, rgba(138, 109, 255, 0.35), rgba(255, 255, 255, 0.03) 40%, rgba(47, 159, 224, 0.2));
-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
-webkit-mask-composite: xor;
mask-composite: exclude;
```

Light-mode equivalent (structure mirrors dark, needs a real contrast pass during implementation —
these are the values validated in the mockup, not yet verified against every real content
combination):

```css
background: rgba(255, 255, 255, 0.85);
border: 1px solid rgba(20, 16, 32, 0.08);
box-shadow: 0 8px 20px -14px rgba(15, 15, 25, 0.2);
/* hairline edge */
background: linear-gradient(155deg, rgba(138, 109, 255, 0.3), rgba(20, 16, 32, 0.02) 40%, rgba(47, 159, 224, 0.18));
```

This becomes the new **default** surface treatment for cards/panels/stat tiles — replacing flat
`--surface`/`--surface-2` fills as the baseline, not living alongside them as a second parallel
system a component author has to choose between.

### 3.5 Nav bar & headers

Adopt the same hybrid treatment as §3.4 (translucent, sweep bleeds through subtly) rather than
staying opaque fixed chrome. This was an explicit, deliberate choice to make navigation feel like
part of the same scene rather than UI floating on top of it — reconsider only if live testing shows
a real legibility problem on the persistent bottom nav specifically (it is the one surface that's
visible 100% of the time, so it deserves its own live scrutiny before shipping, even though the
product owner's directional call was clear).

### 3.6 Typography

No specific complaint drove reconsidering this, and no typeface swap is planned. Evaluate Hanken
Grotesk (body) / Unbounded (display) fresh against the new depth/translucency direction during
implementation; adjust weights, tracking, or hierarchy only if something concretely clashes (e.g.,
a weight that reads poorly against a translucent card). Do not introduce a new typeface
speculatively.

### 3.7 Tier badges, glow rationing on interactive elements

Unchanged in kind — restated against the new pervasive background, not reopened. Tier badges never
receive Nebula gradient treatment. Glow on interactive elements still only fires on a success-tier
event the user just caused, for that event's existing motion duration.

## 4. Architecture

### 4.1 Where the background lives

One fixed-position, full-viewport layer rendered once at the app-shell level (behind
`<router-view>` in `App.vue`), not redrawn per-page — navigating between screens must not
recompute or repaint the gradient; it should read as one continuous scene underneath route
transitions. Driven by the existing `data-theme` attribute the same way today's light/dark tokens
already switch, so no new theme-detection mechanism is needed.

### 4.2 Token additions to `tokens.css`

- A new group of custom properties for the sweep's gradient stops and wash colors/opacities, for
  both themes (e.g. `--nebula-sweep-base-*`, `--nebula-sweep-wash-1/2/3`) — named consistently with
  the existing `--nebula-1/-m/-2` token family rather than introducing an unrelated naming scheme.
- A `--surface-hybrid-*` group (background opacity, blur radius, edge-gradient stops, shadow) that
  becomes the new default for card/panel/stat-tile/nav surfaces, replacing flat `--surface`/
  `--surface-2` fills as the baseline component authors reach for.

### 4.3 Performance risk — validate early, before wide rollout

`backdrop-filter: blur()` on many simultaneous surfaces (a screen with several stat tiles and
exercise rows all blurring at once) can be expensive on Capacitor's WebView, particularly on older
Android devices. **This must be checked on a real device or WebView emulation early in
implementation**, ideally during the Foundation phase (§5) before it's adopted screen-by-screen. If
it's too costly:
- **Fallback:** drop `backdrop-filter` but keep the opacity + gradient hairline edge — still
  visually distinctive as "part of the system," just without the glass softness. This should be a
  single token-level change (turn off blur in the `--surface-hybrid-*` group), not a per-component
  rewrite, which is exactly why §4.2's token-based approach matters.

### 4.4 Rollout shape (for the implementation plan, not prescribed here)

This touches nearly every screen and a large fraction of existing components (anything currently on
a flat `--surface` background). The implementation plan (via `writing-plans`) should scope this the
way Track R (`audit/finished/plan-c-new-ui-rebuild.md`) was run: a **Foundation phase** first
(background layer, `tokens.css` additions, the shared surface-hybrid utility, nav/header adoption,
and the §4.3 performance validation), verified and merged on its own, then **per-area phases**
(Overview, Workout, Ranks, Exercises, Profile, Records/Runs) adopting the new surface utility screen
by screen — each independently verifiable, mirroring the subagent-driven-development pattern
already proven in this codebase, rather than one large unreviewable diff.

## 5. Documentation updates required as part of this work

`audit/nebula-design-system.md` §3 ("Base background/ground — ratified decision") and §4 ("Glow —
the rationing rule") explicitly encode the old *concentrated* scope this spec supersedes — they
need to be **rewritten**, not amended, to state the new pervasive-but-restrained rule as the actual
spec. §7's enforcement checklist needs corresponding updates (e.g., item 5, "the base background of
a screen... stays neutral," is now false — the base background is the sweep). Leaving the old
document in place without this rewrite would cause future work to be checked against a superseded
rule.

## 6. Explicitly out of scope

- Literal starfields, particle effects, or any per-pixel astronomical imagery (rejected during
  brainstorming — reads as "screen dust").
- Ambient/looping background motion (battery/perf; explicit product-owner call).
- Any change to the tier-badge metal/medal gradient system.
- A typeface swap (no concrete complaint driving one; typography gets a fresh look, not a rewrite).
- Numeric tuning of showcase-moment intensification (§3.3) — left for live implementation-time
  tuning against real celebration timing, not specified here.
