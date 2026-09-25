# Adding or maintaining a language

Liftr supports German and English today. This walks through both maintaining an existing
translation and adding a new one — written for someone who has never opened the code. See
[i18n-and-localization.md](../concepts/i18n-and-localization.md) for the reasoning behind how this
is set up, if you want the "why" as well as the "how".

## Maintaining an existing language

Every UI string lives in one file per language:
[`packages/client/src/locales/de.yaml`](../../packages/client/src/locales/de.yaml) (German, the
source of truth) and [`en.yaml`](../../packages/client/src/locales/en.yaml) (English). Open the
one you're translating into and edit the text to the right of each `:` — leave the keys (the part
before each `:`) and anything inside `{curly braces}` exactly as they are; those are placeholders
the app fills in with a real value (a name, a number) at runtime.

```yaml
profile:
  appearance:
    # Label above the language chip row in Profil → Darstellung, next to the theme chips.
    language: Sprache
workout:
  setCount: "{n} Satz | {n} Sätze"
```

A `#` line is a comment left for you — context about where a string appears or why it's phrased a
particular way. They're never part of what's shown in the app; skip them.

A line like `setCount` above with a `|` in it is a **plural** — two (or more) versions of the same
sentence for different counts (vue-i18n picks the right one automatically based on a number the
app passes in). Translate each side of the `|` to the correct form for your language; some
languages need more or fewer plural forms than German's two, and that's fine — see
[vue-i18n's pluralization docs](https://vue-i18n.intlify.dev/guide/essentials/pluralization) if
your language needs a third form.

Exercise names and how-to instructions are separate — see
[Exercise content](#exercise-content-names-and-how-to-instructions) below.

## Adding a new language

1. **Copy the source file.** Duplicate `packages/client/src/locales/de.yaml` to
   `<code>.yaml` in the same folder, where `<code>` is the language's
   [ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) (e.g. `fr` for
   French, `es` for Spanish).
2. **Translate it.** Same rules as above — text after each `:`, plurals on both sides of `|`,
   leave `{placeholders}` and comments alone.
3. **Register the code.** Two one-line edits, both in `packages/client/src`:
   - `stores/localeStore.ts`: add your code to the `LOCALES` array and to the `Locale` type.
   - `i18n.ts`: add an `import <code> from "./locales/<code>.yaml";` line and add it to the
     `messages` object, the same way `de`/`en` are already there.

   This is the one part of adding a language that touches code, and it's deliberately small and
   mechanical — copy the existing `en` lines and swap the language code.
4. **Add exercise content** — see the next section.
5. **Check your work.** From the repo root:

   ```bash
   pnpm i18n:check
   ```

   This reports every key your new file is missing (or has extra, which usually means a typo in a
   key name) compared to `de.yaml`, plus any `{placeholder}` mismatch — a translation missing a
   `{count}` the German original has, for example. Nothing else is required; a clean run means
   your translation is complete and consistent.

## Exercise content (names and how-to instructions)

Exercise names and instructions are handled separately from the rest of the app's copy, because
they're generated from the exercise catalog rather than hand-maintained UI strings:

- Add a `name<Code>` field (e.g. `nameFr`) to every entry in
  [`tools/catalog/curated.yaml`](../../tools/catalog/curated.yaml) — see
  [adding-an-exercise.md](adding-an-exercise.md) for the catalog's own format.
- How-to instructions are built from a small set of reusable templates (per movement pattern and
  muscle group, not one string per exercise) in
  [`packages/ingest/src/generateHowTo.ts`](../../packages/ingest/src/generateHowTo.ts) — this one
  does need a developer, since it's TypeScript rather than a translation file: add a
  `MUSCLE_<CODE>`/`PATTERN_TEMPLATE_<CODE>` table pair alongside the existing `_DE`/`_EN` ones and
  register them in the file's `LOCALES` map, following the same structure.
- Run `pnpm ingest --catalog` to regenerate `packages/client/src/locales/exercises.<code>.json`
  from what you just added.

**Never hand-edit `exercises.de.json`/`exercises.en.json` (or your new language's equivalent)
directly** — they're build output. Re-run the ingest command instead; your edits to a generated
file would just be silently overwritten next time someone else runs it.

## What you never need to touch

Nothing about adding or updating a translation requires understanding Vue, TypeScript, or how the
app is built — the files above are the entire surface. If you find yourself needing to edit a
`.vue` or `.ts` file to make a translation "fit" (a string too long for its space, say), that's a
layout issue worth flagging to a developer rather than something to work around in the translation
itself.
