# Localization

Liftr supports German (the original, and the source of truth) and English, via
[vue-i18n](https://vue-i18n.intlify.dev/). This document covers how a string gets from source code
to a translated locale pack, why the pack is split the way it is, and the places that can't just
call `t()`. For the actual step-by-step of adding a new language, see
[the guide](../guides/adding-a-language.md) instead — this document is the "why", not the
"how". See also [ADR 0013](../adr/0013-localization.md) for the decision record this implements.

## The locale resolution chain

`packages/client/src/i18n.ts` creates the vue-i18n instance at module load, with `de` as
`fallbackLocale`: a key genuinely missing from `en.yaml` still renders (the German text), it just
never shows a raw key or breaks the page. The initial locale comes from
`packages/client/src/stores/localeStore.ts`'s `getStoredLocale()` — a plain, Pinia-independent
function (mirroring `themeStore.ts`'s `getStoredTheme()`) that checks `localStorage` first, then
`navigator.language`, defaulting to German. It has to be plain because `i18n.ts` calls it before
Pinia exists. An explicit choice in Profil → Darstellung calls `setStoredLocale()`, which updates
`localStorage`, flips `i18n.global.locale.value`, and sets `<html lang>` — nothing about locale
selection touches the server; it's a per-device preference, the same category as theme.

## Two kinds of locale pack

`packages/client/src/locales/` holds two distinct pairs of files, deliberately in two different
formats:

- **`{de,en}.yaml`** — hand-maintained UI copy, one nested key per string, German as the source of
  truth. YAML because a translator can leave an inline `#` comment explaining a key's context
  ("shown on the empty workout list") without touching code — something JSON can't do, and the
  actual point of choosing it over the more common JSON convention. Compiled to vue-i18n's message
  format at build time by `@intlify/unplugin-vue-i18n` (registered in both `vite.config.ts` and the
  root `vitest.config.ts` — the test suite needs the plugin too, since
  `tests/client/helpers/mountWithProviders.ts` imports the real i18n instance).
- **`exercises.{de,en}.json`** — generated. `packages/ingest/src/generateI18n.ts` produces both
  from `tools/catalog/curated.yaml`'s `nameDe`/`nameEn` fields and `generateHowTo.ts`'s
  locale-parameterized instruction templates, run via `pnpm ingest --catalog`. **Never hand-edit
  these** — re-run ingest instead. `curated.yaml` (itself YAML, with the same commentability) is
  the real maintainer-facing surface for exercise content, not these files.

Both pairs are checked for key parity by `pnpm i18n:check` (`scripts/i18n-check.mjs`), which also
compares `{placeholder}` names between a key's German and English values — a translation missing a
`{count}` the source has is a silent runtime bug otherwise. The same check runs as part of
`pnpm test` (`tests/scripts/i18nCheck.test.ts`), so a PR that adds a German string without its
English counterpart fails CI, not just a manual step someone might forget.

## Key convention

Nested, one section per feature area, generally mirroring the source directory it covers
(`profile.*` for `pages/ProfilePage.vue`, `rank.*` for `components/rank/*`). A `common:` section
holds only strings genuinely reused three or more times across unrelated screens (`common.save`,
`common.exerciseCount`) — two call sites with identical wording is usually still left
component-scoped rather than force-merged, since a coincidental match today doesn't guarantee the
two screens' copy should evolve together later. Plurals use vue-i18n's pipe syntax
(`"{n} Satz | {n} Sätze"`, called as `t(key, n)`) rather than a hand-rolled ternary in the
template.

## Where `t()` can't be called

- **Plain `.ts` modules with no component instance** (composables not guaranteed to run inside a
  component's `setup()`, `lib/` helpers, `router.ts`) import `i18n.ts`'s plain exported
  `t = i18n.global.t` instead of the `useI18n()` composable, and call it at the point of use —
  never cache the result in a module-level constant, since a value computed once at import time
  never re-evaluates when the user switches language. Several label lookup tables
  (`lib/muscles.ts`, `lib/equipmentIcons.ts`, `lib/tierIcons.ts`) used to export a
  `Record<Slug, string>` of pre-resolved German names for exactly this reason — each is now a
  function that calls `t()` internally.
- **`@liftr/shared`** has no dependency on vue-i18n at all, and the server (which also depends on
  `@liftr/shared`) has no locale concept. Where shared code holds locale-dependent copy
  (`share/layout.ts`'s share-card text), it takes an explicit `locale` parameter instead of
  calling `t()`, defaulting to `"de"`.
- **The server** never sends finished, language-baked prose in a response body — a response that
  did (`deviceLabel.ts`'s device summary, a Health Connect import failure) was changed to send
  structured data or a machine-readable error code, with the client composing and translating the
  display string. `packages/client/src/lib/errorMessages.ts` maps server error codes to i18n keys
  for exactly this.
- **`router.ts`'s `meta.title`** holds an i18n *key*, not translated text — the route table is
  evaluated once at module load, before a locale is even known, so it can't hold a pre-resolved
  string. `App.vue`'s `pageTitle` computed calls `t(route.meta.title)`.

## Testing

`tests/client/helpers/mountWithProviders.ts` installs the real i18n instance, forced to `de`, so
existing text assertions match production German copy without a rewrite — see
[writing-tests.md](../guides/writing-tests.md) for the convention this depends on. A handful of
test files construct their own `mount()` outside that helper (needing real named routes, or
driving a composable directly via `withSetup`); each resets `i18n.global.locale.value = "de"` in
its own `beforeEach`, since jsdom's `navigator.language` always reports `"en-US"` and would
otherwise default the locale to English for the rest of that test file.
