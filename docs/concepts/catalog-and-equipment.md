# The exercise catalog and equipment matching

Liftr ships a **curated** exercise catalog, not a full import of an 800+-exercise dataset. This
document covers how that catalog is structured, how it's ingested into the database, and how
equipment (both "what does this exercise need" and "does the user own it") is resolved — mostly
automatically, with hand-curation only where automation can't be trusted.

## Why curated, not comprehensive

`tools/catalog/curated.yaml` holds roughly 90 hand-picked movements, "biased toward movements
with real or derivable strength standards" (`audit/finished/liftr-audit.md` §1). The catalog
exists to **serve the rank system** — every entry needs a path to a threshold table, either
directly (an anchor lift) or by ratio against one (everything else) — not to be an exhaustive
exercise database. A long tail of exercises with no plausible strength-standard anchor would just
be dead weight the rank engine can't use.

## Anchors, derived, and synthetic — in the catalog itself

The catalog file's own header comment lays out the structure directly (read it — it's more
current than any prose restating it): there are 9 **anchor** exercises, which omit `anchor`/
`ratio` entirely and instead carry a real external standard:

- Five loaded lifts with OpenPowerlifting-derived threshold tables: back-squat, bench-press,
  deadlift, overhead-press, barbell-row.
- Four bodyweight movements with published rep-norm tables: push-up, pull-up, chin-up, dip.

Every other entry declares `anchor: <one-of-the-9-slugs>` and a `ratio` — the load (or rep-count)
multiplier applied to that anchor's own threshold table. `trust: derived` marks a close variant
of the anchor movement; `trust: synthetic` marks the long-tail isolation catalog, where the ratio
is closer to an informed guess than a sourced number. This is the "synthetic-standard method"
referenced throughout the codebase and audit — see
[rank-engine.md](./rank-engine.md#trust-tiers-being-honest-about-the-numbers) for how these trust
tiers actually feed into rank resolution and the UI's honesty guarantee.

The file's own comment is upfront that **ratios are starting estimates, not measured** — an
explicitly open, expected-to-be-tuned area, adjusted directly in the YAML and re-ingested with
`pnpm ingest --standards` rather than touching code.

## Muscle taxonomy

`primaryMuscles`/`secondaryMuscles` use wger's 15-muscle taxonomy verbatim (see
`packages/ingest/src/muscles.ts`), adopted wholesale rather than approximated, because it has to
match the muscle-map SVG highlight assets mirrored from wger. An earlier revision used a looser,
17-tag taxonomy with tags like "forearms" or "rear-delts" that no highlight shape actually
existed for; those were dropped or consolidated when the muscle map was rebuilt on real anatomical
assets. The catalog's own comment flags a known, accepted consequence: wrist-curl and
reverse-wrist-curl end up with no `primaryMuscles` at all, since no forearm shape exists in the
15-muscle set.

## Ingesting the catalog

`packages/ingest/src/ingestCatalog.ts` (run via `pnpm ingest --catalog`) is idempotent: re-running
it with an unchanged file is a no-op, and re-running after an edit updates existing rows rather
than duplicating them. Broadly:

1. `loadCatalog` parses and Zod-validates the YAML.
2. `ingestMuscles` upserts the 15-muscle taxonomy and **prunes** any muscle slug no longer in the
   seed list — safe because `exercise_muscles` cascades on delete and the catalog is always
   re-ingested first, so nothing still references a dropped slug by the time pruning runs.
3. Equipment is resolved per entry (see below) *before* insert.
4. Each entry is upserted into `exercises`, and its muscle tags are replaced wholesale (delete +
   re-insert) — simpler and safe to re-run rather than diffing.

One display-related detail: catalog exercises get no `name` column value at all — the client
resolves display names via i18n keyed on `slug` (`useExerciseName.ts`). `name` is populated only
for custom, user-created exercises, which have no i18n entry of their own.

## Equipment resolution: three layers, in priority order

"Map equipment to exercises without manually adjusting the code every time" was the explicit
feature request behind this whole subsystem (quoted directly in several of these files' header
comments). `buildRequiredEquipment` in `ingestCatalog.ts` picks the best available source for each
entry's full **tiered** requirement list, in this order:

1. **`curated.yaml`'s `requiresEquipment` override** — always wins, always tier `required`. Every
   hand-authored override exists to fix a specific "can't do this without it" gap the automated
   sources got wrong.
2. **wger's real per-exercise equipment tags**, if the entry has a joined `wgerId` *and* wger's own
   tags actually agree with the entry's hand-set primary `equipment` value. That agreement check
   is a cheap sanity guard: `matchWgerIds.ts`'s fuzzy name matching isn't perfect, and this stops a
   wrong match from quietly poisoning `requiredEquipment` with an unrelated exercise's gear.
3. **`deriveRequirements()`'s slug/movement-pattern rules** — the original, always-available
   fallback (`packages/shared/src/equipment/requirements.ts`).

Separately, `resolveEquipmentForCatalog` (`packages/ingest/src/equipment/resolveEquipment.ts`)
resolves the single primary `equipment` field the same way: `curated.yaml`'s own hand-set value
always wins when present, and is never overwritten — this function only *fills in* entries that
leave it null, from `free-exercise-db` or wger's index by join key (`freeExerciseDbId` /
`wgerId`). It also runs a **conflict check regardless of whether curated.yaml already has a
value**: if a hand-set value disagrees with what every automated source now says, that's logged
as a warning, never silently auto-corrected — curated.yaml is assumed to know something the
generic upstream tag doesn't (e.g. this app's specific movement variant), so provenance always
wins over automation, but drift gets surfaced rather than hidden. Every upstream source degrades
gracefully: if it's unreachable (offline, rate-limited, down), affected entries just fall through
to the next source or stay unresolved — ingest never aborts over one flaky upstream.

### Required / recommended / optional

`TieredRequirement` (`packages/shared/src/equipment/requirements.ts`) is the response to a
different feature request: "instead of taking all equipment for an exercise as required, there
should be tiers — this would allow exercises that are only missing a mat to not be filtered out."
`required` items block `canPerform()`; `recommended`/`optional` never do — they surface only as a
softer hint in the UI. `deriveRequirements()`'s rule-based fallback applies this distinction
directly: a barbell bench press is impossible without a bench (`required`), but floor core work
without a mat is still doable (`recommended`).

`SupportEquipment` (bench, incline-bench, rack, pullup-bar, dip-bars, mat, box, plates) is
deliberately a separate vocabulary from the primary `Equipment` type — a bench isn't what "what
equipment does this need" means for icon/filter purposes, but it absolutely matters for "can the
user physically perform this exercise with what they own." Barbell-family equipment
(barbell/ez-bar/trap-bar) implicitly also requires `plates`, added automatically wherever a
barbell-family item is required — see `LOADED_BAR_EQUIPMENT` in `requirements.ts`.

### The closed equipment vocabulary

`Equipment` (`packages/shared/src/equipment/equipment.ts`) is a deliberately **closed** 10-value
set: barbell, dumbbell, bodyweight, machine, cable, ez-bar, trap-bar, rings, kettlebell, ab-wheel.
Every exercise's equipment has to render a real icon and be filterable by the equipment picker, so
an upstream value with no equivalent in this vocabulary normalizes to `null` rather than being
force-fit onto the nearest-sounding category — `normalizeFreeExerciseDbEquipment` and
`normalizeWgerEquipment` both follow this rule explicitly (e.g. resistance bands, medicine balls,
and Swiss balls all map to `null`, not to some approximate bucket).

## Matching wger IDs: fuzzy, then hand-verified

`packages/ingest/src/matchWgerIds.ts` is a one-time, re-runnable developer script
(`tsx src/matchWgerIds.ts`) that populates `curated.yaml`'s `wgerId` field so the ingest pipeline
can pull wger's *full* multi-item equipment tag list per exercise, instead of guessing via
`deriveRequirements()`'s rules alone. It's **read-only** against the YAML — it prints a report and
ready-to-paste `wgerId:` lines, but doesn't write the file itself, since this is the one
deliberately manual step in the pipeline.

The matching strategy, in order:

1. **Exact English-name lookup** against wger's API (`name=` filter, exact match only).
2. **Token-overlap fuzzy scoring** against the full English translation list for anything that
   doesn't hit exactly — `tokenOverlapScore` combines plain Jaccard similarity with a containment
   score anchored specifically to the *curated* name's own tokens (not whichever set is smaller),
   which matters: an earlier version anchored to the smaller set and let a short generic wger
   entry ("Bench Press") falsely max out containment against a more specific curated name
   ("Incline Bench Press") just because both its words happened to appear — silently losing the
   "incline" qualifier. The containment boost is further capped to candidates adding at most one
   extra word beyond the curated name's own token count, so a 2-word curated name like "Barbell
   Curl" can't containment-match against an unrelated superset exercise ("Barbell Reverse Wrist
   Curl").
3. Matches scoring at or above `FUZZY_ACCEPT_THRESHOLD` (0.85) are auto-accepted; everything below
   is printed for manual review rather than guessed.

This mirrors the same "auto-accept high confidence, hand-check the rest" process `curated.yaml`'s
own header comment describes for `freeExerciseDbId` (the photo-matching join): auto-accepting the
single top fuzzy score without a floor produced real wrong matches historically (the header
comment's example: "reverse-fly" nearly matched to "Reverse Crunch"). 21 catalog entries currently
have no `wgerId` at all — some have no good wger equivalent (e.g. `dumbbell-bench-press`, where
wger only has angled variants, not a plain flat one), others just scored below the threshold and
weren't worth hand-verifying individually. Every entry without a `wgerId` simply falls back to
`deriveRequirements()`'s rule-based tiers instead of wger's real per-exercise tags.

## Further reading

- `tools/catalog/curated.yaml`'s own header comment — the most current, most authoritative
  description of the file's own structure; read it before this document if the two ever disagree.
- `packages/ingest/src/ingestCatalog.ts`, `packages/ingest/src/matchWgerIds.ts`,
  `packages/ingest/src/equipment/resolveEquipment.ts` — the actual ingestion/matching code.
- `packages/shared/src/equipment/requirements.ts`, `packages/shared/src/equipment/equipment.ts` —
  the tiered-requirement and closed-vocabulary types shared by client, server, and ingest.
- [rank-engine.md](./rank-engine.md) — how a catalog entry's `anchor`/`ratio`/`trust` actually
  become a threshold table at ingest time (`defaultStandards.ts`).
