# 0013. Localization: German source of truth, English second locale, YAML hand-maintained packs

**Date:** 2026-09-25
**Status:** Accepted

## Context

Liftr's UI copy was German, hardcoded inline across ~80% of `packages/client/src` — vue-i18n was
already a dependency and wired up (`i18n.ts`, registered in `main.ts`), but only nav labels and
exercise names actually went through it; everything else bypassed the machinery entirely. Adding
English meant deciding, all at once: where a translated string's source of truth lives, what
format a non-developer can maintain, how a locale is chosen and remembered, and how the app's
generated content (the exercise catalog) and shared package (`@liftr/shared`, which the server
also depends on) fit a client-only translation library.

## Decision

**German stays the source of truth.** `packages/client/src/locales/de.yaml` is authoritative;
`en.yaml` must carry every key `de.yaml` has (enforced by `pnpm i18n:check`,
`scripts/i18n-check.mjs`) but a genuinely missing English value falls back to German at runtime
rather than showing a raw key or breaking the page.

**Two kinds of locale pack, two formats, deliberately.** Hand-maintained UI copy
(`locales/{de,en}.yaml`) is YAML, compiled at build time by `@intlify/unplugin-vue-i18n` — YAML's
inline `#` comments let a key carry its own context ("shown on the empty workout list"), which is
what actually makes a pack self-documenting for a translator who has never opened the code. JSON
has no comments and a stray trailing comma breaks the build. Generated content
(`locales/exercises.{de,en}.json`) stays JSON: it's build output from `tools/catalog/curated.yaml`
(`packages/ingest/src/generateI18n.ts`), never hand-edited, and `curated.yaml` — itself YAML — is
the real maintainer-facing surface for exercise names/instructions.

**Locale choice is a client-only, per-device preference, not a per-user server setting.**
`stores/localeStore.ts` mirrors the existing `themeStore.ts` pattern exactly: a module-level
`getStoredLocale()`/`setStoredLocale()` pair backed by `localStorage`, read before Pinia exists
(needed at `i18n.ts` module-init time, before authentication). First launch detects
`navigator.language`, defaulting to German; an explicit choice in Profil → Darstellung overrides
it permanently. This was the same reasoning `xpStore.ts`'s `showXp` flag already established:
purely a rendering preference needs to be readable pre-auth, and a synced per-user setting isn't
worth the server round-trip for something this low-stakes.

**Shared code (`@liftr/shared`) cannot call `t()`** — it has no dependency on vue-i18n and the
server (which also depends on `@liftr/shared`) has no locale concept at all. Where shared code
held locale-dependent copy (`share/layout.ts`'s share-card text, the German decimal comma), it
now takes an explicit `locale` parameter instead, defaulting to `"de"` so a caller that doesn't
pass one keeps its original behavior. Where a *server* response itself carried finished German
prose (`deviceLabel.ts`'s device summary, a Health Connect import error message), the server was
changed to return structured data or a machine-readable error code instead, and the client
composes and translates the display string — the server should never bake a language choice into
a response body.

**A label lookup table that returns pre-resolved strings goes stale on a locale switch, so it
can't exist.** Several modules (`lib/muscles.ts`, `lib/equipmentIcons.ts`, `lib/tierIcons.ts`,
`shared/workout/setKind.ts`) exported a `Record<Slug, string>` of German display names, justified
at the time as "this app is German-only, rather than routing through the full i18n machinery for
a handful of fixed nouns." Every one of those became a function that calls `t()` at the point of
use instead of a static table — a value computed once at module load never re-evaluates when the
user flips the language chip, whereas a function call always reads the current locale.

## Consequences

- Adding a third language needs exactly two one-line code edits (a `LOCALES` array entry in
  `localeStore.ts`, an import in `i18n.ts`) plus a translated `.yaml` copy — everything else is
  configuration a non-developer edits directly. See `docs/guides/adding-a-language.md`.
- The `settings` table (`packages/db/src/schema.ts`) is a per-user JSON k/v store with a
  composite primary key, so a synced `locale` preference could be added later with zero schema
  migration if per-account (rather than per-device) language ever becomes worth the server
  round-trip — deliberately not built now.
- The PWA manifest (`vite.config.ts`) can't follow the runtime locale a user picks in-app; it's
  static build output evaluated once, so the install prompt and OS-level app name stay German
  (`lang: "de"` is set explicitly to be honest about this rather than silently wrong).
- Every existing German-string test assertion across the client test suite (~190 literals across
  50+ files) kept passing unchanged through the whole migration, because extraction was disciplined
  to be byte-identical: `{{ t('key') }}` renders the same trimmed string the hardcoded literal did.
  A test going red during the migration was always a real wording drift, never expected churn.
