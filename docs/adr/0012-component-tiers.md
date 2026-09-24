# 0012. Tier the client component tree: base -> patterns -> feature -> pages

**Date:** 2026-09-24
**Status:** Accepted

## Context

`packages/client/src/components/` grew without a tier discipline: `components/ui/` became an
everything-drawer mixing genuine zero-behavior primitives (`AppIcon`), multi-region layout
components (`BasePage`, `SheetModal`), and page-specific components that only happened to be
generic-looking (`ErholungszoneCard`, `SyncIndicator`). Several real UI patterns — chips/badges,
generic list-rows, icon-buttons, inline empty-notes, form inputs — had no shared component at all,
so each call site hand-rolled its own markup and CSS, with adoption of the base components that did
exist (`BasePage`, `BaseHeader`) partial (6/14 and 3/14 pages respectively). A new contributor
(human or agent) had no rule to consult for "where does this file go" or "should this become a
shared component."

## Decision

Every component under `packages/client/src/components/` sits in exactly one of four tiers,
decidable from its imports alone:

```
base/      One control, one element-ish thing. ZERO composition of other Liftr components.
           Default slot only (+ at most one adornment slot). No store/service import. No
           domain vocabulary. May use tokens.css utility classes internally.

patterns/  Composes >=1 base component, OR defines a multi-region slot contract (leading/
           default/trailing, head/body/actions/footer). Still zero domain vocabulary, zero
           store/service import. Layout and chrome live here.

<feature>/ Knows a domain noun (exercise, routine, run, rank, workout, route, onboarding).
           May import stores/services/composables. Composed from patterns + base.

pages/     Routed, 1:1 with router.ts. Composed from features + patterns + base.
```

The discriminator is always answerable by reading a file's imports: does it compose another Liftr
component, and does it say a domain word? `Chip` -> `base/` (composes nothing). `IconButton` ->
`patterns/` (it's `Button` + `AppIcon`).

Composition over inheritance: a base/pattern component exposes structure via props + slots +
emits only — never mixins, `extends`, or render-function base classes. A higher tier wraps and
configures a lower one, the way `BasePage.vue` already wraps `BaseHeader.vue`. Shared *behavior*
(not presentation) lives in composables (`useConfirmTap`, `useCardMenu`), consumed via a prop —
a component never grows its own copy of that logic.

A folder under `components/` is keyed by a domain noun, never a sub-flow, and never holds fewer
than 2 files — `routine-wizard/` and `routine/` dissolve into one `routine/` folder, for example.

No barrel `index.ts` files in `base/`/`patterns/` — direct file imports only, to preserve
per-route code-splitting.

Global `tokens.css` utility classes (`.btn-icon`, `.panel`, `.eyebrow`, …) are unchanged and stay
in `tokens.css`; they become the internal implementation detail of the new tiered components
rather than something a call site reaches for directly.

## Consequences

- `components/ui/` no longer exists as a folder: its 24 files were redistributed by the rule
  above — `base/` (`AppIcon`, `TruncatingLabel`, plus the new `Chip`/`Button`/`Input`/`Select`/
  `EmptyNote`), `patterns/` (`BaseHeader`, `BasePage`, `SheetModal`, `DrillInScreen`,
  `CardListScreen`, `CardGrid`, `ListCard`, `StatTile`, `TabSwitcher`, `NumberStepper`,
  `CollapsibleCard`, `InfoToggle`, `EmptyStateCard`, plus the new `IconButton`/`ListRow`/
  `FormField`), `exercise/` (`MuscleFigure`), a new `overview/` folder (`ErholungszoneCard`,
  `BodyweightTrend` — OverviewPage's own two bespoke widgets), and a new `shell/` folder
  (`ToastHost`, `SyncIndicator`, `ServerGate`, `AuthGate`, `OnboardingGuide` — the app-chrome
  singletons App.vue mounts once at the root). `AppDropdownMenu.vue` was deleted outright (zero
  references, superseded by `useCardMenu`/`ListCard`'s own menu slot).
- `components/routine-wizard/` and `components/route-wizard/` no longer exist either: their
  contents moved into `routine/` and `route/` respectively, per the singleton-folder rule (a
  folder is keyed by domain noun, never a sub-flow).
- ~5 previously pure-CSS duplication categories (chips/badges, list-rows, icon-buttons, inline
  empty-notes, form inputs) become real shared components instead of copy-pasted markup, even
  though this codebase's usual convention for zero-behavior patterns is a `tokens.css` utility
  class — uniformity with the rest of the component tree was judged worth diverging from that
  convention here.
- The rule is deliberately mechanical (readable from imports, not from judgment about "how
  reusable" something feels) so that where a new component belongs is never a per-PR debate.
