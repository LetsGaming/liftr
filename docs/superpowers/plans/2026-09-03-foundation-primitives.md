# Foundation Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining, genuinely-open gaps in Liftr's design-token/nav-shell/layout-primitive/motion-primitive foundation so Workstreams A–E can build every later screen on a shared, load-bearing set of primitives without re-litigating touch-target, truncation, thumb-zone, density, or haptic-tier decisions.

**Architecture:** Nearly all of Plan C §3 Phase 0's originally-scoped work already shipped in prior sessions (Nebula token system, the five-zone nav shell with its 195px scroll-fallback, `useCountUp`/`useCelebrate`, and a three-tier `haptics.ts` vocabulary) — this plan does NOT re-build any of that. It (1) consolidates one duplicated magic number (44px) into a real token and applies it to the two spots that still lack it, (2) adds the three layout/density primitives that never existed (`TruncatingLabel`, `ThumbZoneAction`, `DensityScope`), (3) hardens the nav shell with a `--bottom-chrome-h` var those primitives need, and (4) documents/verifies (not rebuilds) the motion and haptic primitives against Plan C's success criterion.

**Tech Stack:** Vue 3 `<script setup lang="ts">` SFCs, plain CSS custom properties (no animation/CSS-in-JS library — this is an offline-first PWA, bundle weight matters), Pinia (unrelated to this plan directly), `@capacitor/haptics` (already wired), vue-tsc for typechecking.

**Spec:** `audit/plan-c-new-ui-rebuild.md` §3 Phase 0, `audit/nebula-design-framework.md`, `docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §3.0

## Global Constraints

- **44×44px touch-target floor** (WCAG 2.5.5 / Apple HIG 44pt) — hard minimum for every interactive element, applied via one shared token, never a per-component judgment call (`plan-c-new-ui-rebuild.md` §3 Phase 0; lens-3 §2.3).
- **`prefers-reduced-motion: reduce` collapses every `--dur-*` token to 1ms and silences haptics** (`motion.css`, `lib/haptics.ts` — already implemented; this plan must preserve, not reimplement, that behavior).
- **The five real nav destinations, exact routes** (already implemented in `App.vue`'s `navItems`, do not rename or reorder): `/` (Übersicht/Today), `/workout` (Workout/Train), `/ranks` (Ränge/Progress), `/exercises` (Übungen), `/profile` (Profil). `/runs` (Läufe) is intentionally not a sixth tab — it's merged into the Workout tab via an in-page switcher (`WorkoutRunsSwitcher.vue`), per `App.vue`'s own header comment; this plan must not reintroduce it as a nav item.
- **No fourth haptic tier.** `lib/haptics.ts` already defines exactly three: `tap()` (a set logged), `bump()` (exercise completed), `success()` (PR/rank-up/finish). Every later workstream's animated moment maps onto one of these three — this plan documents the contract, it does not add a fourth.
- **Nav-overflow-at-195px is already fixed** (`workplan-v1.md` §1.1, confirmed live in source: `App.vue`'s `.tab-bar` gets `overflow-x: auto` + `flex: none` items below 300px width). This plan verifies it, it does not re-implement it — re-implementing risks a second, conflicting rule.
- **No new test infrastructure for pure-client code.** This repo's client package has zero Vitest config/test files; Vitest exists only at the shared/server level. For every client-only deliverable in this plan, verification is `pnpm --filter @liftr/client typecheck` plus a written, description-based manual-check table — matching the repo's existing convention, not a gap to close.
- **Reduced-motion/celebration restraint stance** (`plan-c-new-ui-rebuild.md` §2): fast/undecorated motion for routine actions, real celebration reserved for rank-up/PR/finish only. No task in this plan adds new celebratory motion — it documents and, where a real gap exists, hardens the existing contract.

---

## File Structure

- `packages/client/src/styles/tokens.css` — add `--touch-target-min`, refactor 4 existing hardcoded `44px` occurrences to reference it, add the `--density-*` token scaffold.
- `packages/client/src/App.vue` — add `--bottom-chrome-h` (mirrors the existing `--top-hud-h` pattern), apply `--touch-target-min` to `.nav-link`/`.tab-link`.
- `packages/client/src/components/ui/NumberStepper.vue` — apply `--touch-target-min` to the one remaining unenforced button size (`.stepper.lg .ctrls button`).
- `packages/client/src/components/ui/TruncatingLabel.vue` (new) — the single-line/multi-line ellipsis primitive.
- `packages/client/src/components/ui/ThumbZoneAction.vue` (new) — the lower-third CTA anchor primitive.
- `packages/client/src/composables/useDensity.ts` (new) — `DensityMode` type, injection key, `provideDensityMode`/`useDensityMode`.
- `packages/client/src/components/ui/DensityScope.vue` (new) — the density-mode wrapper component.
- `packages/client/src/lib/haptics.ts` — documentation-only hardening (cross-workstream contract note).
- `packages/client/src/composables/useCelebrate.ts` — documentation-only hardening (haptic-wiring contract note).

---

### Task 1: Touch-target and density design tokens

**Files:**
- Modify: `packages/client/src/styles/tokens.css:179-220` (token block), `:286-301` (`.btn-close`), `:303-351` (`.btn-primary`/`.btn-secondary`)
- Test: none (pure CSS token change) — verify via Task 7's typecheck + visual spot-check

**Interfaces:**
- Consumes: nothing new (reads the existing `:root` token block).
- Produces: `--touch-target-min` (44px, `:root`) — every later workstream's custom interactive element must size against this token, not a literal `44px`. `--density-gap`, `--density-touch-min`, `--density-text-scale` (`:root` default + `[data-density="train"|"plan"|"progress"]` overrides) — consumed by Task 5's `DensityScope`/`useDensityMode` and by every later workstream screen that opts into a density mode.

- [ ] **Step 1: Add the touch-target token and density token scaffold to `tokens.css`**

Insert immediately after the existing `--content-w-xwide: 1300px;` line (still inside the same `:root` block, right before its closing `}` at line 220):

```css
  /* Foundation Task 1 (2026-09-03 plan) — was hardcoded as the literal `44px` in four places
     (.btn-close, .btn-primary's min-height, .btn-secondary's min-height, NumberStepper's
     .stepper.sm ctrls button) with no shared token, despite every one of those comments citing
     the exact same audit finding (WCAG 2.5.5 / Apple HIG 44pt touch-target floor). One token,
     four call sites updated below and in NumberStepper.vue/App.vue, so the floor can never again
     silently drift between components the way lens-3 originally found it had (§2.3). */
  --touch-target-min: 44px;

  /* Density-mode scaffold (Plan C §3 Phase 0; lens-2 §4's three named density levels — Train
     lowest-density/largest-targets, Plan form-dense, Progress read-dense). Defined here as bare
     custom properties so ANY component can read var(--density-gap) etc. even before a
     DensityScope ancestor sets a mode (falls through to these :root defaults, the "progress"
     values — the middle ground). components/ui/DensityScope.vue (Task 5) is what actually flips
     these by setting [data-density] on a wrapper; this block only defines what the three modes
     ARE. Later workstreams choose per-screen whether to wrap in DensityScope at all — a screen
     that never does just gets these defaults uniformly, which is a safe no-op, not a broken
     state. */
  --density-gap: var(--sp3);
  --density-touch-min: var(--touch-target-min);
  --density-text-scale: 1;
}

/* Density-mode overrides (Task 5's DensityScope sets one of these three on a wrapper's
   data-density attribute). Train: the sacred ~30x/session logging loop gets the loosest gap and
   the largest touch targets of any surface in the app — bigger than the floor, not just at it.
   Plan: form-dense screens (routine builder, mesocycle setup) tighten the gap and drop text size
   slightly to fit more form rows per screen without dropping below the touch-target floor itself
   (--density-touch-min still equals --touch-target-min here, never less). Progress: read-dense
   screens (Ränge, PR ledger) match the :root default exactly — named explicitly anyway so a
   screen can opt in on purpose rather than relying on the fallback by accident. */
[data-density="train"] {
  --density-gap: var(--sp5);
  --density-touch-min: 56px;
  --density-text-scale: 1.08;
}
[data-density="plan"] {
  --density-gap: var(--sp2);
  --density-touch-min: var(--touch-target-min);
  --density-text-scale: 0.94;
}
[data-density="progress"] {
  --density-gap: var(--sp3);
  --density-touch-min: var(--touch-target-min);
  --density-text-scale: 1;
}
```

- [ ] **Step 2: Refactor the four existing hardcoded `44px` occurrences to reference the new token**

In `tokens.css`, `.btn-close` (around line 287-288):

```css
.btn-close {
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  border-radius: 50%;
```

`.btn-primary`'s `min-height` (around line 332):

```css
  min-height: var(--touch-target-min);
```

`.btn-secondary`'s `min-height` (around line 359):

```css
  min-height: var(--touch-target-min);
```

- [ ] **Step 3: Verify no visual regression**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS (pure CSS change, but confirms nothing else in the client package broke).

Manual check: open the app locally (`pnpm --filter @liftr/client dev`), confirm `.btn-close`, `.btn-primary`, `.btn-secondary` render at the same pixel size as before (44px is the same literal value the token now holds — this step is a pure refactor, not a visual change).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/styles/tokens.css
git commit -m "feat(tokens): consolidate touch-target floor into --touch-target-min, add density-mode scaffold"
```

---

### Task 2: Nav shell hardening — `--bottom-chrome-h` and touch-target enforcement

**Files:**
- Modify: `packages/client/src/App.vue:281-347` (`.side-nav`, `.tab-bar`, `.nav-link`, `.tab-link` rules), `:475-560` (the `@media (max-width: 899px)` block, alongside the existing `--top-hud-h`)
- Test: none (pure CSS) — manual QA checklist in Step 3

**Interfaces:**
- Consumes: `--touch-target-min` (Task 1).
- Produces: `--bottom-chrome-h` custom property on `.app-shell`, set only inside the `max-width: 899px` media query (mirrors `--top-hud-h`'s existing pattern of having no value — and therefore falling to its `var(..., 0px)` fallback — on the >=900px desktop layout where the fixed bottom tab bar doesn't exist). Task 4's `ThumbZoneAction` reads this var via `var(--bottom-chrome-h, 0px)`.

- [ ] **Step 1: Apply the touch-target floor to `.nav-link` and `.tab-link`**

In `App.vue`'s `<style scoped>`, `.nav-link` (around line 308-318):

```css
.nav-link {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  color: var(--dim);
  text-decoration: none;
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  font-weight: 600;
  font-size: 13.5px;
  min-height: var(--touch-target-min);
}
```

`.tab-link` (around line 319-337) — add the same `min-height` line to the existing rule (its measured content height is already ~55-61px depending on breakpoint, so this is a defensive floor, not a visual change, but it closes the gap where the height came from unlabeled content sizing rather than a stated contract):

```css
.tab-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--dim);
  text-decoration: none;
  padding: 9px 3px 12px;
  border-radius: var(--r-sm);
  font-weight: 700;
  font-size: 11.5px;
  white-space: nowrap;
  min-height: var(--touch-target-min);
}
```

- [ ] **Step 2: Add `--bottom-chrome-h`, mirroring `--top-hud-h`**

In the `@media (max-width: 899px)` block (around line 475-486), add the new declaration next to the existing `--top-hud-h` one:

```css
@media (max-width: 899px) {
  .app-shell {
    --top-hud-h: calc(52px + env(safe-area-inset-top, 0px));
    /* Foundation Task 2 (2026-09-03 plan) — Task 4's ThumbZoneAction sticky variant needs to
       know how much space the fixed .bottom-chrome tab bar reserves at the bottom of the
       viewport, the same way .main-content already needs --top-hud-h for the top. Measured
       content height is ~55-61px depending on the <380px icon/font shrink breakpoint (9px+
       icon(18-23px)+3px gap+label line(~13-14px)+12px, see .tab-link above) — 64px is a
       deliberate small margin over the tallest measured case, not a re-measurement per
       breakpoint, since ThumbZoneAction only needs "enough clearance," not pixel-exact clearance. */
    --bottom-chrome-h: calc(64px + env(safe-area-inset-bottom, 0px));
  }
```

- [ ] **Step 3: Manual QA — confirm the nav shell still meets Plan C's success criterion**

No automated viewport-size test exists in this repo (no Playwright/e2e harness wired to a plan-owned CI step). Document this as a manual check, run once after Steps 1-2 land, using the browser devtools responsive-mode widths Plan C names explicitly:

| Width | Expected |
|---|---|
| 195px | `.tab-bar` scrolls horizontally (the `max-width: 300px` rule already in source); all 5 items reachable by scroll, none clipped. |
| 320px | All 5 tab items visible without scrolling, `font-size: 10.5px` sub-380px rule active, no wrapping. |
| 390px | All 5 tab items visible, standard 11.5px sizing, no wrapping/clipping. |
| 1024px+ | `.side-nav` sidebar visible (display: flex via `min-width: 900px` query), `.bottom-chrome`/`.tab-bar` hidden. |

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.vue
git commit -m "feat(nav): add --bottom-chrome-h and enforce touch-target floor on nav-link/tab-link"
```

---

### Task 3: `TruncatingLabel` primitive

**Files:**
- Create: `packages/client/src/components/ui/TruncatingLabel.vue`
- Test: none (pure presentational component, no logic branch) — manual check in Step 2

**Interfaces:**
- Consumes: nothing.
- Produces: `TruncatingLabel` component. Props: `lines?: number` (default `1`), `as?: string` (default `"span"`). Default slot holds the text content. Every later workstream that renders an exercise name (or any other user/content-controlled string with no guaranteed max length) must wrap it in this component instead of relying on ad hoc `overflow-wrap`/`word-break`/`text-overflow` CSS — closes lens-3 §2.2's mid-word-wrap finding at the primitive level so it can't recur screen-by-screen. Requires the immediate parent to be a flex or grid container for the ellipsis to actually engage (the component sets `min-width: 0` on itself, which only has an effect inside a flex/grid item context) — callers are responsible for that ancestor.

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
/**
 * Foundation primitive (2026-09-03 Foundation plan, Task 3) — flex + min-width:0 + ellipsis
 * truncation for exercise names and other user/content-controlled strings, closing lens-3's
 * High-severity finding of text wrapping mid-word in an undersized column
 * (audit/plan-c-new-ui-rebuild.md §3 Phase 0, lens-3 §2.2).
 *
 * Deliberately a separate component from tokens.css's `.eyebrow` rule (which also sets
 * `overflow-wrap: break-word`) — that rule solves a different problem: a short, fixed-vocabulary
 * section label ("ERHOLUNGSZONE") that must never overflow its card at extreme zoom, where
 * breaking mid-word is an acceptable last resort. THIS component is for open-ended, potentially
 * long strings (exercise names, routine titles) where a clipped ellipsis reads better than a
 * mid-word break — the two must never be merged into one shared rule, which is exactly the
 * ambiguity this component exists to remove.
 *
 * The parent element supplying this component must itself be a flex or grid container —
 * `min-width: 0` only overrides a flex/grid item's default auto min-width; it does nothing
 * inside a plain block/inline-block parent.
 */
withDefaults(defineProps<{ lines?: number; as?: string }>(), { lines: 1, as: "span" });
</script>

<template>
  <component
    :is="as"
    class="truncating-label"
    :class="{ 'multi-line': lines > 1 }"
    :style="lines > 1 ? { WebkitLineClamp: lines, lineClamp: lines } : undefined"
  >
    <slot />
  </component>
</template>

<style scoped>
.truncating-label {
  display: block;
  min-width: 0;
  overflow: hidden;
}
.truncating-label:not(.multi-line) {
  white-space: nowrap;
  text-overflow: ellipsis;
}
.truncating-label.multi-line {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  white-space: normal;
}
</style>
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS.

Manual check: temporarily drop `<TruncatingLabel style="max-width: 80px; display: inline-block" as="span">Beinpresse an der Maschine</TruncatingLabel>` inside any flex row in a page during local dev (`pnpm --filter @liftr/client dev`), confirm it clips to `Beinpresse an d…` (ellipsis, no mid-word hyphenation break), then remove the scratch usage before committing.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ui/TruncatingLabel.vue
git commit -m "feat(ui): add TruncatingLabel primitive for exercise-name and open-ended text truncation"
```

---

### Task 4: `ThumbZoneAction` primitive

**Files:**
- Create: `packages/client/src/components/ui/ThumbZoneAction.vue`
- Test: none (pure presentational component) — manual check in Step 2

**Interfaces:**
- Consumes: `--bottom-chrome-h` (Task 2), `--sp3` (existing spacing token).
- Produces: `ThumbZoneAction` component. Prop: `variant?: "sticky" | "inline"` (default `"sticky"`). Default slot holds the CTA markup (typically a `.btn-primary`/`.btn-block`). `sticky` anchors to the bottom of the nearest scrolling ancestor (must be placed inside the page's own scrolling container — typically inside an `<ion-content>`'s slotted content, not outside it, since Ionic pages scroll their own internal shadow-DOM container per `App.vue`'s documented layout). `inline` applies `margin-top: auto` and requires the caller's own wrapping element to already be `display: flex; flex-direction: column`.

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
/**
 * Foundation primitive (2026-09-03 Foundation plan, Task 4) — anchors a screen's primary CTA to
 * the lower/thumb-reachable third, closing lens-3's Low-medium finding of primary CTAs stranded
 * in the top half of a tall viewport away from thumb reach (audit/plan-c-new-ui-rebuild.md §3
 * Phase 0, lens-3 §2.4).
 *
 * variant="sticky" (default): `position: sticky; bottom: ...` relative to the element's nearest
 * scrolling ancestor. Every routed page in this app renders as an Ionic <IonPage>, which scrolls
 * its own internal <ion-content> shadow-DOM container (see App.vue's .top-hud comment for the
 * measured detail) — for sticky positioning to work at all, this component must be placed INSIDE
 * that scrolling container, not as a sibling/ancestor of it. `bottom` reads
 * --bottom-chrome-h (App.vue, Task 2) so the stuck action clears the fixed mobile tab bar instead
 * of sitting underneath it; falls back to 0px on the >=900px desktop layout, where the tab bar is
 * replaced by the sidebar and doesn't need bottom clearance.
 *
 * variant="inline": no fixed/sticky positioning at all — just `margin-top: auto`, which only has
 * an effect when the caller's own immediate wrapper is `display: flex; flex-direction: column`.
 * Use this for a short, non-scrolling screen (an empty state, a single-screen confirmation) where
 * the action should settle at the bottom of the available space rather than float above scrolled
 * content.
 */
withDefaults(defineProps<{ variant?: "sticky" | "inline" }>(), { variant: "sticky" });
</script>

<template>
  <div class="thumb-zone-action" :class="variant">
    <slot />
  </div>
</template>

<style scoped>
.thumb-zone-action.inline {
  margin-top: auto;
}
.thumb-zone-action.sticky {
  position: sticky;
  bottom: calc(var(--bottom-chrome-h, 0px) + var(--sp3));
  z-index: 1;
}
</style>
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS.

Manual check: temporarily wrap a `<button class="btn-primary btn-block">Test</button>` in `<ThumbZoneAction>` inside a page with enough content to scroll (e.g. `ExercisesPage.vue`) during local dev, confirm the button sticks to the bottom of the scrollable content area above the tab bar (not underneath it) while scrolling, then remove the scratch usage before committing.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ui/ThumbZoneAction.vue
git commit -m "feat(ui): add ThumbZoneAction primitive anchoring primary CTAs to the thumb zone"
```

---

### Task 5: Density-mode primitive (`DensityScope` + `useDensityMode`)

**Files:**
- Create: `packages/client/src/composables/useDensity.ts`
- Create: `packages/client/src/components/ui/DensityScope.vue`
- Test: none (pure provide/inject wiring, no branching logic worth a unit test given this repo's client-package convention) — manual check in Step 3

**Interfaces:**
- Consumes: `--density-gap`, `--density-touch-min`, `--density-text-scale` (Task 1).
- Produces: `DensityMode` type (`"train" | "plan" | "progress"`), `useDensityMode(): DensityMode` (reads the nearest ancestor `DensityScope`'s mode, defaulting to `"progress"` when no scope is present — e.g. a component previewed/tested in isolation), `provideDensityMode(mode: DensityMode): void`, and the `DensityScope` component (prop: `mode: DensityMode`, default slot). Later workstreams wrap a screen's root in `<DensityScope mode="train">` (Today/Train screens, Workstream A), `mode="plan"` (routine builder/mesocycle setup, Workstream C), or `mode="progress"` (Ränge/PR ledger, Workstream B) — components inside then read `var(--density-gap)` etc. in their own CSS, or call `useDensityMode()` for JS-level branching (e.g. choosing a different touch-target size class).

- [ ] **Step 1: Create the composable**

```ts
/**
 * Density-mode injection (2026-09-03 Foundation plan, Task 5) — lens-2 §4's three named density
 * levels (Train = lowest density/largest targets, Plan = form-dense, Progress = read-dense),
 * exposed as a reusable provide/inject pair so a screen's density is a single decision made once
 * at its root, not re-derived per component. Components.vue/ui/DensityScope.vue is the component
 * wrapper that calls `provideDensityMode`; most call sites should use that component directly
 * rather than calling `provideDensityMode` by hand.
 */
import { inject, provide, type InjectionKey } from "vue";

export type DensityMode = "train" | "plan" | "progress";

export const DENSITY_KEY: InjectionKey<DensityMode> = Symbol("liftr-density");

/** Reads the nearest ancestor DensityScope's mode. Defaults to "progress" (the read-dense,
 *  middle-ground level) when no DensityScope ancestor exists — e.g. a component rendered outside
 *  any density-scoped screen, or in isolation. */
export function useDensityMode(): DensityMode {
  return inject(DENSITY_KEY, "progress");
}

/** Registers this component's subtree as one density scope. Called by DensityScope.vue —
 *  most call sites should reach for that component instead of calling this directly. */
export function provideDensityMode(mode: DensityMode): void {
  provide(DENSITY_KEY, mode);
}
```

- [ ] **Step 2: Create the wrapper component**

```vue
<script setup lang="ts">
/**
 * Foundation primitive (2026-09-03 Foundation plan, Task 5) — wraps a screen (or a section of
 * one) in a density mode, setting `data-density` so tokens.css's `[data-density="..."]` rules
 * (Task 1) cascade `--density-gap`/`--density-touch-min`/`--density-text-scale` to every
 * descendant, and calling `provideDensityMode` (composables/useDensity.ts) so descendants can
 * also branch in JS via `useDensityMode()`. `display: contents` keeps this element itself out of
 * layout — it exists purely to carry the attribute/provide, not to introduce an extra box.
 */
import { provideDensityMode, type DensityMode } from "../../composables/useDensity";

const props = defineProps<{ mode: DensityMode }>();
provideDensityMode(props.mode);
</script>

<template>
  <div class="density-scope" :data-density="mode">
    <slot />
  </div>
</template>

<style scoped>
.density-scope {
  display: contents;
}
</style>
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS.

Manual check: temporarily wrap `WorkoutPage.vue`'s root template content in `<DensityScope mode="train">...</DensityScope>` during local dev, add a scratch `border: 2px solid red` on some descendant using `gap: var(--density-gap)`, confirm the gap visibly widens relative to the same element outside the scope (falls back to the `:root` "progress" default, `--sp3`), then remove the scratch usage before committing.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/composables/useDensity.ts packages/client/src/components/ui/DensityScope.vue
git commit -m "feat(ui): add DensityScope/useDensityMode primitive for lens-2's three density levels"
```

---

### Task 6: Motion/haptic primitive verification and cross-workstream contract hardening

**Files:**
- Modify: `packages/client/src/lib/haptics.ts:1-11` (header comment only)
- Modify: `packages/client/src/composables/useCelebrate.ts:1-7` (header comment only)
- Test: none (see Global Constraints — no new client-package test infra; verification is the manual table in Step 2)

**Interfaces:**
- Consumes: `packages/client/src/composables/useCountUp.ts`'s existing `useCountUp(target: Ref<number>, durationMs = 600): { value: Ref<number> }`, `packages/client/src/composables/useCelebrate.ts`'s existing `useCelebrate(): { activeIndex: Ref<number>, running: Ref<boolean>, run: (beats: CelebrateBeat[]) => Promise<void>, skip: () => void }`, `packages/client/src/lib/haptics.ts`'s existing `haptics.tap()`/`haptics.bump()`/`haptics.success()`.
- Produces: no new symbols — this task is documentation-only, confirming (not changing) the public shape every later workstream already relies on. Explicitly recorded here because five other plans consume these exact names/signatures and none of them re-derive this file.

**Important — this task does NOT rebuild `useCountUp`/`useCelebrate`.** Both composables already implement Plan C §3 Phase 0's spec exactly as written: `useCountUp` is an rAF roll-up with ease-out-cubic easing at a 600ms default, collapsing to an instant jump under `prefers-reduced-motion` (`useCountUp.ts:25-28`). `useCelebrate` is a sequential skippable beat-holder defaulting to 1400ms/beat (`useCelebrate.ts:57`, the `beat.holdMs ?? 1400` default), collapsing every hold to 0ms under `prefers-reduced-motion` (`useCelebrate.ts:17`, `wait()`'s `effectiveMs` branch). `lib/haptics.ts` already implements the exact three-tier vocabulary (`tap`/`bump`/`success`) Plan C names, already gated on `prefers-reduced-motion` in addition to `Capacitor.isNativePlatform()` (`haptics.ts:19-21`, `canHaptic()`). Re-implementing any of this would risk a second, conflicting version — this task instead (a) documents the cross-workstream contract explicitly in both files so it's discoverable without reading every consumer, and (b) runs the verification Plan C's success criterion asks for, in the form this repo's convention actually supports (see Global Constraints).

- [ ] **Step 1: Add the cross-workstream contract note to `haptics.ts`**

Current header (lines 1-11):

```ts
/**
 * Haptic feedback wrapper (engagement rework W1). Thin layer over @capacitor/haptics — silent
 * no-op on web (the plugin itself no-ops there, this just avoids importing/calling into it on
 * platforms that can't vibrate) and under prefers-reduced-motion (a physical jolt is exactly
 * the kind of "motion" that preference is meant to suppress, even though it isn't visual).
 *
 * Three calls, matched to the three moments in the plan that earn a physical tap:
 *   tap()     — a set was logged (the 30x-per-session action)
 *   bump()    — an exercise was completed
 *   success() — a PR, rank-up, or workout finish
 */
```

Append this paragraph immediately after it (before the imports):

```ts
/**
 * Foundation plan contract (2026-09-03): this is the app's ONLY haptic vocabulary. Every later
 * workstream's animated moment (Workstream A's set-logged/exercise-advance motion, Workstream
 * B's Finish Sequence beats and rank-up stamp) must map onto one of these three calls — no
 * workstream may introduce a fourth tier or call @capacitor/haptics directly. If a moment doesn't
 * clearly fit tap/bump/success, it does not get a haptic, per plan-c-new-ui-rebuild.md §2's
 * restraint stance (a gamification layer does not require constant physical feedback).
 */
```

- [ ] **Step 2: Add the haptic-wiring pattern note to `useCelebrate.ts`**

Current header (lines 1-7):

```ts
/**
 * Timed "beat" sequencer (engagement rework W1). Used by FinishSequence's three beats
 * (Rangaufstiege / Serie / Fortschritt). Deliberately a plain
 * async step-runner, not an animation library — each beat is just "show this, wait, allow an
 * early tap to skip." Respects prefers-reduced-motion by collapsing every wait to effectively
 * zero (the content still renders, in order, just without the held pause).
 */
```

Append this paragraph immediately after it:

```ts
/**
 * Haptic wiring is the CALLER's responsibility, not this composable's — this file stays
 * UI/feedback-agnostic. The existing pattern (components/workout/FinishSequence.vue: a `watch`
 * on `activeIndex` that fires `haptics.success()` only when `leveledUp` is true) is the reference
 * implementation later workstreams should copy: watch `activeIndex`, branch on which beat it is
 * and what that beat's data actually contains, call the matching lib/haptics.ts tier from there.
 */
```

- [ ] **Step 3: Manual verification table (Plan C's "reduced-motion snapshot test" success criterion, executed as a description-based check per this repo's client-package convention)**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS.

With OS-level "reduce motion" enabled (or via devtools' "Emulate CSS prefers-reduced-motion: reduce"), exercise the app locally (`pnpm --filter @liftr/client dev`) and confirm:

| Primitive | Reduced-motion behavior | Where to observe |
|---|---|---|
| `useCountUp` | Value jumps straight to target, no visible roll-up frames | Any XP/level bar (App.vue's `.level-chip`, FinishSequence's level display) |
| `useCelebrate` | Each beat still renders in order, but with no perceptible hold — sequence completes near-instantly unless manually skipped/advanced | FinishSequence.vue during a workout finish with a rank-up |
| `haptics.*` | No physical feedback fires (verify via `canHaptic()`'s `prefersReducedMotion()` check — on a native build, no vibration should occur when reduced-motion is on, independent of the platform check) | Log a set / finish a workout on a native Capacitor build with reduced-motion on |
| CSS `--dur-*` tokens | All collapse to 1ms (`motion.css:29-35`) | Any `.pop-in`/`.stamp-in`/`.bar-fill` transition — should appear to snap, not animate |

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/haptics.ts packages/client/src/composables/useCelebrate.ts
git commit -m "docs(motion): document cross-workstream haptic-tier and beat-wiring contract"
```

---

### Task 7: Final integration verification

**Files:**
- Test: none new — this task runs the full verification suite across everything Tasks 1-6 touched.

**Interfaces:**
- Consumes: everything produced by Tasks 1-6.
- Produces: nothing new — this is the gate before other workstreams start consuming this plan's output.

- [ ] **Step 1: Full client typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS, zero errors.

- [ ] **Step 2: Re-run Task 2's nav-shell QA table one more time against the merged state**

Confirm all four rows (195px/320px/390px/1024px+) still pass after every task's changes have landed together, not just Task 2's own change in isolation — Tasks 3-6 don't touch nav CSS, but this is the plan's actual success-criterion gate, so it's re-checked once at the end rather than trusted from Task 2 alone.

- [ ] **Step 3: Confirm every new primitive's export surface matches what this plan's Interfaces sections promised**

Grep-check (or manually open) each new file and confirm the exported names match exactly:
- `TruncatingLabel.vue` — props `lines?: number`, `as?: string`.
- `ThumbZoneAction.vue` — prop `variant?: "sticky" | "inline"`.
- `useDensity.ts` — exports `DensityMode`, `DENSITY_KEY`, `useDensityMode`, `provideDensityMode`.
- `DensityScope.vue` — prop `mode: DensityMode` (required, no default).

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS (a mismatched prop name/type here would already fail typecheck, but confirm this explicitly since five other plans depend on these exact names).

- [ ] **Step 4: Commit** (only if Step 3 required a fix; otherwise this task has no commit of its own — Tasks 1-6 already committed everything)

```bash
git add -A
git commit -m "fix(foundation): reconcile primitive export surface with Foundation plan interfaces"
```

---

## Self-Review Notes (per superpowers:writing-plans)

**Spec coverage:**
- Design tokens beyond Nebula (touch-target, spacing/density) — Task 1. Color-role naming was checked against the live `tokens.css` (`--on-blue-lo`, `--k-*-text`, tier `--b1/--b2/--b3` aliases, single-meaning Nebula-vs-tier separation documented in the file's own comments) and found already complete — no task re-derives it, since doing so would duplicate work already merged.
- Five-zone nav shell + narrow-viewport fallback + desktop sidebar reflow — Task 2 (hardening only; the shell itself and its 195px fix are already live, confirmed against `workplan-v1.md` §1.1's own verification note).
- `ThumbZoneAction` — Task 4.
- Density-mode primitive — Tasks 1 (tokens) + 5 (component/composable).
- `TruncatingLabel` — Task 3.
- `useCountUp`/`useCelebrate` rebuild with three-tier haptic vocabulary + reduced-motion gating that silences haptics — Task 6 (verification/documentation; both composables and the haptic vocabulary were found already fully implemented to spec, including the reduced-motion-silences-haptics behavior Plan C explicitly calls out).

**Placeholder scan:** every code block above is complete, real code against real current file line numbers (verified by reading each file in full before drafting its diff) — no TBD/TODO, no "add appropriate handling," no unshown "similar to Task N" code.

**Type/interface consistency:** `DensityMode` is defined once (`useDensity.ts`) and imported everywhere else it's used (`DensityScope.vue`); `ThumbZoneAction`'s `variant` prop and `TruncatingLabel`'s `lines`/`as` props are named identically between their Interfaces block and their Step 1 code. `--touch-target-min`, `--bottom-chrome-h`, and the three `--density-*` tokens are each defined exactly once (Task 1 or Task 2) and only ever consumed (never redefined) by later tasks.

---

## Open questions / assumptions for a human to confirm before executing

1. **Plan C's literal success criterion says "a reduced-motion snapshot test."** This plan does not add one — per the caller's explicit brief, this repo's client package has no Vitest convention to extend, so Task 6 substitutes a written manual-verification table. If automated snapshot coverage is actually wanted here, that's a scope decision (introducing Vitest + jsdom to the client package) bigger than this plan currently takes on, and should be confirmed before Task 6 executes.
2. **Lens-2 §3.1's "Train appears only while `isActive` is true, redirecting to Today otherwise" is NOT how the shipped nav shell behaves** — `/workout` is always a visible, static nav item; `WorkoutPage.vue` itself renders a "not started" state (with the Läufe/Workout switcher) rather than the nav item disappearing. This looks like a deliberate, already-shipped product decision, not an oversight, so this plan treats it as out of scope (a nav-visibility/IA change, not a primitive) rather than "fixing" it back to the blind lens-2 spec. Flagging so a human can confirm that reading is correct before any later workstream assumes otherwise.
3. **`--bottom-chrome-h`'s value (64px) is a deliberate small margin over measured content height, not a live re-measurement.** If a later workstream changes `.tab-bar`/`.tab-link` sizing, this constant should be revisited — it isn't self-updating.
