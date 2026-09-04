# Missing-photo catalog gap — sourcing research

**Date:** 2026-09-04 · **Type:** research / reference document, no code changes
**Addresses:** `audit/workplan-v1.md` §1.10 ("Missing-photo treatment for the 11 catalog gaps") and consolidated
open question 9 ("Missing-photo catalog gap", Plan B §4.4).

## 1. Scope

The product owner's decision of **2026-09-03** (recorded twice in `audit/workplan-v1.md` — in §1.10 and again in
open question 9) set the preference order and then narrowed it:

> **Confirmed 2026-09-03:** defer full-catalog illustration as its own separate initiative. Phase 0's actual scope
> for this item is tiers 2–3 only: source real photos for the 11 gaps where feasible, closer-matching generic
> placeholder as the last resort.

Tier 3 already shipped: `ExerciseThumb.vue` softened the fallback to a radial-gradient tonal fill behind the
equipment glyph, so the gap reads as a deliberate icon slot rather than a broken-image frame (see the audit-fix
comment in `packages/client/src/components/exercise/ExerciseThumb.vue`).

**This document covers tier 2 only** — where a real, licence-clean photo or illustration for each specific gap can
actually be obtained. Part 2 documents what Liftoff's icon system really is, as *reference material* for the
deferred full-catalog initiative. **Nothing here proposes starting that initiative now.**

## 2. How "has no photo" actually works today, and the exact gap list

### Current mechanics (ground truth, from the repo)

- **Source of truth:** `tools/catalog/curated.yaml` — 94 curated exercises. An entry gets a photo only if it
  declares a `freeExerciseDbId`.
- **Acquisition:** `packages/ingest/src/ingestImages.ts` (`pnpm ingest --images`) downloads
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/0.jpg` and `/1.jpg` into
  `data/images/<slug>/start.jpg` and `end.jpg`. This is the only ingest step that touches the network, by design.
- **Hosting:** Fastify static-serves `data/images` at `/images/` (`packages/server/src/app.ts:69`). Nothing is
  hotlinked at request time.
- **The `hasImage` flag is computed, not stored:** `packages/server/src/routes/exercises.ts:81` does
  `existsSync(path.join(imagesRoot, ex.slug, "start.jpg"))`. The `demoStartImage` DB column is dead (ingest never
  writes it). So a gap closes purely by putting a `start.jpg`/`end.jpg` on disk — **no client or server code change
  is required to fix any of these.**
- **Licensing posture already in place:** free-exercise-db is Unlicense/public domain
  (`packages/ingest/src/equipment/freeExerciseDbSource.ts`), wger data and the mirrored muscle SVGs are CC-BY-SA
  (`ingestMuscleAssets.ts`), and the app already ships an `/attributions` route
  (`packages/client/src/pages/AttributionsPage.vue`) that names wger, free-exercise-db, Unlicense and CC-BY-SA 3.0,
  plus a `sourceAttribution` column in `packages/db/src/schema.ts`. **CC-BY-SA assets are already an accepted,
  plumbed-in licence class in this app** — this materially lowers the cost of the recommendations below.

### The actual gap list — 12, not 11

Verified two ways: entries in `curated.yaml` with no `freeExerciseDbId`, and directories missing under
`data/images/`. Both agree on **12**. The "11" in `ExerciseThumb.vue`'s comment and in workplan §1.10 is stale by
one; `curated.yaml`'s own header comment correctly says *"12 exercises are left with no id on purpose."*

| # | slug | nameDe | nameEn | equipment | wgerId (already in catalog) |
|---|------|--------|--------|-----------|------------------------------|
| 1 | `goblet-lunge` | Goblet-Ausfallschritt | Goblet Lunge | dumbbell | — |
| 2 | `single-leg-rdl` | Einbeiniges RDL | Single-Leg RDL | dumbbell | 1388 |
| 3 | `machine-chest-press` | Brustpresse (Maschine) | Machine Chest Press | machine | 379 |
| 4 | `pec-deck` | Butterfly (Maschine) | Pec Deck | machine | 1904 |
| 5 | `diamond-pushup` | Diamant-Liegestütze | Diamond Push-up | bodyweight | — |
| 6 | `pike-pushup` | Pike-Liegestütze | Pike Push-up | bodyweight | — |
| 7 | `landmine-press` | Landmine Press | Landmine Press | barbell | 346 |
| 8 | `chest-supported-row` | Rudern (brustgestützt) | Chest-Supported Row | machine | — |
| 9 | `neutral-grip-pullup` | Klimmzug (neutraler Griff) | Neutral-Grip Pull-up | bodyweight | — |
| 10 | `hip-abduction-machine` | Abduktoren-Maschine | Hip Abduction Machine | machine | 1748 |
| 11 | `glute-bridge` | Hüftheben (Boden) | Glute Bridge | bodyweight | 265 |
| 12 | `side-plank` | Seitstütz | Side Plank | bodyweight | 580 |

The other 82 slugs all have `data/images/<slug>/start.jpg` on disk. (`data/images/` holds 83 entries — 82 exercises
plus the `muscles/` SVG directory.)

---

## 3. Part 1 — where real assets for these 12 actually exist

### The candidate sources, evaluated

| Source | Licence | Style | Effort | Verdict |
|---|---|---|---|---|
| **free-exercise-db** (`yuhonas/free-exercise-db`, 876 exercises) | **Unlicense / public domain** — no attribution required | Photographic, two frames (start/end), consistent studio look | **Zero new effort** — add a `freeExerciseDbId:` line, re-run `pnpm ingest --images` | **Primary recommendation.** Already the app's pipeline. |
| **wger** (`wger.de/api/v2/exerciseimage/`, 374 images across 273 exercises) | CC-BY-SA 4.0 (286 images) / CC-BY-SA 3.0 (88). 43 of 374 are flagged `is_ai_generated: true` | Mixed — user-contributed photos, some Everkinetic line art, some AI renders. Visually **inconsistent** with the FEDB set | Small pipeline addition (new `wgerImageId`, a second downloader, and an attribution row) | **Fallback**, only for gaps FEDB can't cover |
| **`bryllim/workout-guide`** (302 exercises × 3 frames = 906 SVGs) | Assets CC BY-SA 4.0 (derived from Everkinetic), code MIT | Monochrome vector-traced silhouette figures, 512×512 transparent SVG, 3 frames per movement | `npm i @bryllim/workout-guide`, or pull `manifest.json` + `assets/<slug>/frame-N.svg` | **Illustration fallback** for the two gaps nothing else covers; also highly relevant to §4 |
| **Wikimedia Commons** | Per-file, mostly CC BY-SA 3.0/4.0 | Wildly inconsistent | Manual search + crop per image | Only one usable hit (see `landmine-press`); not worth a pipeline |
| **ExerciseDB API** (11 000+ exercises, GIFs) | Repo is AGPL-3.0; **image/GIF provenance is undocumented and the terms do not state redistribution rights** | 3D cartoon GIFs | API call | **Reject** — licence risk on the media itself, and AGPL is a poor fit |
| **everkinetic/data** | CC-BY-SA 4.0 | Flat vector figures (the upstream of workout-guide) | Manual | Superseded by workout-guide, which normalises and re-traces it |
| **GymVisual** | Non-Exclusive Commercial Royalty-Free, paid ($0.75–$3/illustration at volume) | 2D greyscale anatomy with red muscle highlighting | Purchase + download | Not needed for 12 gaps; see §4 |

### Per-exercise recommendation

All free-exercise-db ids below were verified to return HTTP 200 for `…/exercises/<id>/0.jpg`, and each candidate's
`equipment`, `primaryMuscles` and first instruction line were read to confirm it is genuinely the same movement —
the same hand-verification discipline `curated.yaml`'s header already documents.

| slug | Recommended source | Exact id / URL | Licence | Match quality | Effort |
|---|---|---|---|---|---|
| `glute-bridge` | free-exercise-db | `Butt_Lift_Bridge` — *"Butt Lift (Bridge)"*, body only, glutes/hamstrings | Unlicense | **Exact.** Bodyweight floor glute bridge | Trivial |
| `side-plank` | free-exercise-db | `Side_Bridge` — body only, abdominals | Unlicense | **Exact** (side bridge = side plank) | Trivial |
| `hip-abduction-machine` | free-exercise-db | `Thigh_Abductor` — machine, abductors/glutes, *"sit down on the abductor machine"* | Unlicense | **Exact** | Trivial |
| `machine-chest-press` | free-exercise-db | `Leverage_Chest_Press` — machine, chest | Unlicense | **Exact** (wger names the same movement "Leverage Machine Chest Press") | Trivial |
| `pec-deck` | free-exercise-db | `Butterfly` — machine, chest | Unlicense | **Exact** (matches the German name "Butterfly (Maschine)" too) | Trivial |
| `neutral-grip-pullup` | free-exercise-db | `V-Bar_Pullup` — body only, lats; instructions explicitly describe neutral-grip handles | Unlicense | **Exact** | Trivial |
| `chest-supported-row` | free-exercise-db | `Leverage_Iso_Row` (machine, chest-supported) — alt: `Dumbbell_Incline_Row` | Unlicense | **Exact** for the machine variant the catalog tags (`equipment: machine`) | Trivial |
| `diamond-pushup` | free-exercise-db | `Push-Ups_-_Close_Triceps_Position` — body only, triceps primary | Unlicense | **Near-exact.** Close-triceps hand position is the diamond position. Not a collision: `close-grip-pushup` already uses `Close-Grip_Push-Up_off_of_a_Dumbbell` and `pushup` uses `Pushups` | Trivial |
| `single-leg-rdl` | **wger** id 1736 *"Single-Leg Deadlift with Dumbbell"* | `https://wger.de/media/exercise-images/1736/…` | CC-BY-SA 4.0, not AI-generated | **Exact movement + exact equipment.** FEDB alternative `Kettlebell_One-Legged_Deadlift` is the same movement with the wrong implement | Small (needs wger image path) |
| `pike-pushup` | **wger** id 454 *"Pike Push Ups"* | `https://wger.de/media/exercise-images/454/447f3c17-405f-46e0-b138-65c2a8caaab0.png` | CC-BY-SA 4.0, **`is_ai_generated: true`** | Exact movement, but an AI render — visually off-register next to 82 photos | Small |
| `landmine-press` | **workout-guide** `landmine-press` (3 SVG frames) | `packages/workout-guide/assets/landmine-press/frame-{1,2,3}.svg` | CC BY-SA 4.0 | Exact movement, but illustration not photo. *Only* Commons alternative is `File:A Short Explanation of LeBron James Performing a Single Arm Landmine Press.png` (CC BY-SA 4.0) — a diagram of a named public figure, not usable as a neutral demo | Small–medium |
| `goblet-lunge` | **No source found** | — | — | **Genuinely unsourceable.** No goblet lunge in free-exercise-db, wger's 374-image set, workout-guide's 302, or Commons. Nearest neighbours are goblet *squat* (wrong movement) or dumbbell *lunge* (wrong hold) | Keep the softened placeholder, or hand-shoot one |

### Headline result

**8 of 12 gaps close with zero new licensing, zero new code, and one ingest run** — they are pure `curated.yaml`
edits (add a `freeExerciseDbId:` line) followed by `pnpm ingest --images`. These are near-misses of the original
hand-curation pass, not a real ceiling of the open-source photo sets; the header comment's claim that *"no matching
open-licensed photo exists for them"* is accurate for `goblet-lunge` and `landmine-press` but overstated for the
other ten.

The remaining four split into: 2 covered by wger (needs a modest pipeline addition + an attributions-page row —
both already precedented in this repo), 1 covered by an illustration, and 1 genuinely unsourceable.

### Caveats worth recording

- **wger images are CC-BY-SA**, i.e. share-alike + attribution. The app already ships an attributions page listing
  wger under CC-BY-SA, so adding image credit there is a one-line extension, not a new obligation class. Share-alike
  binds the *images and derivatives of them*, not the app's source code.
- **43 of wger's 374 images are AI-generated** and flagged as such in the API (`is_ai_generated`). Both wger
  candidates I'd otherwise reach for on `side-plank` (id 2509) and `pike-pushup` (id 454) are AI renders — for
  `side-plank` this is moot since free-exercise-db has a real photo; for `pike-pushup` it's the only option, and is
  worth a conscious accept/reject.
- **Style consistency is the real constraint, not licensing.** The 82 existing photos are one coherent
  studio-photography set. Mixing in a wger user photo, an AI render, and a monochrome SVG for four slugs will read
  as four one-off exceptions in a list. If that trade is unacceptable, the honest alternative for those four is to
  keep the shipped placeholder — which is exactly what tier 3 was for.

---

## 4. Part 2 — what Liftoff's icon system actually is

`audit/research/lens-1-liftoff-comparison.md` §2A already establishes the shape of it:

> **Rule: two illustration systems coexist and are used for different purposes.** Flat, saturated cartoon "sticker"
> icons represent exercises/food/objects; a second, more painterly anatomical body-diagram renderer (grey/white
> body, color-filled by muscle group) is the app's recurring signature motif… A third, higher-fidelity
> semi-realistic muscle render is used narrowly inside the exercise "how to perform" card only.

Reading the corpus images directly (`examples/liftoff/…`) sharpens all three into something concrete and, more
usefully, into something whose **production method is identifiable**.

### System 1 — per-exercise flat "sticker" figure (the exercise icon)

Evidence: `examples/liftoff/mid-workout/Screenshot_20260824-175421.png` (row icons for *Liegestütze* and
*Kurzhantelrudern*), `…-175501.png` (*Langhantel-Vorheben*), and the inset thumbnail bottom-right of the demo card
in `walkthrough_bundle/frames/frame_025.jpg`.

Structurally:

- **Per-exercise, not generic body-part icons.** *Liegestütze*, *Kurzhantelrudern* and *Langhantel-Vorheben* each
  get a different figure in a different, movement-specific pose. This is the key difference from Liftr's
  `ExerciseIcon.vue`, which shows an *equipment* glyph.
- **A single human figure per icon, no scene, no background, transparent.** The push-up icon uniquely renders as
  *two* figures (a start and an end pose side by side) — so the set is pose-illustrated, not symbol-illustrated.
- **Flat colour, ~5–6 fills, no outline, no gradient, no shadow:** skin tone, hair, blue top, dark shorts, blue
  shoes, occasionally a grey implement. Full-colour saturated, rendered at roughly 40–48 px in list rows.
- **Static.** Across all 73 filmstrips lens-1 catalogued, no per-exercise icon animation was observed. The icons
  are stills; the motion in the app lives in the demo card (System 3), not the list.
- **The same asset does double duty** — it appears as the row icon *and* as the small inset thumbnail on the
  exercise detail card, which is why it must read at very small sizes.
- Style category: **flat vector "emoji/sticker" figure illustration**, the same visual register as the app's nav
  and header glyphs (🔥 flame, 🍎 apple, dumbbells, hexagon-star), which are themselves emoji-grade full-colour
  stickers rather than a monochrome icon font.

### System 2 — the grey mannequin body diagram (the signature motif)

Evidence: `Screenshot_20260824-175344.png` (*Eingestuftes Körperbild*), `Screenshot_20260824-175320.png`
(*Erholungszone*), `frame_026.jpg` (*Trainierte Muskeln*).

- Front + back pair, a **single reusable asset**, not per-exercise. Light lavender-grey body with visible flat
  muscle-group segmentation and a small cartoon smiling face on the front view.
- Recoloured per context from one palette slot: **blue** for trained muscles, **amber/gold** for recovery state,
  two-tone blue for primary vs. secondary. Same technique Liftr already uses for its own muscle map.
- Also cropped into small per-muscle-group tiles ("Quadrizeps", "Gesäßmuskeln", "Beinbizeps", "Waden") — the tiles
  are crops of the same body asset, not separate drawings.

### System 3 — the demo card animation (the "how to perform" asset)

Evidence: `frame_025.jpg`, the light-grey card at the top of the exercise detail sheet.

- A **greyscale, semi-realistic anatomical figure with the working muscles overlaid in red**, on a light neutral
  card — per-exercise, and animated.
- This style is not bespoke. It is the house style of **GymVisual**, a commercial stock library that sells exactly
  this — "the grey 3D body model and the highlighted muscles in red" — as animations, GIFs and stills under a
  Non-Exclusive Commercial Royalty-Free licence, ~8 000 assets, **$3/illustration falling to ~$0.75 at 10+**, and
  ~$10 → $6 per video clip. A one-time perpetual worldwide fee, no royalties.

### How icon sets like this are actually produced at scale — and what it implies

This is the part that matters for the deferred initiative, so stating it plainly:

1. **The System 3 assets are almost certainly licensed, not commissioned.** The style is a recognisable commercial
   product, and the economics are trivial: 400+ exercises at GymVisual's volume tier is low three figures.
2. **Comparable libraries exist across the whole price/style range** (per a 2026 comparison): MoveKit — consistent
   3D mannequin, 412 exercises, $4.99/clip or $149–$299 bundled, commercial licence included; GymVisual — 2D
   anatomy, 8 000+ assets, $3–$10 each; ExerciseAnimatic — 3D realistic video, 2 300+, ~$1/clip or ~$329 for the
   bundle; Hyperhuman — AI-generated video, subscription. Free options (ExerciseDB, wger, Tenor) are named in the
   same comparison and explicitly flagged for licensing restrictions and inconsistent quality — which matches what
   §3 found empirically.
3. **A fully open, self-consistent illustrated set already exists**: `bryllim/workout-guide` — 302 exercises, three
   frames each, 906 transparent 512×512 SVGs, CC BY-SA 4.0 assets / MIT code, `npm install @bryllim/workout-guide`,
   published August 2026 and derived from Everkinetic's CC BY-SA poses (re-traced, normalised, monochrome). Its
   style is **monochrome vector silhouette**, i.e. *not* Liftoff's saturated sticker look — it would be a different
   art direction, not a copy of Liftoff's.
   **Coverage against Liftr's own catalog, measured:** 64/94 slugs match exactly by slug, **77/94 after normalising
   naming conventions** (`push-up`↔`pushup`, `pull-up`↔`pullup`, `rdl`↔`romanian-deadlift`), and roughly **85/94**
   with light manual name mapping (`back-squat`→Barbell/Front Squat family, `farmers-carry`→"Farmer Carry",
   `barbell-curl`/`dumbbell-curl`→"Bicep Curl"/"EZ-Bar Curl", `dumbbell-row`→"Dumbbell Bent Over Row",
   `reverse-fly`→"Reverse Pec Deck", `situp`→"Decline Sit-Up"). Remaining true gaps are `goblet-lunge`,
   `zercher-squat`, `dumbbell-pullover`, `dumbbell-incline-press`, `reverse-wrist-curl`, `ring-dip`,
   `wide-grip-pullup`. Notably it *does* cover 11 of the 12 photo gaps (all but `goblet-lunge`).
4. **AI generation is now a credible third path** but is the least de-risked: tooling that holds one custom style
   across a large set (e.g. Recraft's V4 custom styles, SVG output, ~$12/mo tier) exists, but a 94-icon set still
   needs a human consistency pass, and the provenance/licensing story is weaker than either a paid library or a
   CC-BY-SA set with a named upstream author.

**For the record, this is reference material only.** Nothing above is a proposal to start the full-catalog
illustration initiative. It exists so that whenever that initiative is greenlit, the options, their real costs, and
their actual style categories don't have to be rediscovered.

---

## 5. Closing recommendation

**Is the gap solvable with real photos now? Mostly yes.**

- **8 of 12** (`glute-bridge`, `side-plank`, `hip-abduction-machine`, `machine-chest-press`, `pec-deck`,
  `neutral-grip-pullup`, `chest-supported-row`, `diamond-pushup`) close with **real photos from the set the app
  already uses**, public-domain, zero new licence, zero code change — twelve lines of YAML and one
  `pnpm ingest --images`. This is a genuinely small piece of work and should be done.
- **2 more** (`single-leg-rdl`, `pike-pushup`) close with wger CC-BY-SA images, at the cost of a small ingest
  addition and an attributions-page line. Both are precedented in this repo. `pike-pushup`'s only candidate is an
  AI render — a conscious call, not a blocker.
- **1** (`landmine-press`) has no photo anywhere but has a clean CC BY-SA illustration.
- **1** (`goblet-lunge`) is genuinely unsourceable and should keep the shipped placeholder. One out of 94 is a fine
  place to land.

Also worth fixing while in the file: the "11" in `ExerciseThumb.vue`'s doc comment and workplan §1.10 should read
**12** (`curated.yaml`'s own header already says 12).

**Should the "defer full-catalog illustration" decision change? No — but with one honest asterisk.**

The decision to defer was made on the assumption that matching Liftoff means commissioning ~94 custom icons, i.e.
work "closer in scale to Track R's visual-identity work than a Phase 0 patch." That assumption is not quite right:
the research above shows such sets are normally *licensed*, not commissioned, and that both a paid option
(GymVisual at ~$70 for 94 assets; MoveKit at $149–$299 for a whole bundled pack) and a free CC BY-SA option
(`workout-guide`, ~85/94 coverage, npm-installable) exist off the shelf. So the *cost* premise of the deferral is
weaker than it looked.

The deferral still holds anyway, for the reasons that were always the real ones and which this research reinforces:

1. It is an **art-direction decision, not a sourcing problem.** The available sets are monochrome silhouettes
   (workout-guide) or greyscale anatomy (GymVisual) — neither is Liftoff's saturated sticker style, and neither has
   been evaluated against Nebula. Picking one is a visual-identity call that belongs with Track R.
2. It is a **full-catalog swap**: replacing 82 working photos plus 12 gaps with a uniform illustrated set is an
   all-or-nothing change to every exercise surface, and it retires the photo pipeline. That is not a Phase 0 patch
   regardless of how cheap the assets are.
3. **Nothing in it is blocked by the 12 gaps**, and the 12 gaps are ~83% solvable today for essentially free — so
   there is no forcing function to decide the big question now.

If the product owner wants to revisit, the single fact that would move the needle is item 3 in §4: `workout-guide`
covers ~85 of the 94 slugs, free, CC BY-SA, with three frames per movement, installable as an npm package. That
makes the deferred initiative a *procurement-and-art-direction* exercise rather than a content-production one — a
different and much smaller shape of project than §1.10 assumed. Worth recording against the item; not worth acting
on before the art direction is decided.

---

## Sources

Repository files consulted (all paths absolute under `C:\Users\owner\Documents\github\liftr`):
`audit/workplan-v1.md` (§1.10, open question 9), `audit/research/lens-1-liftoff-comparison.md`,
`tools/catalog/curated.yaml`, `packages/client/src/components/exercise/ExerciseThumb.vue`,
`packages/client/src/pages/AttributionsPage.vue`, `packages/ingest/src/ingestImages.ts`,
`packages/ingest/src/matchWgerIds.ts`, `packages/server/src/routes/exercises.ts`, `packages/server/src/app.ts`,
`packages/db/src/schema.ts`, `data/images/`, `examples/liftoff/` (screenshots and `walkthrough_bundle/frames/`).

External sources:

- Free Exercise DB — https://github.com/yuhonas/free-exercise-db · browsable index https://yuhonas.github.io/free-exercise-db/ · dataset https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
- wger project — https://github.com/wger-project/wger · image API https://wger.de/api/v2/exerciseimage/ · exercise info https://wger.de/api/v2/exerciseinfo/ · licence list https://wger.de/api/v2/license/ · docs https://wger.readthedocs.io/
- wger "Expanding the exercise image database" issue — https://github.com/wger-project/wger/issues/2196
- bryllim/workout-guide — https://github.com/bryllim/workout-guide · manifest https://raw.githubusercontent.com/bryllim/workout-guide/main/packages/workout-guide/manifest.json
- everkinetic/data — https://github.com/everkinetic/data · "Can I use your image files?" https://github.com/everkinetic/data/issues/7
- lczarnec/everkinetic_modifications — https://github.com/lczarnec/everkinetic_modifications
- chaosbastler/opentraining-exercises — https://github.com/chaosbastler/opentraining-exercises
- ExerciseDB API — https://github.com/exercisedb/exercisedb-api
- Wikimedia Commons API queries (file licences via `prop=imageinfo&iiprop=extmetadata`) — https://commons.wikimedia.org/w/api.php · `File:A Short Explanation of LeBron James Performing a Single Arm Landmine Press.png` · `File:Hip abductor machine.jpg` · `File:Side-plank-1.png`
- GymVisual — https://gymvisual.com/ · licence https://gymvisual.com/content/9-license · illustrations https://gymvisual.com/3-illustrations · bulk https://gymvisual.com/15-pack · price rules https://gymvisual.com/content/6-price-rules
- MoveKit, "Best Exercise Animation Libraries for Fitness Apps" (2026 comparison) — https://movekit.com/blog/best-exercise-animation-libraries-2026
- Gym Animations — https://gym-animations.com/ · Exercise Animatic — https://www.exerciseanimatic.com/
- Liftoff — Ranked Gym Workouts, App Store — https://apps.apple.com/us/app/liftoff-ranked-gym-workouts/id6448081563 · Google Play — https://play.google.com/store/apps/details?id=com.gymbros.app
- ScreensDesign, "Liftoff — Ranked Gym Workouts UI Breakdown" — https://screensdesign.com/showcase/liftoff-ranked-gym-workouts
- Recraft AI custom-style / SVG pricing overview — https://tech-insider.org/how-to-use-recraft-ai-2026/ · AI icon generator comparisons — https://svgmaker.io/blogs/12-best-ai-icon-generators-in-2026 · https://elements.envato.com/learn/best-ai-icon-generators
