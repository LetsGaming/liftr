# Workstream C: Plan/Routines Implementation Plan

**STATUS: SHIPPED, VERIFIED LIVE** on 2026-09-04 for every task except one — PathChooser, fast path, review glance-checks, equipment-substitution copy, and drag-to-reorder were all confirmed via real interaction (drag gestures, form submissions), not just static reading (`audit/verify/agent-8.md`, `audit/verify/round2-agent-4.md`). **Correction — Tasks 8-9 (custom exercise creation) are PARTIALLY REGRESSED, not done:** live testing found that creating a custom exercise with an umlaut name (e.g. "Überkopfdrücken Test") saves successfully with correct slug transliteration (the bug this task set out to fix), but the exercise then **displays the raw slug as its name everywhere** — list tile, detail sheet, and the `GET /api/exercises` response, which has no display-name field at all, only `slug`/`nameKey`. This is a worse user-facing bug than the one fixed (every custom exercise loses its human-readable name, not just ones with umlauts) and was invisible to this task's original test-only verification (`audit/verify/round2-agent-4.md`). Needs a follow-up fix — tracked in `audit/workplan-v1.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real remaining gaps in Liftr's "planning-desk" surfaces (routine list, routine
wizard, mesocycle setup, exercise catalog) against `audit/plan-c-new-ui-rebuild.md` §3 Phase 3 and
this workstream's Global Constraints — without re-doing work that a prior audit pass
(`audit/workplan-v1.md`) already shipped.

**Architecture:** No new screens. Extends existing Vue 3 + Pinia + Fastify/Zod/Drizzle components:
the routine wizard (`components/routine-wizard/*.vue`), the exercise catalog
(`pages/ExercisesPage.vue`, `components/exercise/*.vue`), and — newly extracted, see Task 5 — a
dedicated routine-list component pulled out of `pages/WorkoutPage.vue` (a file this workstream does
not otherwise own; see that task's coordination note). Server-side changes are additive: one new
field threaded through the existing muscle-guided suggestion service, one schema extension so a
custom exercise can carry muscle tags at creation time. No new routes, no schema migrations beyond
one nullable-safe table insert already modeled by `exerciseMuscles`.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), Pinia stores, Fastify 5 + zod route
schemas, Drizzle ORM over SQLite, Vitest (server/shared packages only — the client package has no
unit-test runner configured; client tasks are verified via `vue-tsc` typecheck and the
`mobile-viewport-check` skill, matching this codebase's existing verification convention).

**Spec:** `audit/plan-c-new-ui-rebuild.md` §3 Phase 3 (source: this document's own header cites lens-2
§2.4/§2.5/§2.6, §3.2, §4 rule 2, §5; lens-3 §2.2 High, §2.3 Medium, §2.4 Low). Cross-referenced against
`audit/workplan-v1.md` §1.9/§1.10 (status of two Phase-3-adjacent fixes) and
`docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §3.3 (this workstream's scope and
file boundary).

## Global Constraints

- Equipment substitution must be surfaced explicitly with copy explaining why ("swapped because you
  don't own X") — X must name the actual missing equipment, not a generic sentence.
- A step indicator's claimed step count must match what the flow actually shows.
- Exercise-name labels in reorder lists must use flex+truncation (never mid-word hyphenation) — this
  may already be a `TruncatingLabel` primitive from Foundation; **Foundation's plan
  (`docs/superpowers/plans/2026-09-03-foundation-primitives.md`) does not exist yet as of this
  plan's authoring**, so this plan builds the functional requirement directly (flex + `min-width: 0`
  + `text-overflow: ellipsis` + `white-space: nowrap`, no `hyphens`/`word-break`) at the single choke
  point every exercise-name label already renders through (`ExerciseRow.vue`), with an inline comment
  marking it for a later swap to Foundation's primitive once that lands.
- Placeholder treatment for exercises without a demo photo should read closer to the photographic
  rows around it, not a jarring flat-icon break.

## Status check — what this workstream does NOT need to (re-)build

Confirmed by reading current source before writing any task below (per this plan's own brief):

- **Wizard step-indicator accuracy** — already fixed. `RoutineWizard.vue`'s `.steps` block
  (lines 440-444) conditionally hides step 3's label via the same `showFastPath` computed that
  gates the condensed flow, so the indicator never promises a step the fast path doesn't show.
  `audit/workplan-v1.md` §1.9's "relabeling to 2 steps when the fast path is active" note is
  accurate and current. **No task here re-implements this.**
- **Mesocycle "week N of M" display** — already shipped, in two places:
  `WorkoutPage.vue` line 408-410 (routine card, not-started state) and line 500-502 (active-workout
  rail). Attach/end a cycle and week-count 2-16 are also already implemented
  (`useMesocycleControls.ts`, `MIN_MESO_WEEKS`/`MAX_MESO_WEEKS`). **No new mesocycle-setup task.**
  The only mesocycle-adjacent work here is Task 5's extraction, which relocates this UI verbatim.
- **Routine archive** — `routines.archivedAt` already exists in the schema and
  `DELETE /api/routines/:id` already performs a soft delete/archive (server comment: "so past
  workouts keep a valid routineId"), confirmed live in `routineStore.remove()`. The "Löschen" UI
  action already *is* an archive at the data level. **No new archive feature is built here** — only
  drag-reorder (Task 6) is a genuine gap in the routine-list spec item.
- **Per-set targets, per-exercise rest overrides, superset grouping, drag-to-reorder inside the
  wizard** — all already implemented in `ArrangeStep.vue` (per-set reps/weight/kind via
  `NumberStepper`/`SET_KIND_CYCLE`, `restBetweenSetsSeconds`/`restAfterExerciseSeconds` steppers,
  `linkNext`/`supersetGroups`, and `useDragReorder.ts` wired to pointer-driven card reordering).
  **No task rebuilds any of this.**
- **Exercise catalog browse/search/muscle-tag/equipment-requirement filtering** — already fully
  implemented in `ExerciseList.vue` (search input, equipment/muscle `<select>` filters, an
  "only doable equipment" toggle using `canPerform`/`missingByTier` from `@liftr/shared`).
  **No task rebuilds this.**
- **Placeholder-image fallback for the exercise thumbnail (`ExerciseThumb.vue`)** — already
  implemented: a radial-gradient tonal fallback (not a flat single-tone icon break), shipped per
  `audit/workplan-v1.md` §1.10's decision to defer full-catalog illustration and instead use a
  closer-matching placeholder for the 11 photo-less catalog gaps. **This plan does not touch
  `ExerciseThumb.vue`.** It does fix a related, *not yet closed* gap in `ExerciseDemo.vue` — see
  Task 7 — which still shows a flat "Kein Bild" box in its static fallback, unlike `ExerciseThumb`'s
  already-softened treatment.

## Real gaps this plan closes

1. Equipment-substitution copy exists (`FastPathStep.vue`/`ReviewStep.vue`: "Ersetzt: bevorzugte
   Variante braucht Ausrüstung, die du nicht hast.") but never names the actual missing equipment —
   violates the Global Constraint's "X" requirement. → Tasks 1-2.
2. No `TruncatingLabel`-equivalent exists anywhere in the client yet; `ExerciseRow.vue`'s name
   label has `min-width: 0` on its flex ancestors but no actual ellipsis/no-wrap treatment, so a
   long compound German exercise name still wraps rather than truncating. → Task 3.
3. The routine list (`WorkoutPage.vue`'s `.routine-grid`) has no drag-reorder at all, despite
   `useDragReorder.ts` already existing and being proven inside the wizard's `ArrangeStep.vue`. →
   Tasks 5-6.
4. `ExerciseDemo.vue`'s static (reduced-motion / failed-load) fallback still renders a flat
   `Kein Bild` box, inconsistent with `ExerciseThumb.vue`'s already-shipped softer treatment for the
   same 11-exercise gap. → Task 7.
5. `POST /api/exercises` (custom exercise) exists server-side and is fully unused — no client
   service function, no form, and the endpoint doesn't even accept muscle tags, which would make an
   added exercise invisible to muscle-filtered browse/suggest. → Tasks 8-9.

## Coordination note (read before Task 5)

Per `docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §2's file-boundary table,
`pages/WorkoutPage.vue` is Workstream A's file, not this workstream's — but the entire routine-list +
mesocycle-setup UI (Plan C §3 Phase 3's actual subject matter) currently lives inside it, interleaved
with the active-workout logging loop Workstream A owns. Task 5 resolves this by extracting that UI
into a new component this workstream owns outright, leaving only a small, explicitly-flagged
integration edit inside `WorkoutPage.vue` itself. **Do not run Task 5 concurrently with a
Workstream A change to the same file** — sequence it (land whichever workstream finishes its
`WorkoutPage.vue` edit first, then rebase the other), per the orchestration plan's own §4 guidance
for shared-file edits.

---

### Task 1: Server — capture which equipment triggered a routine-suggestion substitution

**Files:**
- Modify: `packages/server/src/services/routineSuggestionService.ts`
- Test: `packages/server/src/services/routineSuggestionService.test.ts`

**Interfaces:**
- Consumes: `missingByTier` from `@liftr/shared` (already imported elsewhere in this package via
  `packages/shared/src/equipment/requirements.ts`; exported from `@liftr/shared`'s index).
  Signature: `missingByTier(requirements: TieredRequirement[], owned: string[] | null | undefined):
  Record<"required" | "recommended" | "optional", EquipmentRequirement[]>`.
- Produces: `SuggestedExercise.missingEquipment?: string[]` — the raw `EquipmentRequirement` slugs
  (e.g. `"barbell"`) the *originally preferred* candidate needed but the user doesn't own, present
  only when `isSubstitute` is `true`. Task 2 (route) and Task 3 (client) consume this exact field
  name and shape.

- [ ] **Step 1: Write the failing test**

Add to `packages/server/src/services/routineSuggestionService.test.ts`, inside the existing
`describe("suggestExercisesForMuscles", ...)` block, right after the existing "flags a pick as a
substitute" test (so it reuses that test's fixture shape):

```typescript
  it("names the specific missing equipment that caused a substitution", async () => {
    const chest = await insertMuscle("chest");
    const barbellBench = await insertTestExercise(db, {
      slug: "barbell-bench-press",
      movementPattern: "push",
      requiredEquipment: JSON.stringify([{ item: "barbell", tier: "required" }]),
    });
    const pushup = await insertTestExercise(db, {
      slug: "push-up",
      movementPattern: "push",
      isBodyweight: true,
      requiredEquipment: JSON.stringify([]),
    });
    await tagPrimary(barbellBench.id, chest.id);
    await tagPrimary(pushup.id, chest.id);

    const [result] = await suggestExercisesForMuscles(db, {
      muscleSlugs: ["chest"],
      exercisesPerMuscle: 1,
      ownedEquipment: ["dumbbell"],
    });

    expect(result?.isSubstitute).toBe(true);
    expect(result?.missingEquipment).toEqual(["barbell"]);
  });

  it("omits missingEquipment for a non-substitute pick", async () => {
    const chest = await insertMuscle("chest");
    const bench = await insertTestExercise(db, { slug: "bench-press", movementPattern: "push" });
    await tagPrimary(bench.id, chest.id);

    const [result] = await suggestExercisesForMuscles(db, {
      muscleSlugs: ["chest"],
      exercisesPerMuscle: 1,
      ownedEquipment: [],
    });

    expect(result?.isSubstitute).toBe(false);
    expect(result?.missingEquipment).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/services/routineSuggestionService.test.ts`
Expected: FAIL — `result?.missingEquipment` is `undefined` in the first new test (assertion
`toEqual(["barbell"])` fails), since the field doesn't exist yet.

- [ ] **Step 3: Implement**

In `packages/server/src/services/routineSuggestionService.ts`:

1. Import `missingByTier` alongside the existing `@liftr/shared` imports (top of file):

```typescript
import {
  canPerform,
  findSubstitute,
  missingByTier,
  recommendExerciseSets,
  type ExperienceLevel,
  type RankMetric,
  type SubstituteCandidate,
  type TieredRequirement,
} from "@liftr/shared";
```

2. Extend the `pickMeta` value shape (used both at declaration and at both `.set()` call sites) to
   carry the missing-equipment list. Change:

```typescript
  const pickMeta = new Map<string, { muscleSlug: string; isSubstitute: boolean }>();
```

to:

```typescript
  const pickMeta = new Map<string, { muscleSlug: string; isSubstitute: boolean; missingEquipment?: string[] }>();
```

3. In the substitution branch (inside the `for (const c of ranked)` loop, the `if (substitute)`
   block), compute the missing items for the *originally preferred* candidate `c` — the
   `requirements` const is already computed two lines above this block — and store them:

```typescript
      const substitute = findSubstitute(
        toSubstituteCandidate(c),
        ranked.filter((other) => other.exercise.id !== c.exercise.id && !chosenExerciseIds.has(other.exercise.id)).map(toSubstituteCandidate),
        restrictingEquipment,
      );
      if (substitute) {
        chosenExerciseIds.add(substitute.exerciseId);
        pickMeta.set(substitute.exerciseId, {
          muscleSlug,
          isSubstitute: true,
          missingEquipment: missingByTier(requirements, restrictingEquipment).required,
        });
        addedForMuscle++;
      }
```

4. Extend the exported `SuggestedExercise` interface (near the top of the file) with the new
   optional field, documented the same way `isSubstitute` already is:

```typescript
export interface SuggestedExercise {
  exerciseId: string;
  slug: string;
  targetSets: { reps: number; weightKg: number | null }[];
  matchedMuscleSlug?: string;
  isSubstitute?: boolean;
  /** Present only when isSubstitute is true — the equipment item(s) the originally preferred
   *  candidate needed but the owned-equipment list didn't cover, so the client can say "swapped
   *  because you don't own X" and actually name X instead of a generic sentence. */
  missingEquipment?: string[];
}
```

5. In `recommendForExercises`, thread the new field into the returned `SuggestedExercise`:

```typescript
    const meta = pickMeta?.get(exercise.id);
    result.push({
      exerciseId: exercise.id,
      slug: exercise.slug,
      targetSets,
      ...(meta ? { matchedMuscleSlug: meta.muscleSlug, isSubstitute: meta.isSubstitute, missingEquipment: meta.missingEquipment } : {}),
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/services/routineSuggestionService.test.ts`
Expected: PASS (all tests in the file, including the two new ones and the pre-existing three).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @liftr/server typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/routineSuggestionService.ts packages/server/src/services/routineSuggestionService.test.ts
git commit -m "feat(routines): surface which equipment triggered a suggestion substitution"
```

---

### Task 2: Client — plumb `missingEquipment` through the routine service/store and wizard draft

**Files:**
- Modify: `packages/client/src/services/routineService.ts`
- Modify: `packages/client/src/components/routine-wizard/RoutineWizard.vue`

**Interfaces:**
- Consumes: Task 1's `SuggestedExercise.missingEquipment?: string[]` (server response field,
  already passed through untouched by the route in `routes/routineSuggestions.ts` since that route
  has no explicit response schema narrowing the shape — it returns `{ exercises }` as-is).
- Produces: `RoutineWizard.vue`'s `suggestionMeta` record gains a `missingEquipment?: string[]`
  member per exercise id, which Task 3 (FastPathStep/ReviewStep copy) consumes.

- [ ] **Step 1: Extend the client-side `SuggestedExercise` interface**

In `packages/client/src/services/routineService.ts`, extend the interface (mirrors the server one
from Task 1):

```typescript
export interface SuggestedExercise {
  exerciseId: string;
  slug: string;
  targetSets: SetTarget[];
  /** Muscle-guided suggestions only — which requested muscle slug produced this pick. Mirrors
   *  server's routineSuggestionService.ts SuggestedExercise; see that file for how it's derived. */
  matchedMuscleSlug?: string;
  /** True when the suggester swapped in this exercise because the preferred pick needed
   *  equipment the user doesn't own (see @liftr/shared's findSubstitute). */
  isSubstitute?: boolean;
  /** Present only when isSubstitute is true — raw equipment item slugs (e.g. "barbell") the
   *  originally preferred exercise needed. Mirrors the server interface 1:1. */
  missingEquipment?: string[];
}
```

- [ ] **Step 2: Carry `missingEquipment` into `RoutineWizard.vue`'s `suggestionMeta`**

In `packages/client/src/components/routine-wizard/RoutineWizard.vue`, the `suggestionMeta` reactive
object's type declaration currently reads:

```typescript
const suggestionMeta = reactive<Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean }>>({});
```

Change to:

```typescript
const suggestionMeta = reactive<Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean; missingEquipment?: string[] }>>({});
```

And in `applySuggestions()`, where `suggestionMeta[s.exerciseId]` is set:

```typescript
      if (s.matchedMuscleSlug) {
        suggestionMeta[s.exerciseId] = { matchedMuscleSlug: s.matchedMuscleSlug, isSubstitute: s.isSubstitute ?? false, missingEquipment: s.missingEquipment };
      }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors. (`FastPathStep.vue`/`ReviewStep.vue` still declare
`suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean }>` as their
prop type — a structurally-wider object passed where a narrower shape is expected is legal Vue/TS
here since it's excess-property-safe through a variable, not an object literal, so this won't yet
error; Task 3 updates those prop types directly.)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/services/routineService.ts packages/client/src/components/routine-wizard/RoutineWizard.vue
git commit -m "feat(routines): plumb missing-equipment reason through the wizard draft"
```

---

### Task 3: Client — name the missing equipment in substitution copy (Global Constraint)

**Files:**
- Modify: `packages/client/src/components/routine-wizard/FastPathStep.vue`
- Modify: `packages/client/src/components/routine-wizard/ReviewStep.vue`

**Interfaces:**
- Consumes: Task 2's `suggestionMeta[exerciseId].missingEquipment?: string[]`;
  `equipmentRequirementLabelDe` from `../../lib/equipmentIcons` (already imported and used the same
  way in `ExerciseList.vue` — signature `(requirement: EquipmentRequirement) => string`, German
  label lookup with slug fallback).
- Produces: substitution copy that names the actual equipment, replacing the generic sentence.

- [ ] **Step 1: Update `FastPathStep.vue`'s prop type and copy**

In `packages/client/src/components/routine-wizard/FastPathStep.vue`, update the `suggestionMeta`
prop type:

```typescript
  suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean; missingEquipment?: string[] }>;
```

Add the label import alongside the existing ones:

```typescript
import { equipmentRequirementLabelDe } from "../../lib/equipmentIcons";
```

Add a helper next to the existing `setSummary` function:

```typescript
/** "swapped because you don't own X" (Global Constraint) — names the actual equipment instead of
 *  a generic sentence. Falls back to the old generic copy only if the server didn't send a
 *  missing-equipment list (e.g. an older cached suggestion response). */
function substituteReason(exerciseId: string): string {
  const missing = props.suggestionMeta[exerciseId]?.missingEquipment;
  if (!missing || missing.length === 0) {
    return "Ersetzt: bevorzugte Variante braucht Ausrüstung, die du nicht hast.";
  }
  const names = missing.map((m) => equipmentRequirementLabelDe(m as Parameters<typeof equipmentRequirementLabelDe>[0]));
  return `Ersetzt: bevorzugte Variante braucht ${names.join(", ")}, das du nicht hast.`;
}
```

Replace the existing substitution paragraph:

```html
        <p v-if="isSubstitute(exerciseId)" class="ex-note">
          Ersetzt: bevorzugte Variante braucht Ausrüstung, die du nicht hast.
        </p>
```

with:

```html
        <p v-if="isSubstitute(exerciseId)" class="ex-note">{{ substituteReason(exerciseId) }}</p>
```

- [ ] **Step 2: Same change in `ReviewStep.vue`**

Apply the identical prop-type update, import, `substituteReason` helper (copy verbatim — both files
already duplicate `setSummary` the same way, consistent with this codebase's existing convention of
small per-step duplication over a shared mixin for these two sibling steps), and template swap:

```html
        <p v-if="isSubstitute(exerciseId)" class="ex-note">{{ substituteReason(exerciseId) }}</p>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the dev server (`pnpm dev`), open the routine wizard, choose "Nach Muskelgruppe vorschlagen
lassen", pick a muscle group likely to trigger a substitution on an account with a restrictive
owned-equipment setting (e.g. only `dumbbell` set in Profile → Equipment), and confirm the
Fast-Path/Review substitution note now reads e.g. "Ersetzt: bevorzugte Variante braucht Langhantel,
das du nicht hast." instead of the old generic sentence.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/routine-wizard/FastPathStep.vue packages/client/src/components/routine-wizard/ReviewStep.vue
git commit -m "feat(routines): name the specific equipment in substitution copy"
```

---

### Task 4: Client — functional exercise-name truncation (TruncatingLabel stand-in)

**Files:**
- Modify: `packages/client/src/components/exercise/ExerciseRow.vue`

**Interfaces:**
- Produces: every exercise-name label in the app truncates with an ellipsis on overflow instead of
  wrapping (never mid-word hyphenation) — `ExerciseRow.vue` is the single component every consumer
  (`ExerciseList.vue`, `ArrangeStep.vue`, `FastPathStep.vue`, `ReviewStep.vue`, and Task 5's new
  routine-list component) renders exercise names through, per that component's own header comment
  ("was hand-rolled 5 times... one component now"), so this fix cannot miss a call site by
  construction.

- [ ] **Step 1: Add the truncation treatment**

In `packages/client/src/components/exercise/ExerciseRow.vue`, the name is currently rendered as a
bare `<b>{{ name }}</b>` inside `.ex-row-meta` (which already has `flex: 1; min-width: 0` — the
flex-shrink half of the truncation contract is already correct). Add a dedicated class to the name
element:

```html
    <div class="ex-row-meta">
      <b class="ex-name">{{ name }}</b>
      <slot name="meta" />
    </div>
```

And add its CSS rule (append inside the existing `<style scoped>` block, right after `.ex-row-meta
b`'s current rule — replace that rule rather than duplicating it, since `.ex-name` is now the more
specific selector for the same element):

```css
/* TruncatingLabel stand-in (Global Constraint: flex + truncation, never mid-word hyphenation) —
   Foundation (docs/superpowers/plans/2026-09-03-foundation-primitives.md) doesn't exist yet as of
   this fix; when it ships a TruncatingLabel primitive, swap this element for it rather than
   layering a second truncation mechanism on top. */
.ex-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13.5px;
  color: var(--text);
}
```

Remove the now-superseded `.ex-row-meta b` rule (its `font-size`/`color` values are carried over
into `.ex-name` above verbatim).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors (template/style-only change).

- [ ] **Step 3: Manual verification across every consumer**

Run the dev server, and check each of these screens with a long exercise name (the catalog already
has real German compound names long enough to wrap on a narrow phone width, e.g.
"Langhantel-Kniebeuge" per `audit/plan-c-new-ui-rebuild.md`'s own success-criterion example — search
the catalog for a comparably long slug if that exact one isn't present) at a 375px-wide viewport:
- `ExercisesPage.vue` (catalog browse grid)
- The routine wizard's `PickStep.vue` (manual pick list, `ExerciseList` in `select` mode)
- `ArrangeStep.vue`'s exercise cards
- `FastPathStep.vue` and `ReviewStep.vue`'s summary rows

Confirm every one truncates to a single line with a trailing ellipsis, never wraps to a second line
or breaks a word mid-syllable.

- [ ] **Step 4: Run mobile-viewport-check**

Invoke the `mobile-viewport-check` skill against the screens listed in Step 3, per this codebase's
standing requirement to verify UI changes at mobile viewport sizes before calling client work done.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/exercise/ExerciseRow.vue
git commit -m "fix(exercise): truncate exercise-name labels instead of wrapping"
```

---

### Task 5: Client — extract the routine-list + mesocycle-setup UI out of `WorkoutPage.vue`

**Files:**
- Create: `packages/client/src/components/routine/RoutineList.vue`
- Modify: `packages/client/src/pages/WorkoutPage.vue` (coordination-flagged shared-file edit — see
  the "Coordination note" above)

**Interfaces:**
- Consumes: `useRoutineStore`, `useCatalogStore`, `useRoutineManagement` (existing composable,
  unchanged), `useMesocycleControls` (existing composable, unchanged — only the `activeMesocycle`
  half stays behind in `WorkoutPage.vue`, see Step 3), `useStartRoutine` (existing composable,
  unchanged), `RoutineWizard.vue`, `MuscleFigure.vue`, `NumberStepper.vue`, `aggregateMuscles` from
  `../../lib/muscles`. All of these are already-global Pinia stores or self-contained composables
  the new component instantiates itself — no props/emits are needed between `WorkoutPage.vue` and
  the new component.
- Produces: `<RoutineList />` — a zero-prop, zero-emit component. `WorkoutPage.vue` renders it with
  no wiring beyond the import and the tag itself.

- [ ] **Step 1: Create the new component**

Create `packages/client/src/components/routine/RoutineList.vue` with the exact template currently
at `WorkoutPage.vue` lines 403-482 (the whole `<div v-else-if="!store.isActive" class="not-started">
...</div>` block) and its own `<script setup>` sourcing the same state/actions `WorkoutPage.vue`
currently pulls from `useRoutineManagement`/`useMesocycleControls`/`useStartRoutine`, but
instantiated independently (both files calling `useActiveWorkoutStore()`/`useRoutineStore()` is
safe — Pinia stores are singletons):

```vue
<script setup lang="ts">
/**
 * The "not started" planning-desk surface: saved-routine cards (one-tap start, mesocycle reveal,
 * edit/duplicate/delete via the ⋮ menu), the first-timer empty state, and the Quick Start
 * fallback. Extracted out of WorkoutPage.vue (Workstream C, 2026-09-03) so this workstream's
 * plan/routines file boundary doesn't overlap Workstream A's ownership of the active-workout
 * logging loop in that file — see docs/superpowers/plans/2026-09-03-workstream-c-plan-routines.md
 * Task 5 for the coordination note. Zero props/emits: every dependency below is a Pinia store or
 * a composable that already instantiates its own store references, so this mounts standalone.
 */
import MuscleFigure from "../ui/MuscleFigure.vue";
import NumberStepper from "../ui/NumberStepper.vue";
import RoutineWizard from "../routine-wizard/RoutineWizard.vue";
import { useCatalogStore } from "../../stores/catalogStore";
import { useRoutineStore, type Routine } from "../../stores/routineStore";
import { useActiveWorkoutStore } from "../../stores/activeWorkoutStore";
import { useMesocycleControls } from "../../composables/useMesocycleControls";
import { useRoutineManagement } from "../../composables/useRoutineManagement";
import { useStartRoutine } from "../../composables/useStartRoutine";
import { aggregateMuscles } from "../../lib/muscles";

const catalog = useCatalogStore();
const routineStore = useRoutineStore();
const store = useActiveWorkoutStore();
const { starting, startRoutine, quickStart, exerciseName } = useStartRoutine();
const { openMenuId, editingRoutine, showBuilder, deleteConfirm, toggleMenu, editRoutine, duplicateRoutine, onRoutineCreated } =
  useRoutineManagement(routineStore);
const { mesoFormRoutineId, mesoWeeksInput, toggleMesoForm, startMesocycle, adjustMesoWeeks } = useMesocycleControls(store, routineStore);

function routineMuscles(routine: Routine) {
  return aggregateMuscles(routine.routineExercises.map((re) => catalog.byId(re.exerciseId)?.muscles ?? []));
}
function routineExerciseName(exerciseId: string): string {
  const ex = catalog.byId(exerciseId);
  return ex ? exerciseName(ex.slug) : "";
}

const quickStartExercises = catalog.exercises;
</script>

<template>
  <div class="not-started">
    <!-- ...exact markup from WorkoutPage.vue lines 404-481, unchanged, moved verbatim... -->
  </div>
</template>

<style scoped>
  <!-- ...the .routine-empty*, .routine-grid, .routine-card and its descendant rules (.rc-head,
       .rc-preview, .rc-ex-list, .rc-ex-more, .rc-muscles, .rc-count, .meso-badge, .rc-actions,
       .rc-start, .rc-menu-wrap, .rc-menu-btn, .rc-menu, .meso-form) from WorkoutPage.vue's
       <style> block, lines 692-892 minus .meso-active-badge (line ~892) — that rule belongs to
       the *active-workout* rail's mesocycle badge, which stays in WorkoutPage.vue, not this
       component. Moved verbatim, no value changes, except see Task 6 for the drag-reorder
       additions layered on top of .routine-card. -->
</style>
```

Move the markup and CSS **verbatim** (byte-for-byte, aside from removing the `v-else-if` on the
outer `<div>` — this component's caller now controls when it mounts) — this task is a pure
extraction, not a rewrite. Double-check `quickStartExercises` in the original file: confirm its
exact source (grep `WorkoutPage.vue` for `quickStartExercises` — it's a computed derived from
`catalog.exercises`, likely filtered/sliced; carry over whatever the original computed does rather
than the placeholder `catalog.exercises` shown above, which is illustrative only).

- [ ] **Step 2: Remove the extracted block from `WorkoutPage.vue`**

Delete the `<div v-else-if="!store.isActive" class="not-started">...</div>` block (lines 403-482)
and replace it with:

```html
    <RoutineList v-else-if="!store.isActive" />
```

Add the import near `WorkoutPage.vue`'s other component imports:

```typescript
import RoutineList from "../components/routine/RoutineList.vue";
```

Remove the now-unused imports/composable calls from `WorkoutPage.vue`'s `<script setup>` that only
existed to feed the extracted block: `RoutineWizard` import (if `WorkoutPage.vue` no longer
references it directly — check; it may still be needed if any other part of the template uses it,
which per the read-through it does not), `MuscleFigure`'s routine-preview usage (keep the import if
the active-workout muscle-preview section still uses it — it does, at line 509, so keep the import),
`useRoutineManagement`, and the `routineMuscles`/`routineExerciseName` helper functions if nothing
else in `WorkoutPage.vue` calls them (check: `routineExerciseName` is only used inside the extracted
block per the read-through; `routineMuscles` likewise).

Do **not** remove `useMesocycleControls` entirely — `WorkoutPage.vue` still needs
`activeMesocycle` from it for the active-workout rail's badge (line 500-502). Keep that one call,
just note it now only destructures `activeMesocycle`:

```typescript
const { activeMesocycle } = useMesocycleControls(store, routineStore);
```

- [ ] **Step 3: Remove the moved CSS from `WorkoutPage.vue`**

Delete the `.routine-empty*`, `.routine-grid`, `.routine-card` and its descendant rules (per Step
1's list) from `WorkoutPage.vue`'s `<style scoped>` block. Leave `.meso-active-badge` and
everything under the active-workout section untouched.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors, no unused-import warnings (this codebase's ESLint config catches unused
imports — also run `pnpm lint` to confirm).

- [ ] **Step 5: Manual verification**

Run the dev server, load the Workout tab with no active session: confirm the routine list, empty
state, mesocycle "+ Mesozyklus" reveal, and Quick Start button all render and behave identically to
before the extraction (start a routine, edit one, duplicate one, delete one, start/end a
mesocycle). Then start a workout and confirm the active-workout rail's mesocycle badge still shows.

- [ ] **Step 6: Run mobile-viewport-check**

Invoke the `mobile-viewport-check` skill against the Workout tab's not-started state.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/routine/RoutineList.vue packages/client/src/pages/WorkoutPage.vue
git commit -m "refactor(routines): extract routine-list/mesocycle UI out of WorkoutPage.vue"
```

---

### Task 6: Client — drag-to-reorder for the routine list

**Files:**
- Modify: `packages/client/src/components/routine/RoutineList.vue`
- Modify: `packages/client/src/services/routineService.ts`
- Modify: `packages/client/src/stores/routineStore.ts`

**Interfaces:**
- Consumes: `useDragReorder` from `../../composables/useDragReorder` (existing, unchanged —
  `(from: number, to: number) => void` reorder callback, `draggingIndex`/`onPointerDown`/`styleFor`
  return shape, already proven in `ArrangeStep.vue`).
- Produces: `routineStore.reorder(routineId: string, orderIndex: number): Promise<void>` — a new
  store action; `updateRoutine`'s payload type gains `orderIndex?: number`.

- [ ] **Step 1: Extend `updateRoutine`'s payload type**

In `packages/client/src/services/routineService.ts`, the existing function:

```typescript
export function updateRoutine(id: string, payload: { name?: string; exercises?: RoutineExerciseInput[] }): Promise<void> {
  return api.patch(`/api/routines/${id}`, payload);
}
```

already forwards its payload untyped-through to the server, which already accepts `orderIndex` (per
`routineInput.partial()` in `routes/routines.ts`). Widen the type:

```typescript
export function updateRoutine(id: string, payload: { name?: string; exercises?: RoutineExerciseInput[]; orderIndex?: number }): Promise<void> {
  return api.patch(`/api/routines/${id}`, payload);
}
```

- [ ] **Step 2: Add a `reorder` action to `routineStore.ts`**

In `packages/client/src/stores/routineStore.ts`, add (near the other mesocycle-adjacent actions):

```typescript
    /**
     * Routine-list drag-reorder (plan C §3 Phase 3). Persists every routine whose position
     * changed as a result of one drag, then reloads so the server's own orderIndex-sorted GET
     * stays the single source of truth for display order (no client-side re-sort of the
     * in-memory list — avoids the two ever disagreeing after a failed/partial request).
     */
    async reorder(orderedIds: string[]) {
      const updates = orderedIds
        .map((id, index) => ({ id, index }))
        .filter(({ id, index }) => this.routines.find((r) => r.id === id)?.orderIndex !== index);
      await Promise.all(updates.map(({ id, index }) => updateRoutine(id, { orderIndex: index })));
      await this.load();
    },
```

Add `updateRoutine`'s already-imported name to the existing import list at the top of the file if
not already present (it is — `updateRoutine` is already imported for the `update` action).

- [ ] **Step 3: Wire `useDragReorder` into `RoutineList.vue`**

In `packages/client/src/components/routine/RoutineList.vue` (created in Task 5), add:

```typescript
import { useDragReorder } from "../../composables/useDragReorder";

const { draggingIndex, onPointerDown, styleFor } = useDragReorder((from, to) => {
  const ids = routineStore.routines.map((r) => r.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved!);
  void routineStore.reorder(ids);
});

function handleDragDown(e: PointerEvent, index: number, cardEl: HTMLElement | null) {
  if (!cardEl) return;
  onPointerDown(e, index, routineStore.routines.length, cardEl);
}
```

In the template, add a drag handle to each `.routine-card` (same visual pattern as
`ArrangeStep.vue`'s `.drag-handle`) and bind the per-card style/dragging class:

```html
        <div
          v-for="(routine, i) in routineStore.routines"
          :key="routine.id"
          class="routine-card"
          :class="{ dragging: draggingIndex === i }"
          :style="styleFor(i)"
        >
          <div class="rc-head">
            <button
              class="rc-drag-handle"
              aria-label="Verschieben"
              @pointerdown="handleDragDown($event, i, ($event.currentTarget as HTMLElement)?.closest('.routine-card') as HTMLElement)"
            >
              ≡
            </button>
            <b>{{ routine.name }}</b>
            <span v-if="routine.mesocycle" class="meso-badge">
              Woche {{ routine.mesocycle.currentWeek }}/{{ routine.mesocycle.totalWeeks }} ·
              {{ routine.mesocycle.weekPercents[routine.mesocycle.currentWeek - 1] }}%
            </span>
          </div>
          <!-- ...rest of the card unchanged from Task 5's extraction... -->
        </div>
```

Add the handle's styling and the eased transform for displaced cards (Plan C §3's own gap-fill on
this exact composable: "a short ~150-200ms eased transform" for displaced cards, tightened from
`ArrangeStep.vue`'s 120ms since that value predates this spec citation):

```css
.rc-drag-handle {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 14px;
  touch-action: none;
  cursor: grab;
}
.routine-card {
  transition: transform 180ms ease;
}
.routine-card.dragging {
  transition: none;
}
```

(The `.routine-card` selector already exists from Task 5's extraction — add `transition` to it
rather than duplicating the rule; add the `.dragging` variant as a new rule right after it, same
pattern as `ArrangeStep.vue`'s `.card`/`.card.dragging`.)

Also add `min-width: 0` + truncation to the routine-name `<b>` in `.rc-head` for consistency with
Task 4's exercise-name fix (a routine name is now inside a draggable, horizontally-constrained
row and should degrade the same way):

```css
.rc-head b {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

(If `.rc-head b` already has other rules from the Task 5 extraction, merge into the existing
selector rather than duplicating it.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run the dev server with at least 3 saved routines. Drag the second routine card to the first
position; confirm it lands there, the list persists the new order across a page reload (confirming
the server round-trip), and the displaced card's shift animates smoothly rather than jumping.

- [ ] **Step 6: Run mobile-viewport-check**

Invoke the `mobile-viewport-check` skill against the routine list with drag interaction, at minimum
confirming the drag handle meets a touch-target-appropriate size at a 375px viewport.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/routine/RoutineList.vue packages/client/src/services/routineService.ts packages/client/src/stores/routineStore.ts
git commit -m "feat(routines): drag-to-reorder the routine list"
```

---

### Task 7: Client — soften `ExerciseDemo.vue`'s flat placeholder fallback

**Files:**
- Modify: `packages/client/src/components/exercise/ExerciseDemo.vue`

**Interfaces:**
- Produces: the static (reduced-motion or failed-load) fallback frame for a photo-less exercise now
  reads visually consistent with `ExerciseThumb.vue`'s already-shipped radial-gradient treatment,
  rather than a flat `var(--surface-3)` box with plain "Kein Bild" text.

- [ ] **Step 1: Replace the flat placeholder background**

In `packages/client/src/components/exercise/ExerciseDemo.vue`, the `.frame` rule currently sets a
flat background:

```css
.frame {
  flex: 1;
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-3);
}
```

`background: var(--surface-3)` is correct for a frame that successfully shows a photo (it's the
`<img>`'s own container background, invisible once the image loads) — the actual "jarring flat
break" is the `.placeholder` div shown only when a frame has no image. Update `.placeholder` (not
`.frame`) to match `ExerciseThumb.vue`'s existing radial-gradient treatment:

```css
.placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  /* Matches ExerciseThumb.vue's already-shipped fallback (audit fix, workplan-v1 §1.10c) —
     same tonal radial-highlight treatment instead of a flat single-tone break, applied here to
     the ExerciseInfoPanel detail view's static fallback, which still had the old flat look. */
  background: radial-gradient(circle at 35% 30%, var(--surface-2), var(--surface-3) 70%);
  color: var(--faint);
  font-size: 11px;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors (style-only change).

- [ ] **Step 3: Manual verification**

Open `ExercisesPage.vue`, tap into an exercise known to have no demo photo (any of the 11 gaps —
cross-reference `ExerciseThumb.vue`'s own header comment, or filter the catalog for `hasImage:
false`), and confirm the info panel's start/end frame placeholders now show the softened
radial-gradient treatment instead of a flat gray box, both with and without
`prefers-reduced-motion` forced on.

- [ ] **Step 4: Run mobile-viewport-check**

Invoke the `mobile-viewport-check` skill against the exercise info panel for a photo-less exercise.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/exercise/ExerciseDemo.vue
git commit -m "fix(exercise): soften ExerciseDemo's flat placeholder to match ExerciseThumb"
```

---

### Task 8: Server — accept muscle tags when creating a custom exercise

**Files:**
- Modify: `packages/server/src/repositories/exerciseRepository.ts`
- Modify: `packages/server/src/routes/exercises.ts`
- Test: `packages/server/src/repositories/exerciseRepository.test.ts` (new file)

**Interfaces:**
- Consumes: `exerciseMuscles`, `muscles` tables from `@liftr/db` (already used the same way in
  `routineSuggestionRepository.ts`/tests).
- Produces: `insertCustomExercise(db, input: CustomExerciseInput & { muscleSlugs?: {slug: string;
  role: "primary" | "secondary"}[] })` — inserts the exercise row and, if any muscle slugs were
  given, the corresponding `exerciseMuscles` rows in the same call. `POST /api/exercises`'s body
  schema accepts the same optional `muscleSlugs` array. Task 9 (client form) consumes this exact
  shape.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/repositories/exerciseRepository.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { muscles, type LiftrDb } from "@liftr/db";
import { insertCustomExercise } from "./exerciseRepository.js";
import { createTestDb } from "../services/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

describe("insertCustomExercise", () => {
  it("creates the exercise with no muscle tags when none are given", async () => {
    const row = await insertCustomExercise(db, {
      slug: "my-custom-move",
      nameKey: "my-custom-move",
      movementPattern: "push-horizontal",
      isBodyweight: false,
    });

    expect(row.slug).toBe("my-custom-move");
    expect(row.isCustom).toBe(true);
  });

  it("tags the exercise with the given primary/secondary muscles", async () => {
    const chest = await insertMuscle("chest");
    const triceps = await insertMuscle("triceps");

    const row = await insertCustomExercise(db, {
      slug: "my-custom-press",
      nameKey: "my-custom-press",
      movementPattern: "push-horizontal",
      isBodyweight: false,
      muscleSlugs: [
        { slug: "chest", role: "primary" },
        { slug: "triceps", role: "secondary" },
      ],
    });

    const tagged = await db.query.exerciseMuscles.findMany({ where: (em, { eq }) => eq(em.exerciseId, row.id) });
    expect(tagged).toHaveLength(2);
    expect(tagged.find((t) => t.muscleId === chest.id)?.role).toBe("primary");
    expect(tagged.find((t) => t.muscleId === triceps.id)?.role).toBe("secondary");
  });

  it("silently skips an unknown muscle slug rather than throwing", async () => {
    const chest = await insertMuscle("chest");

    const row = await insertCustomExercise(db, {
      slug: "my-custom-fly",
      nameKey: "my-custom-fly",
      movementPattern: "isolation",
      isBodyweight: false,
      muscleSlugs: [
        { slug: "chest", role: "primary" },
        { slug: "not-a-real-muscle", role: "secondary" },
      ],
    });

    const tagged = await db.query.exerciseMuscles.findMany({ where: (em, { eq }) => eq(em.exerciseId, row.id) });
    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.muscleId).toBe(chest.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/src/repositories/exerciseRepository.test.ts`
Expected: FAIL — `insertCustomExercise` doesn't accept `muscleSlugs` yet (TypeScript would catch
this at typecheck too, but the test itself fails at runtime since no `exerciseMuscles` rows get
created).

- [ ] **Step 3: Implement**

In `packages/server/src/repositories/exerciseRepository.ts`:

```typescript
import { deriveRequirements } from "@liftr/shared";
import { exerciseMuscles, exercises, muscles, type LiftrDb } from "@liftr/db";
import { eq, inArray } from "drizzle-orm";

export function findAllExercisesWithMuscles(db: LiftrDb) {
  return db.query.exercises.findMany({
    with: { exerciseMuscles: { with: { muscle: true } } },
  });
}

export interface CustomExerciseInput {
  slug: string;
  nameKey: string;
  equipment?: string;
  movementPattern: string;
  isBodyweight: boolean;
  /** Optional at creation time (a custom exercise with none is still valid, just invisible to
   *  muscle-filtered browse/suggest until edited) — unknown slugs are silently dropped rather
   *  than failing the whole insert, same tolerant-degrade posture as this file's equipment
   *  parsing elsewhere in the codebase. */
  muscleSlugs?: { slug: string; role: "primary" | "secondary" }[];
}

export async function insertCustomExercise(db: LiftrDb, input: CustomExerciseInput) {
  const { muscleSlugs, ...exerciseFields } = input;
  const requiredEquipment = deriveRequirements({
    slug: exerciseFields.slug,
    equipment: exerciseFields.equipment ?? null,
    movementPattern: exerciseFields.movementPattern,
  });
  const [row] = await db
    .insert(exercises)
    .values({ ...exerciseFields, isCustom: true, requiredEquipment: JSON.stringify(requiredEquipment) })
    .returning();

  if (muscleSlugs && muscleSlugs.length > 0) {
    const knownMuscles = await db.query.muscles.findMany({
      where: inArray(
        muscles.slug,
        muscleSlugs.map((m) => m.slug),
      ),
    });
    const muscleIdBySlug = new Map(knownMuscles.map((m) => [m.slug, m.id]));
    const rowsToInsert = muscleSlugs
      .filter((m) => muscleIdBySlug.has(m.slug))
      .map((m) => ({ exerciseId: row!.id, muscleId: muscleIdBySlug.get(m.slug)!, role: m.role }));
    if (rowsToInsert.length > 0) {
      await db.insert(exerciseMuscles).values(rowsToInsert);
    }
  }

  return row!;
}
```

(`eq` import isn't actually used in the final version above — only `inArray` is; don't add an
unused import. Double check against ESLint's no-unused-vars before committing.)

- [ ] **Step 4: Extend the route's body schema**

In `packages/server/src/routes/exercises.ts`, extend `customExerciseSchema`:

```typescript
const customExerciseSchema = z.object({
  slug: z.string().regex(EXERCISE_SLUG_PATTERN, "slug must be lowercase, alphanumeric, hyphen-separated"),
  nameKey: z.string().min(1),
  equipment: z.string().optional(),
  movementPattern: z.string().min(1),
  isBodyweight: z.boolean().default(false),
  muscleSlugs: z.array(z.object({ slug: z.string(), role: z.enum(["primary", "secondary"]) })).optional(),
});
```

No other change is needed in this file — `insertCustomExercise(db, req.body)` already forwards the
whole validated body, and the new field flows through untouched.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/repositories/exerciseRepository.test.ts`
Expected: PASS, all three tests.

- [ ] **Step 6: Run the full server test suite (regression check)**

Run: `pnpm --filter @liftr/server exec vitest run` (or `pnpm test` from repo root, which runs every
package's vitest suite)
Expected: PASS — confirms `findAllExercisesWithMuscles` and the routine-suggestion tests still pass
unchanged (this task only adds an optional field, no existing behavior changes).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @liftr/server typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/repositories/exerciseRepository.ts packages/server/src/repositories/exerciseRepository.test.ts packages/server/src/routes/exercises.ts
git commit -m "feat(exercises): accept muscle tags when creating a custom exercise"
```

---

### Task 9: Client — add-custom-exercise form

**Files:**
- Create: `packages/client/src/components/exercise/AddCustomExerciseForm.vue`
- Modify: `packages/client/src/services/exerciseService.ts`
- Modify: `packages/client/src/pages/ExercisesPage.vue`

**Interfaces:**
- Consumes: Task 8's extended `POST /api/exercises` body shape; `EQUIPMENT_LABEL_DE`,
  `EQUIPMENT_SLUGS` from `../../lib/equipmentIcons` (already used identically in
  `EquipmentStep.vue`); `MUSCLE_LABEL_DE`, `MUSCLE_SLUGS` from `../../lib/muscles` (already used
  identically in `PickStep.vue`); `EXERCISE_SLUG_PATTERN` — check whether this regex is exported
  from `@liftr/shared` for client-side reuse (it's imported server-side from `@liftr/shared` in
  `routes/exercises.ts`); if not already part of `@liftr/shared`'s public exports, this task treats
  slug validity as "server rejects it, client shows the resulting error" rather than duplicating
  the pattern client-side — check `packages/shared/src/index.ts`'s exports before deciding.
- Produces: `createExercise(input): Promise<CatalogExercise>` service function;
  `AddCustomExerciseForm.vue` emits `created: [exercise: CatalogExercise]`.

- [ ] **Step 1: Confirm `EXERCISE_SLUG_PATTERN`'s export surface**

Run: `grep -n "EXERCISE_SLUG_PATTERN" packages/shared/src/index.ts`
If it's exported, import and reuse it client-side for inline validation feedback before submit. If
not, skip client-side slug-pattern validation and rely on the server's 400 response (surfaced via
Step 5's error handling) — do not duplicate the regex by hand-copying it, since that's exactly the
kind of drift risk this codebase's own conventions (see `routineSuggestionService.ts`'s module doc:
"presets can never drift out of sync") warn against.

- [ ] **Step 2: Add the service function**

In `packages/client/src/services/exerciseService.ts`, add:

```typescript
export interface CreateExerciseInput {
  slug: string;
  nameKey: string;
  equipment?: string;
  movementPattern: string;
  isBodyweight: boolean;
  muscleSlugs?: { slug: string; role: "primary" | "secondary" }[];
}

/** POST /api/exercises — custom user-added exercise. Server always returns isCustom: true; the
 *  response shape is the same row `insertCustomExercise` returns, not the full `CatalogExercise`
 *  join shape (no `muscles`/`requiredEquipment`/`hasImage` computed fields) — callers should
 *  re-fetch the catalog (catalogStore.load()) rather than splice this response directly into a
 *  CatalogExercise[] list. */
export function createExercise(input: CreateExerciseInput): Promise<{ id: string; slug: string }> {
  return api.post<{ id: string; slug: string }>("/api/exercises", input);
}
```

- [ ] **Step 3: Build the form component**

Create `packages/client/src/components/exercise/AddCustomExerciseForm.vue`:

```vue
<script setup lang="ts">
/**
 * Feature: add-custom-exercise (Plan C §3 Phase 3 — "add-custom-exercise form"). POST
 * /api/exercises already existed server-side with zero client consumer; this is that consumer's
 * first build. A slug is derived from the typed display name (lowercased, non-alphanumeric runs
 * collapsed to single hyphens) since the catalog has no separate "display name" field — a custom
 * exercise with no i18n entry falls back to rendering its raw slug (useExerciseName.ts's own
 * documented fallback), so this is the same behavior every custom exercise already gets, not a
 * new gap this form introduces.
 */
import { computed, ref } from "vue";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS } from "../../lib/equipmentIcons";
import { MUSCLE_LABEL_DE, MUSCLE_SLUGS } from "../../lib/muscles";
import { createExercise } from "../../services/exerciseService";
import { useCatalogStore } from "../../stores/catalogStore";

const emit = defineEmits<{ created: []; cancel: [] }>();

const catalog = useCatalogStore();

const displayName = ref("");
const equipment = ref<string>("");
const isBodyweight = ref(false);
const movementPattern = ref("isolation");
const primaryMuscle = ref("");
const secondaryMuscles = ref<Set<string>>(new Set());
const saving = ref(false);
const errorMsg = ref("");

const MOVEMENT_PATTERNS: { value: string; label: string }[] = [
  { value: "squat", label: "Kniebeuge" },
  { value: "hinge", label: "Hüftbeuge" },
  { value: "push-horizontal", label: "Drücken, horizontal" },
  { value: "push-vertical", label: "Drücken, vertikal" },
  { value: "pull-horizontal", label: "Ziehen, horizontal" },
  { value: "pull-vertical", label: "Ziehen, vertikal" },
  { value: "carry", label: "Tragen" },
  { value: "isolation", label: "Isolation" },
];

const slug = computed(() =>
  displayName.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""),
);

const canSave = computed(() => slug.value.length > 0 && primaryMuscle.value !== "" && !saving.value);

function toggleSecondary(slugValue: string) {
  if (secondaryMuscles.value.has(slugValue)) secondaryMuscles.value.delete(slugValue);
  else secondaryMuscles.value.add(slugValue);
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  errorMsg.value = "";
  try {
    const muscleSlugs = [
      { slug: primaryMuscle.value, role: "primary" as const },
      ...[...secondaryMuscles.value].map((s) => ({ slug: s, role: "secondary" as const })),
    ];
    await createExercise({
      slug: slug.value,
      nameKey: slug.value,
      equipment: equipment.value || undefined,
      movementPattern: movementPattern.value,
      isBodyweight: isBodyweight.value,
      muscleSlugs,
    });
    await catalog.load();
    emit("created");
  } catch {
    errorMsg.value = "Speichern fehlgeschlagen — prüfe, ob der Name bereits vergeben ist.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="add-exercise-form">
    <label class="field">
      <span class="field-label">Name</span>
      <input v-model="displayName" type="text" placeholder="z. B. Kabelzug Facepull" />
      <span v-if="slug" class="slug-preview">wird gespeichert als: {{ slug }}</span>
    </label>

    <label class="field">
      <span class="field-label">Bewegungsmuster</span>
      <select v-model="movementPattern">
        <option v-for="p in MOVEMENT_PATTERNS" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
    </label>

    <label class="field checkbox-field">
      <input v-model="isBodyweight" type="checkbox" />
      <span>Eigengewichtsübung</span>
    </label>

    <label v-if="!isBodyweight" class="field">
      <span class="field-label">Gerät</span>
      <select v-model="equipment">
        <option value="">Kein primäres Gerät</option>
        <option v-for="eq in EQUIPMENT_SLUGS" :key="eq" :value="eq">{{ EQUIPMENT_LABEL_DE[eq] }}</option>
      </select>
    </label>

    <div class="field">
      <span class="field-label">Hauptmuskel</span>
      <div class="chip-grid">
        <button
          v-for="m in MUSCLE_SLUGS"
          :key="m"
          type="button"
          class="muscle-chip"
          :class="{ active: primaryMuscle === m }"
          @click="primaryMuscle = m"
        >
          {{ MUSCLE_LABEL_DE[m] ?? m }}
        </button>
      </div>
    </div>

    <div class="field">
      <span class="field-label">Weitere Muskeln (optional)</span>
      <div class="chip-grid">
        <button
          v-for="m in MUSCLE_SLUGS.filter((s) => s !== primaryMuscle)"
          :key="m"
          type="button"
          class="muscle-chip"
          :class="{ active: secondaryMuscles.has(m) }"
          @click="toggleSecondary(m)"
        >
          {{ MUSCLE_LABEL_DE[m] ?? m }}
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div class="actions">
      <button class="btn-secondary" @click="emit('cancel')">Abbrechen</button>
      <button class="btn-primary" :disabled="!canSave" @click="save">
        {{ saving ? "Wird gespeichert…" : "Übung speichern" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.add-exercise-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
  padding: var(--sp4);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12.5px;
  color: var(--dim);
  font-weight: 600;
}
.field input[type="text"],
.field select {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
}
.slug-preview {
  font-size: 11px;
  color: var(--faint);
}
.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: var(--sp2);
}
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
}
.muscle-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
}
.muscle-chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
.error-msg {
  color: var(--red);
  font-size: 12.5px;
}
.actions {
  display: flex;
  gap: var(--sp2);
}
.actions .btn-secondary {
  flex: none;
}
.actions .btn-primary {
  flex: 1;
}
</style>
```

- [ ] **Step 4: Wire the form into `ExercisesPage.vue`**

In `packages/client/src/pages/ExercisesPage.vue`, add a trigger and modal state:

```typescript
import AddCustomExerciseForm from "../components/exercise/AddCustomExerciseForm.vue";
import SheetModal from "../components/ui/SheetModal.vue";

const showAddForm = ref(false);
function onExerciseCreated() {
  showAddForm.value = false;
}
```

Add a trigger button and the modal to the template (inside `.ex-page`, after `<ExerciseList
.../>`):

```html
        <button class="add-custom-btn" @click="showAddForm = true">+ Eigene Übung hinzufügen</button>

        <SheetModal v-if="showAddForm" @close="showAddForm = false">
          <AddCustomExerciseForm @created="onExerciseCreated" @cancel="showAddForm = false" />
        </SheetModal>
```

(Check `SheetModal.vue`'s actual prop/emit contract before wiring — `RoutineWizard.vue`'s usage
earlier in this plan shows it takes a `ref` and emits `close`, and is dismissed via
`sheetRef.value?.dismiss()`; match whatever the real component requires rather than the illustrative
snippet above, since `SheetModal.vue` wasn't read in full during this plan's research — confirm its
props/emits/dismiss-pattern before writing this step's actual diff.)

Add minimal styling for `.add-custom-btn` consistent with the page's existing patterns (e.g. same
shape as `RoutineWizard.vue`'s `.add-exercise-btn`: dashed border, `var(--surface-2)` background).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run the dev server, open the Übungen tab, tap "+ Eigene Übung hinzufügen", fill in a name, pick a
movement pattern and a primary muscle, save, and confirm: the sheet closes, the new exercise appears
in the catalog list (search for its slug), and it's tagged with the chosen muscle (filter the list
by that muscle and confirm it appears). Then open the routine wizard's muscle-guided suggester for
that same muscle and confirm the new custom exercise is a candidate (it may not always be picked —
`suggestExercisesForMuscles` ranks non-custom exercises first — but it should appear if you request
enough exercises per muscle or if it's the only candidate for an otherwise-uncovered muscle).

- [ ] **Step 7: Run mobile-viewport-check**

Invoke the `mobile-viewport-check` skill against the new form sheet.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/components/exercise/AddCustomExerciseForm.vue packages/client/src/services/exerciseService.ts packages/client/src/pages/ExercisesPage.vue
git commit -m "feat(exercises): add the custom-exercise creation form"
```

---

## Self-review (writing-plans skill checklist)

**Spec coverage against Plan C §3 Phase 3's four bullet points:**
1. "Routines list: one-tap-start cards kept deliberately light, archive/reorder via drag,
   mesocycle reveal-on-demand" — one-tap-start and mesocycle reveal-on-demand already shipped
   (confirmed in Status Check); archive already shipped as soft-delete (confirmed); drag → Task 6.
2. "Routine Builder/Wizard: muscle-group-driven or manual exercise picking, equipment-aware
   substitution surfaced explicitly, per-set targets, per-exercise rest overrides, superset
   grouping, drag-to-reorder, step indicator accuracy, TruncatingLabel" — picking modes/per-set
   targets/rest overrides/superset grouping/wizard drag-reorder/step-indicator already shipped
   (confirmed); substitution copy naming the equipment → Tasks 1-3; TruncatingLabel → Task 4.
3. "Mesocycle setup: attach/end, week count 2-16, week-N-of-M display" — all already shipped
   (confirmed); Task 5 relocates this UI without changing its behavior.
4. "Exercise catalog: browse/search, muscle tags, equipment requirements, add-custom-exercise form,
   placeholder-image policy" — browse/search/tags/requirements already shipped (confirmed);
   add-custom-exercise form → Tasks 8-9; placeholder-image policy already shipped for
   `ExerciseThumb.vue` (confirmed), extended to `ExerciseDemo.vue`'s remaining flat fallback →
   Task 7.

**Global Constraints coverage:**
- Equipment-substitution naming → Tasks 1-3. ✅
- Step-indicator accuracy → already correct, verified not to re-plan a done item. ✅
- TruncatingLabel/flex+truncation → Task 4 (functional stand-in, documented for a later swap to
  Foundation's primitive). ✅
- Placeholder-image treatment → already correct for `ExerciseThumb`, extended to `ExerciseDemo` in
  Task 7. ✅

**Placeholder scan:** every task has verbatim code (or, for Task 5's extraction, an explicit
byte-for-byte-move instruction with exact line-range citations) and named files. Task 9's Step 4
flags one genuine unknown (`SheetModal.vue`'s exact prop/emit contract wasn't read during this
plan's research) rather than guessing at it — the instruction is explicit to confirm the real
contract before writing that diff, not a TODO to defer indefinitely.

**Type consistency check:** `SuggestedExercise.missingEquipment?: string[]` (Task 1, server) →
`SuggestedExercise.missingEquipment?: string[]` (Task 2, client service, identical name/shape) →
`suggestionMeta[id].missingEquipment?: string[]` (Task 2, wizard) → consumed as
`props.suggestionMeta[exerciseId]?.missingEquipment` (Task 3, both step components) — consistent
throughout. `routineStore.reorder(orderedIds: string[])` (Task 6) matches its call site in
`RoutineList.vue`'s `useDragReorder` callback. `CustomExerciseInput.muscleSlugs` (Task 8, server
repository) matches `customExerciseSchema`'s `muscleSlugs` field (Task 8, route) matches
`CreateExerciseInput.muscleSlugs` (Task 9, client service) — identical `{slug: string; role:
"primary" | "secondary"}[]` shape throughout.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-03-workstream-c-plan-routines.md`. Two
execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast
iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with
checkpoints.

Which approach?
