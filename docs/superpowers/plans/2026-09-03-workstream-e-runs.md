# Workstream E: Runs — Implementation Plan

## Goal

Close out Plan C's Phase 5 (Runs) for Liftr's UI rebuild. Unlike the other Wave-1 workstreams,
this one is **mostly verification, not construction**: direct reading of the current code (see
"What's already implemented" below) shows GPX/FIT import, manual entry, the route map, run
replay, and Health Connect import are all already built and functioning, and the specific
duplicate-import-button bug this workstream was written to close (`plan-c-new-ui-rebuild.md` §3
Phase 5, `audit/engagement-audit-v5.md` §5, `lens-3-design-critique.md` §2.2 High) is **already
fixed**, with a code comment in place explaining the fix and citing its own history. This plan's
job is to confirm that, and to close the few genuinely-open gaps direct reading turned up: no
error feedback on a failed manual-entry save, and no success feedback on either entry path.

## What's already implemented (read directly, not assumed)

- **File-upload GPX/FIT import**: `packages/client/src/pages/RunsPage.vue`'s `.pagehead` button
  (`triggerImport()` → hidden `<input type="file" accept=".gpx,.fit">` → `onFileChosen()` →
  `runsStore.importFile()` → `runService.importRunFile()`, a multipart `POST /api/runs/import`)
  is complete and wired to `importError` inline feedback on failure.
  Server-side: `packages/server/src/gpx.ts`, `packages/server/src/fit.ts`,
  `packages/server/src/services/runImportService.ts`, `packages/server/src/routes/runs.ts`.
- **Manual distance/duration entry**: `RunsPage.vue`'s `.manual-form` (toggled by the "Manuell"
  button, `showManualForm`) — name/date/km/minutes fields, `canSubmitManual` guard,
  `submitManual()` → `runsStore.logManual()` → `runService.logManualRun()`
  (`POST /api/runs`). Complete, but has **no error handling** (see Task 2) and **no success
  feedback** (see Task 3).
- **Health Connect import trigger**: `packages/client/src/health/healthConnect.ts`
  (`isHealthConnectAvailable`, `requestHealthConnectPermissions`,
  `importNewHealthConnectWorkouts`, real `capacitor-health` route/HR reads, verified against its
  native Kotlin source per that file's own header comment) plus a full card in
  `packages/client/src/pages/ProfilePage.vue` (lines ~419-429: `connectHealthConnect()`,
  Android-only visibility gate, busy/status feedback). This lives on Profile, not Runs — a
  deliberate placement (one-time permission grant, then automatic on every app resume via
  `syncStore.ts`, not a per-visit Runs-page action) and not a bug. The one real gap: **Runs never
  mentions Health Connect exists**, so a user who lands on an empty Runs page with no GPX file
  handy has no path to discovering the Android auto-import option without already having visited
  Profile (Task 4).
- **Route map + replay**: `packages/client/src/components/run/RunMap.vue` (Leaflet + OSM tiles,
  polyline, start/end markers, imperative `setMarkerPosition()` for per-frame replay updates,
  reads `--fire`/`--bg`/`--green`/`--red`/`--blue-hi` off `:root` instead of hardcoding hex) and
  `packages/client/src/components/run/RunReplay.vue` (interpolated playback with pause-gap
  collapsing, 1×/2×/4×/8× speed, scrubber, live pace/HR/cadence readouts gated on whether the
  source data actually has them, `prefers-reduced-motion` disables autoplay but keeps scrubbing)
  are both fully built. No changes needed.
- **Duplicate-button empty-state bug**: `RunsPage.vue` lines 136-149 carry an explicit comment
  recording that this was already found and fixed (citing `workplan-v1` §1.10a and the same
  lens-3 §2.2 finding this workstream's brief cites) — the second `.runs-empty` card used to
  duplicate the `.pagehead` import button and no longer does; the empty state now shows
  explanatory copy only, with the one real import action living solely in `.pagehead`. Task 1
  re-verifies this rather than assuming the comment is accurate, since the whole point of a
  duplicate-button regression is that it's easy to reintroduce silently.

## Architecture

Vue 3 (`<script setup>`, Composition API) + Ionic Vue + Pinia (`runsStore.ts`), same conventions
as every other page in `packages/client/src/pages`. No offline/sync-outbox involvement — Runs
data is online-only REST (`GET/POST/DELETE /api/runs*`), unlike the Train loop's IndexedDB outbox.

## Tech Stack

Vue 3, TypeScript, Pinia, Ionic Vue, Leaflet (map rendering). No test framework is configured for
`packages/client` today (confirmed: no `vitest.config.*` anywhere in the repo, no
`@vue/test-utils`/`jsdom`/`happy-dom` in `packages/client/package.json`, zero `*.test.ts`/
`*.spec.ts` files under `packages/client/src`) — client-side verification in this codebase is
manual/visual (see `mobile-viewport-check` skill), not automated component tests. This plan does
not introduce new test infrastructure for a workstream this small; each task's verification step
is manual, mirroring how the rest of `packages/client` is validated today.

## Spec

- `docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §3.5 — this workstream's
  scope and its explicit out-of-scope note (repeated verbatim in Global Constraints below).
- `audit/plan-c-new-ui-rebuild.md` §3 Phase 5 — original spec: file-upload/manual entry, Health
  Connect trigger, route map + replay, single-action-per-entry-method empty state.
- `audit/engagement-audit-v5.md` §5 — confirms the duplicate-import-button bug and the two
  out-of-scope items (Workout/Läufe tab merge, `/runs` nav-orphan discoverability).

## Global Constraints

1. The empty state must offer exactly one clear action per entry method (closing the specific
   duplicate "GPX/FIT importieren" button bug both `plan-c` and `engagement-audit-v5.md`
   independently found).
2. The Workout/Läufe tab-merge question and `/runs` discoverability are explicitly out of scope
   for this workstream.

---

## Task 1 — Verify the duplicate-import-button bug is actually closed

**Files:** `packages/client/src/pages/RunsPage.vue` (read-only verification; no edit expected
unless verification fails).

**Context:** `RunsPage.vue` lines 104-149 currently render exactly one import trigger
(`.pagehead`'s `GPX/FIT importieren` button, always visible) and, only when
`runsStore.loaded && runsStore.runs.length === 0`, a `.runs-empty` card with explanatory copy and
**no button of its own**. A comment at lines 136-142 records this as an intentional fix, citing
`workplan-v1` §1.10a and the same lens-3 §2.2 finding. This task confirms that reading is correct
by actually running the app, not just re-reading the comment.

- [ ] Run the client dev server (`pnpm --filter @liftr/client dev`, or the repo's existing `pnpm
      dev` if the server is also needed for the API), navigate to `/runs` with an account that has
      zero runs (or a fresh account/token), and confirm: exactly one visible control labeled "GPX/
      FIT importieren" exists on screen, plus exactly one "Manuell" toggle — not two of either.
- [ ] Confirm the empty-state copy ("Noch keine Läufe erfasst...") reads correctly and points at
      "oben rechts" (top right), which must actually match where the `.pagehead` buttons render at
      mobile width — check this specifically at a narrow viewport (390px) using the
      `mobile-viewport-check` skill, since "oben rechts" is a spatial claim that depends on layout.
- [ ] If verification finds the bug is NOT actually closed (e.g., a regression since the cited fix,
      or the fix doesn't hold at some viewport), fix it by removing whichever control is the
      duplicate — keep the `.pagehead` button per the existing comment's own reasoning (it's the
      only one that's always present once runs exist, so it's the more consistent single entry
      point), not the empty-state one.
- [ ] If verification confirms the fix holds, do not modify `RunsPage.vue` for this task — leave
      the existing comment as accurate documentation and move on. Do not add a redundant second
      comment restating the same fact.

## Task 2 — Manual-entry save has no error handling

**Files:** `packages/client/src/pages/RunsPage.vue`

**Context:** `submitManual()` (lines 73-88) calls `await runsStore.logManual({...})` with no
`try`/`catch`. If the request fails (offline, server error, validation rejection), the exception
propagates unhandled — the form silently fails to close, `showManualForm` stays `true`, and the
user gets zero indication anything went wrong (contrast with `onFileChosen()`, which already
catches and shows `importError`). This is the one real functional gap Task-1's verification pass
is not expected to find, since it's a code-review finding, not a UI-visible empty-state issue.

- [ ] Add a `manualError = ref<string | null>(null)` alongside the existing `importError`.
- [ ] Wrap `submitManual()`'s body in `try { ... } catch (err) { manualError.value = (err as
      Error).message; } ` — on success, clear `manualError.value = null` before the existing
      form-reset lines (`showManualForm = false; manualName.value = ""; ...`); on failure, leave
      the form open with the user's entered values intact (do not reset fields) so they don't lose
      their input.
- [ ] Render `manualError` in the template next to the manual form, reusing the existing `.error`
      class: `<p v-if="manualError" class="error">{{ manualError }}</p>` placed inside or directly
      below `.manual-form`, matching how `importError` is placed relative to `.pagehead`.
- [ ] Manual verification: temporarily stop the server (or use browser devtools to block the
      `POST /api/runs` request), submit the manual form, and confirm an inline error appears and
      the form's entered values are preserved rather than cleared.

## Task 3 — No success feedback on either entry path

**Files:** `packages/client/src/pages/RunsPage.vue`

**Context:** The app has an existing, established feedback pattern for exactly this situation —
`packages/client/src/composables/useToast.ts`'s `useToast()`, already used in
`packages/client/src/pages/ProfilePage.vue` for save confirmations (`toast("Trainingsprofil
gespeichert.")`, etc.), rendered globally via `ToastHost.vue` mounted in `App.vue`. `RunsPage.vue`
does not import or use it at all today — a successful GPX/FIT import or manual entry currently
gives the user no positive confirmation beyond the imported run silently becoming the selected
run in the list, which is easy to miss (especially for manual entry, where the form just closes).

- [ ] Import `useToast` in `RunsPage.vue`: `import { useToast } from "../composables/useToast";`
      and `const { toast } = useToast();`.
- [ ] In `onFileChosen()`'s success path (after `await selectRun(run.id)`, inside the existing
      `try` block, before `finally`), call `toast("Lauf importiert.")`.
- [ ] In `submitManual()`'s success path (after Task 2's error handling is in place, once
      `runsStore.logManual()` resolves without throwing), call `toast("Lauf gespeichert.")`.
- [ ] Manual verification: import a real GPX/FIT file and separately submit the manual form;
      confirm a toast appears for each and auto-dismisses (per `useToast.ts`'s existing
      `AUTO_DISMISS_MS = 2500` behavior — no changes needed to `useToast.ts` itself).

## Task 4 — Runs empty state doesn't mention Health Connect exists

**Files:** `packages/client/src/pages/RunsPage.vue`

**Context:** Health Connect import (Task list item, already fully built per "What's already
implemented" above) lives entirely on `ProfilePage.vue`. A user who opens Runs with zero runs and
no GPX file on hand — the exact empty-state scenario — has no way to learn that Android automatic
import exists unless they've already found it on Profile. This is copy-only: it must **not**
duplicate the Health Connect button on the Runs page (that would reopen Global Constraint 1's
"exactly one clear action per entry method" — Health Connect's actual action, the "Health Connect
verbinden" button, correctly stays the single instance on Profile) and must **not** touch
`/runs` nav-orphan discoverability (explicitly out of scope per Global Constraint 2 — this is
in-page copy, not navigation).

- [ ] In `RunsPage.vue`'s `.runs-empty` section (around line 143-149), add one additional sentence
      to the existing `<p>` (or a second `<p>`), conditioned on Android-native availability using
      the same `isHealthConnectAvailable()` check `ProfilePage.vue` already uses (import it from
      `../health/healthConnect`): something in the spirit of "Läufe mit Route werden auf Android
      automatisch über Health Connect importiert, sobald du das in deinem Profil einmalig
      verbindest." Keep it to plain text — no button, no link component beyond what already exists
      in this codebase's patterns (a plain-text mention is sufficient; do not build new
      cross-page-navigation affordances as part of this task, since in-page routing polish
      is not this task's scope).
- [ ] Manual verification: confirm the added sentence only appears on a native Android
      build/emulator (or with `isHealthConnectAvailable()` mocked true in a local dev check) and is
      absent on web, matching the same gating `ProfilePage.vue`'s Health Connect card already uses.

---

## Self-review

- **No placeholders**: every task names exact files, exact function/line anchors, and exact code
  changes (new refs, exact `toast()` call sites, exact conditional). Nothing says "add appropriate
  error handling" without specifying where or how.
- **Proportional to scope**: four tasks total, three of them small (a `try`/`catch`, two `toast()`
  calls, one conditional sentence), for a workstream Plan C itself rates Complexity S. This plan
  does not invent a redesign, a new test framework, or new components for a workstream whose actual
  code was found substantially complete on inspection — RunMap.vue and RunReplay.vue needed zero
  changes, and Task 1 explicitly allows for "verification confirms the fix holds, do nothing."
- **Global Constraints honored**: Task 1 re-verifies (not re-implements) the single-action-per-
  entry-method empty state; Task 4 explicitly avoids adding a second Health Connect action to
  Runs, and explicitly avoids touching nav-level `/runs` discoverability or the Workout/Läufe
  merge question, per the orchestration plan's binding out-of-scope note.
- **Grounded in real code, not assumption**: every claim above ("already implemented," "no error
  handling," "no toast usage") was confirmed by reading the actual file content, not inferred from
  the audit documents alone — the audit documents describe a bug (duplicate button) that reading
  the live code shows is already fixed, which is itself the main finding this plan reports.
