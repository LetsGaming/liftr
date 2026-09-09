# Adding an exercise to the catalog

Liftr's exercise catalog is a single hand-curated file:
[`tools/catalog/curated.yaml`](../../tools/catalog/curated.yaml). This walks through adding a new
entry to it and getting it ingested into the database correctly.

Read the header comment at the top of `curated.yaml` in full before editing — it's the
authoritative spec for every field below, and it's kept up to date as the catalog's conventions
evolve (most recently: the 2026-09 photo-sourcing correction documented there). What follows is a
practical walkthrough, not a replacement for it.

## 1. Understand the trust-tier system

Every entry has a `trust` value, and it determines how you fill in the rest of the entry:

- **`real`** (trust: real) — the 9 "anchor" exercises only: `back-squat`, `bench-press`,
  `deadlift`, `overhead-press`, `barbell-row` (loaded lifts with real OpenPowerlifting-derived
  standards, see `packages/shared/src/rank/defaultStandards.ts`'s `ANCHOR_STANDARDS`), and
  `pushup`, `pullup`, `chinup`, `dip` (bodyweight movements with real published rep-norm tables,
  `REP_STANDARDS`). Anchors **omit `anchor`/`ratio` entirely**. You will almost never add a new
  anchor — see [Declaring a new anchor](#declaring-a-new-anchor-rare) below.
- **`derived`** — a close variant of an anchor movement (e.g. `front-squat` is `derived` from
  `back-squat`).
- **`synthetic`** — the isolation/accessory long tail, further from the anchor movement.

For everything that isn't an anchor, you declare:

```yaml
anchor: back-squat # must be one of the 9 anchor slugs
ratio: 0.85 # load (or rep-count, for bodyweight anchors) multiplier
```

The rank/standards engine applies your `ratio` to the anchor's real threshold table to synthesize
a standard for your new exercise (this is the "synthetic-standard method" the catalog header
refers to). Ratios are **starting estimates, not measured values** — pick something defensible by
comparing typical relative loading against the anchor movement (e.g. a goblet squat is nowhere
near as loadable as a full back squat, hence `ratio: 0.35` for `goblet-squat` vs. `0.85` for
`front-squat`), and expect it to get tuned later. They're data, not code — you can always come back
and adjust the number without touching any application logic.

## 2. Fill in the rest of the entry

Field-by-field, per `packages/ingest/src/catalogSchema.ts` (the Zod schema `curated.yaml` is
validated against) and the header comment:

- `slug` — unique, kebab-case, stable (used as a foreign key everywhere; don't rename an existing
  one casually).
- `nameDe` / `nameEn` — display names.
- `equipment` — one of this app's closed 10-value equipment vocabulary
  (`@liftr/shared`'s `Equipment` type). You can leave this `null`/unset: `ingestCatalog.ts` will
  auto-resolve it from free-exercise-db/wger via your `freeExerciseDbId`/`wgerId`. Set it by hand
  only when your entry needs a specific override.
- `movementPattern` — e.g. `squat`, `push-horizontal`, `pull-vertical`, `hinge`.
- `primaryMuscles` / `secondaryMuscles` — **must** come from wger's 15-muscle taxonomy (see the
  slug list in `packages/ingest/src/muscles.ts`, e.g. `quads`, `glutes`, `chest`, `triceps`,
  `lats`, `traps`, `abs`, `biceps`, `front-delts`...). This was deliberately narrowed from a looser
  17-tag set — if the muscle you want to tag isn't in that list, there's no highlight shape for it
  on the muscle-map SVG, and it's better to leave the field out than invent a new tag.
- `isBodyweight` / `bodyweightLeverage` — set for bodyweight movements; `bodyweightLeverage` is
  the fraction of bodyweight the movement effectively loads (see existing entries like `pushup:
  0.64`, `pullup`/`chinup`/`dip: 1`).
- `freeExerciseDbId` — the join key into free-exercise-db's photo set. **This must be
  hand-verified**, not auto-accepted from a fuzzy match: the catalog header explicitly warns that
  auto-accepting the top fuzzy match has produced wrong photos before (e.g. "reverse-fly" nearly
  matched "Reverse Crunch"). Look up the real entry in free-exercise-db's `dist/exercises.json`
  and confirm it's actually a photo of your exercise before pasting the id in. If there's truly no
  matching open-licensed photo, it's fine to leave this unset — check `wgerImageId` as a fallback
  first (see the schema comment for when that applies), and only if neither exists does the
  exercise fall back to the placeholder thumbnail.
- `wgerId` — populated by re-running `packages/ingest/src/matchWgerIds.ts` after adding your
  entry (exact-name lookup, falling back to fuzzy token-overlap scoring). Same rule as
  `freeExerciseDbId`: hand-check the script's guess before trusting it, especially anything below
  a clear high-confidence match.
- `requiresEquipment` — only set this if the rule-based `deriveRequirements()` fallback would get
  your exercise's equipment requirements wrong (see the schema comment for an example: bench-press
  needs plates + a bench, not just what the `equipment` field alone implies).

## 3. Declaring a new anchor (rare)

Only do this if you're adding a movement with a genuine, real external standards table behind it
(an OpenPowerlifting-style load table, or a published bodyweight rep-norm table) — not just
because an exercise "feels important." This means also updating
`packages/shared/src/rank/defaultStandards.ts` with the real standard data. If you're not sure,
you almost certainly want `derived`/`synthetic` off an existing anchor instead.

## 4. Run the ingest

After editing `curated.yaml`, re-ingest so your changes land in the database. From the repo root:

```bash
pnpm ingest --catalog
```

This is the `@liftr/ingest` CLI's catalog step (see
[`packages/ingest/src/index.ts`](../../packages/ingest/src/index.ts) for the full flag list —
`--all`, `--catalog`, `--images`, `--muscles`, `--standards`, `--run-standards`; no flags at all is
equivalent to `--all`). `--catalog` re-parses `curated.yaml`, upserts muscles + exercises +
exercise-muscle links, resolves equipment, and regenerates the German exercise-name i18n file
(`packages/client/src/locales/exercises.de.json`). It's idempotent — safe to re-run after further
edits.

If you added a `freeExerciseDbId`/`wgerImageId`, also run:

```bash
pnpm ingest --images
```

to pull down the actual photo. If you changed a `ratio`/`anchor`/`trust`, you generally want:

```bash
pnpm ingest --standards
```

to regenerate that exercise's strength-standard thresholds (the catalog header calls this out
directly: "adjust here and re-run `pnpm ingest --standards`"). When in doubt, running the whole
chain (`pnpm ingest --all`, or the ingest step alone) is always safe — every step is idempotent.

`--run-standards` is unrelated to this guide's catalog entries (running has no per-exercise
standards) — it (re)writes the whole `run_standards` table from
[`packages/shared/src/rank/runStandards.ts`](../../packages/shared/src/rank/runStandards.ts)'s
`buildRunStandards()`. It's already covered by `--all`/`pnpm bootstrap`, so you only need it by
hand if you edit that file's running-category anchor data directly.

Note: never invoke ingest from the running server — it's a manual, standalone CLI (see the
docblock at the top of `index.ts`).

## 5. Verify

- Run the ingest test suite as a sanity check that your YAML is well-formed and nothing broke:

  ```bash
  pnpm test tests/ingest
  ```

  This covers catalog-schema validation, catalog ingestion, image ingestion, standards ingestion,
  and the wger-id matcher (see `tests/ingest/` for the individual files).
- Start the app (`pnpm dev`) and confirm your exercise shows up in the client with the right name,
  muscles, photo, and a sane rank/standard once you log a set for it.
