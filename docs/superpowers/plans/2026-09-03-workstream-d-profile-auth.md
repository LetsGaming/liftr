# Workstream D: Profile & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Plan C's Phase 4 (Profile, Data & Auth) scope by verifying each sub-area against
the current, already-substantially-reworked codebase, and building only the genuine gaps found —
not re-implementing what already works.

**Architecture:** This is a verification-first plan. `ProfilePage.vue` already carries the Nebula
domain-group rework (four `.group-header` sections: Trainingsprofil / Fortschritt / Daten & Server /
Über) and `AuthGate.vue` is already the dedicated 401 entry point Plan C originally called for. Every
sub-area gets a read-and-confirm task before any build task; a build task is only written where the
verification task found a real, specific gap.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), Ionic Vue, Pinia stores, TypeScript,
`@liftr/shared` for pure calculation helpers (`computeBodyweightTrend`). No client-side test runner
exists in `packages/client` (no vitest, no `*.test.ts` files) — verification steps rely on
`vue-tsc --noEmit` (typecheck) and the `mobile-viewport-check` skill, the same de facto conventions
the rest of this codebase's Vue work already follows.

**Spec:** `audit/plan-c-new-ui-rebuild.md` §3 Phase 4 ("Profile, Data & Auth"), read against current
code per `docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §3.4's note that this
workstream is likely already substantially complete.

## Global Constraints

- Onboarding fields must be independently settable later — never a hard gate.
- Equipment/gym setup deferred until first actually needed rather than front-loaded.
- Bodyweight empty-state copy must name the concrete action, not just a threshold.

---

## 0. Verification findings summary (read before executing tasks)

Direct reads of the current code (2026-09-03) confirm Phase 4 is **almost entirely already shipped**.
Of the five sub-areas Plan C's Phase 4 scopes, four verify clean with no gap. One real, narrow gap
was found: the bodyweight empty-state copy on `ProfilePage.vue` states the fallback value but never
tells the user what action closes it, which is exactly the Global Constraint above and exactly
lens-3's Low finding Plan C cites. Task 6 is the only build task in this plan.

| Sub-area | Verification result |
|---|---|
| Onboarding | Confirmed staged/skippable, every field independently re-editable in `ProfilePage.vue`. No gap. |
| Equipment & gym setup | Confirmed deferred at the *detail* level (bar weight + plate inventory); coarse equipment ownership is asked once during onboarding but is skippable and harmlessly defaulted. Documented as an accepted, reasoned deviation — no build task. |
| Bodyweight log | Log input + trend chart (`BodyweightTrend.vue`) both fully implemented. Empty-state copy is the one gap — see Task 6. |
| Data & backup export | CSV/ZIP export fully implemented, quiet-tier styled, working error path. No gap. |
| Auth/token entry | `AuthGate.vue` confirmed to be a real, working 401-triggered full-screen entry point (verified end-to-end against `packages/server/src/auth.ts`'s `requireAuth`), with a working reveal toggle in both `AuthGate.vue` and `ProfilePage.vue`'s fallback token card. Plan C's own "needs a direct code check against `auth.ts`" migration risk flag is now resolved: the 401 path is real and reachable. No gap. |

---

## Task 1: Verify onboarding against Plan C's staged/skippable spec

**Files (read only):**
- `packages/client/src/components/ui/OnboardingGuide.vue`
- `packages/client/src/components/onboarding/OnboardingDraft.ts`
- `packages/client/src/components/onboarding/{WelcomeStep,AboutStep,ExperienceStep,FrequencyStep,EquipmentStep,PlatesStep,DoneStep}.vue`
- `packages/client/src/pages/ProfilePage.vue` (Trainingsprofil/Equipment/Scheiben & Stange cards)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: a written confirmation (recorded in this plan's checklist below) that no build task is
  needed for onboarding. No code changes in this task.

- [ ] **Step 1: Confirm the wizard is staged, one question per screen**

Read `OnboardingGuide.vue:34-50`. Confirm `StepKey` is `welcome | about | experience | frequency |
equipment | plates | done`, that `steps` is a computed list (not a fixed array), and that `plates`
only appears when `needsPlatesStep(draft)` is true (`OnboardingGuide.vue:47`). This matches Plan C's
"staged" requirement — one focused screen per question, not a flat form.

- [ ] **Step 2: Confirm onboarding is skippable, not a hard gate**

Read `OnboardingGuide.vue:116-127` (`skip()`). Confirm it calls `settingsStore.saveProfile({})` (an
empty-but-non-null profile, so onboarding never reappears) and dismisses the sheet without requiring
any field to be filled in. Confirm the header's `<button class="skip-btn" @click="skip">Später</button>`
(`OnboardingGuide.vue:136`) is present on every step, not just the first.

Also confirm `canContinue` (`OnboardingGuide.vue:61-65`) only blocks continuing on `experience`
(`experienceLevel !== null`) and `equipment` (`equipment.size > 0`, which is always true since
`createOnboardingDraft()` at `OnboardingDraft.ts:55` preseeds `equipment: new Set(["bodyweight"])`) —
i.e. no step can actually strand a user who wants to click through without answering.

- [ ] **Step 3: Confirm every onboarding field is independently re-editable later**

Cross-check each onboarding field against `ProfilePage.vue`'s "Trainingsprofil" domain group:

| Onboarding field | Re-editable in ProfilePage.vue? |
|---|---|
| `sex` | Yes — "Trainingsprofil" card, `ProfilePage.vue:268-273` |
| `birthYearInput` | Yes — same card, `ProfilePage.vue:274-277` |
| `experienceLevel` | Yes — same card, `ProfilePage.vue:278-285` |
| `workoutsPerWeek` | Yes — same card, `ProfilePage.vue:286-293` |
| `equipment` (Set) | Yes — "Equipment" card, `ProfilePage.vue:299-329` |
| `barWeightsKg` / `plates` | Yes — "Scheiben & Stange" card, `ProfilePage.vue:331-359`, gated on
  `ownedBarTypes.length > 0` same as onboarding's `needsPlatesStep` |
| `weightInput` (current bodyweight) | Yes — "Körpergewicht" card, `ProfilePage.vue:241-262`, via
  `bodyweight.log()` (a new dated entry, same underlying action as onboarding's initial log) |

Confirm each row against the actual template line ranges cited. Every onboarding field has a live,
independently-saveable counterpart in Profile — no field is onboarding-only. Global Constraint
("onboarding fields must be independently settable later") is satisfied with no build task.

- [ ] **Step 4: Record the finding**

No code changes. This task's only output is confirming rows 1-3 above hold against the real files —
if any row does NOT hold when you read the actual current file (e.g. a future refactor removed a
Profile card), stop and write a new build task before proceeding to Task 2, using the same file/line
citation style as this task.

---

## Task 2: Verify equipment & gym setup deferral against Plan C's "not front-loaded" requirement

**Files (read only):**
- `packages/client/src/components/onboarding/OnboardingDraft.ts:71-74` (`needsPlatesStep`)
- `packages/client/src/components/onboarding/EquipmentStep.vue`
- `packages/client/src/components/onboarding/PlatesStep.vue`
- `packages/client/src/pages/ProfilePage.vue:331-359` ("Scheiben & Stange" card)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a documented decision (no build task) on the equipment-timing tension described below.

- [ ] **Step 1: Confirm the plate/gym *detail* setup is genuinely deferred**

Read `needsPlatesStep` (`OnboardingDraft.ts:72-74`): it returns true only if the draft's `equipment`
Set contains `barbell`, `ez-bar`, or `trap-bar`. `OnboardingGuide.vue:47` only inserts the `plates`
step into the wizard when this is true. A bodyweight-only or dumbbell-only user never sees a
plate-inventory or bar-weight screen during onboarding. This is the concrete "gym setup" detail Plan
C's Phase 4 spec means by "bar-weight-by-type, per-plate-size inventory" — confirmed deferred, not
front-loaded, and still independently completable later via the same "Scheiben & Stange" card in
`ProfilePage.vue` (only rendered `v-if="ownedBarTypes.length > 0"`, so it too stays hidden for users
who never need it).

- [ ] **Step 2: Identify and document the coarse equipment-ownership tension**

The *coarse* equipment checklist (`EquipmentStep.vue` — "Trainingsgerät"/"Weiteres Equipment" chips)
is asked as onboarding step 5, before the user has created a single routine or logged a single
workout. Read literally, Plan C's Phase 4 line ("deferred until the first moment a substitution or
plate breakdown actually needs it... rather than front-loaded") would put this checklist itself
outside onboarding too.

Record this as an accepted, reasoned deviation rather than a defect, for these reasons (verify each
against the cited file before accepting the reasoning, don't take it on faith):

1. Equipment data feeds routine/exercise suggestions from the very first routine a user builds
   (Workstream C's scope, `components/routine-wizard/*.vue` — equipment-aware substitution), which
   for most users happens immediately after onboarding finishes. The gap between "collected" and
   "needed" is realistically minutes, not a meaningfully front-loaded ask.
2. It's skippable at zero cost: `createOnboardingDraft()` (`OnboardingDraft.ts:55`) preseeds
   `equipment` with `"bodyweight"`, so `canContinue`'s `equipment.size > 0` check
   (`OnboardingGuide.vue:63`) is already satisfied before the user touches anything — a user can tap
   "Weiter →" through this step with zero interaction, or tap "Später" to skip the whole wizard.
3. The expensive, actually-deferrable *detail* (bar weight, plate inventory — the part Plan C's own
   evidence citation is really about, since that's what "plate breakdown" names) is the part that is
   genuinely deferred per Step 1 above.

- [ ] **Step 3: Record the finding**

No code changes. If a future reviewer disagrees with the Step 2 reasoning and wants the coarse
equipment checklist moved out of onboarding entirely (e.g. into a first-routine-creation prompt),
that is a product decision requiring its own brainstorm per `superpowers:brainstorming` — out of
scope for this verification-first plan, which only builds confirmed gaps.

---

## Task 3: Verify data & backup export against Plan C's spec

**Files (read only):**
- `packages/client/src/pages/ProfilePage.vue:204-225` (script), `:431-438` (template, "Daten-Export"
  card)
- `packages/client/src/services/exportService.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a written confirmation that no build task is needed for export.

- [ ] **Step 1: Confirm CSV/ZIP export is implemented and reachable**

Read `ProfilePage.vue:209-225` (`exportData()`). Confirm it calls `fetchExportZip()`, builds an
object URL, and triggers a download named `liftr-export-<ISO date>.zip`. Read
`packages/client/src/services/exportService.ts` to confirm `fetchExportZip()` actually hits a real
server export endpoint (not a stub) and returns a `Blob`.

- [ ] **Step 2: Confirm the error path and loading state are real, not decorative**

Confirm `exporting` (button disabled + "Wird erstellt…" label while awaiting the fetch,
`ProfilePage.vue:434-436`) and `exportError` (rendered in red via `var(--red)`,
`ProfilePage.vue:437`) are both wired to the actual `try/catch` around `fetchExportZip()`
(`ProfilePage.vue:212-223`), not left as unused refs.

- [ ] **Step 3: Confirm quiet-tier styling is applied**

Confirm the "Daten-Export" `<section>` (`ProfilePage.vue:431`) carries `class="card card--quiet"`,
matching the orchestration doc's note that the "Daten & Server" domain group already has quiet-tier
styling applied. Confirm `.card--quiet` (`ProfilePage.vue:652-658`) is a real style rule (reduced
opacity, `var(--surface)` background), not a no-op class.

- [ ] **Step 4: Record the finding**

No code changes. Plan C's "Data & Backup: CSV/zip export" line is fully satisfied. The other half of
that line, "sync status/pending-count," is explicitly out of scope here — the orchestration doc's §2
file-boundary table assigns the sync indicator to Workstream A (`stores/syncStore.ts` /
Today-screen chrome), not Profile. Do not add a duplicate sync-status UI to `ProfilePage.vue`.

---

## Task 4: Verify auth/token entry point against Plan C's spec and resolve the migration risk flag

**Files (read only):**
- `packages/client/src/components/ui/AuthGate.vue`
- `packages/client/src/pages/ProfilePage.vue:150-155`, `:388-417` (API-Token card)
- `packages/server/src/auth.ts`
- `packages/client/src/App.vue:141-142,233` (mount point)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a written resolution of Plan C's open migration-risk flag (quoted below). No code changes
  in this task.

- [ ] **Step 1: Resolve Plan C's open migration/schema risk flag**

Plan C §3 Phase 4 states: "lens-3 §2.5 notes it could not verify an actual 401/rejected-token flow
end-to-end in the current build... this needs a direct code check against
`packages/server/src/auth.ts`'s enforcement behavior before Phase 4 is scheduled."

Read `packages/server/src/auth.ts:23-29` (`requireAuth`). Confirm: when `env.token` is set, a
request without a matching `Bearer <token>` Authorization header gets `reply.code(401).send({error:
"unauthorized"})`; when `env.token` is unset (dev mode), the check is skipped entirely. This is real,
active enforcement — not a stub — so the flag is resolved: a dedicated full-screen 401 prompt is
buildable and, per Step 2 below, already built.

- [ ] **Step 2: Confirm `AuthGate.vue` is the dedicated 401 entry point, end-to-end**

Read `AuthGate.vue:20-34` (`check()`): on mount it calls `api.get("/api/health")`; if that throws an
`ApiError` with `status === 401`, `status` becomes `"needs-token"`, which the template
(`AuthGate.vue:55-84`) renders as a full-screen centered card — not a field buried in Profile. This
exactly matches Plan C's "dedicated full-screen unauthenticated/401 prompt rather than requiring the
user to already know to scroll into Profile to find it."

Confirm `App.vue:141` mounts `<AuthGate>` as the outermost wrapper around the whole app shell
(`</AuthGate>` closes at `App.vue:233`, after `<OnboardingGuide>` and the router view), so a 401
blocks the entire app, not just one route.

- [ ] **Step 3: Confirm the reveal toggle works in both locations**

`AuthGate.vue:62-78`: `tokenInput` bound to an `<input>` whose `:type` is `tokenVisible ? 'text' :
'password'`, toggled by a button with `aria-label` swapping between "Token anzeigen"/"Token
verbergen" and an eye emoji swap (`👁`/`🙈`). Confirm the identical pattern exists in
`ProfilePage.vue:400-416` as the fallback path for a user who wants to change the token after
first unlock without triggering a fresh 401.

- [ ] **Step 4: Confirm the submit path actually re-validates the token, not just stores it**

Read `AuthGate.vue:38-51` (`submit()`): it calls `setToken(...)` then immediately re-issues
`api.get("/api/health")`; only on success does `status` flip to `"ok"`. On failure it sets
`error.value = "Token abgelehnt — bitte prüfen."` and stays on `"needs-token"`. This is a real
round-trip validation, not blind accept-and-store.

- [ ] **Step 5: Record the finding**

No code changes. Auth/token entry is fully implemented per Plan C's spec, including the previously-
open migration risk flag. No build task.

---

## Task 5: Verify bodyweight log against Plan C's spec

**Files (read only):**
- `packages/client/src/pages/ProfilePage.vue:242-262` (template), `:162-176` (script)
- `packages/client/src/components/ui/BodyweightTrend.vue`
- `packages/client/src/stores/bodyweightStore.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the one confirmed gap this whole plan builds — feeds directly into Task 6.

- [ ] **Step 1: Confirm the log input and save path work**

Read `ProfilePage.vue:162-176`. Confirm `canSave` validates a parsed number in `(0, 400)` and
`saveWeight()` calls `bodyweight.log(...)`, clearing the input on success. Confirm the input accepts
German decimal comma (`weightInput.value.replace(",", ".")`, matching the placeholder "z.B. 72,5").

- [ ] **Step 2: Confirm the "simple time series" requirement is met**

Read `BodyweightTrend.vue` in full. Confirm it's a real inline SVG sparkline (no charting library,
matching the codebase's stated `ProgressChart.vue` convention) driven by `computeBodyweightTrend`
from `@liftr/shared`, rendering an EMA-smoothed label (`"52,5 kg · stabil · 30 Tage"` style) plus a
polyline. Confirm it's only rendered once `bodyweight.entries.length > 1`
(`ProfilePage.vue:261`) — i.e. gracefully absent for a first-ever entry rather than showing an
empty/broken chart.

- [ ] **Step 3: Check the empty-state copy against the Global Constraint**

Read `ProfilePage.vue:258-260`:

```html
<p v-else class="current" style="color: var(--faint)">
  Noch kein Eintrag — Rang-Berechnung nutzt vorläufig 75 kg.
</p>
```

This is the gap. It states the fallback *value* (75 kg) but never names the concrete action that
closes the empty state — the input field is two elements above it in the DOM, but nothing in the
copy itself says "enter your weight above" or similar. This is exactly the lens-3 Low finding Plan C
cites ("current bodyweight empty state is comparatively vague next to other empty states in the
app") and exactly the Global Constraint at the top of this plan ("bodyweight empty-state copy must
name the concrete action not just a threshold"). Proceed to Task 6 to fix it.

- [ ] **Step 4: Record the finding**

Everything else in this sub-area (input, save, trend chart) verifies clean. Task 6 is the only build
task needed for bodyweight log.

---

## Task 6: Fix bodyweight empty-state copy to name the concrete action

**Files:**
- Modify: `packages/client/src/pages/ProfilePage.vue:258-260`

**Interfaces:**
- Consumes: the gap identified in Task 5 Step 3.
- Produces: updated empty-state copy. No new functions, no new props — a template text change only.

- [ ] **Step 1: Write the new copy**

Replace the vague fallback-only copy with copy that names the action first, keeping the 75 kg
fallback context as a secondary clause (so a user who doesn't act yet still understands the
consequence, but the primary sentence is an instruction):

```html
<p v-else class="current" style="color: var(--faint)">
  Trag dein Gewicht oben ein — bis dahin nutzt die Rang-Berechnung vorläufig 75 kg.
</p>
```

Apply this exact replacement to `ProfilePage.vue:258-260` via a direct string replace (old block is
the 3-line `<p v-else class="current" ...>` shown in Task 5 Step 3, including its exact indentation).

- [ ] **Step 2: Typecheck the client package**

No test runner exists for `packages/client`, so this project's own convention for a template-only
change is a typecheck pass (catches any Vue SFC template/script mismatch introduced by the edit) —
same verification the codebase's own Vue work relies on for non-logic template edits.

Run: `cd packages/client && npx vue-tsc --noEmit`
Expected: no new errors introduced by this change (pre-existing errors, if any, are unrelated —
confirm by checking whether they reference `ProfilePage.vue`; if a new error does reference
`ProfilePage.vue`, the edit broke something and must be fixed before continuing).

- [ ] **Step 3: Verify at mobile viewport**

Liftr is primarily a mobile PWA; a copy-length change can wrap differently at narrow widths than the
old shorter string. Invoke the `mobile-viewport-check` skill against the Profile page (the
Körpergewicht card, in its empty state — i.e. an account/test profile with zero bodyweight entries)
to confirm the new sentence doesn't overflow or clip the `.card` container at 320px/390px widths,
per this codebase's own standing convention for any change under `packages/client/src`.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/ProfilePage.vue
git commit -m "fix(profile): name the concrete action in bodyweight empty-state copy

Closes lens-3's Low finding (plan-c-new-ui-rebuild.md Phase 4) — the empty
state named only the 75kg rank-calculation fallback, never the action
(logging a weight) that closes it."
```

---

## Self-review (per superpowers:writing-plans)

**Spec coverage:** Plan C Phase 4's five bullet points — Onboarding/Profile, Equipment & Gym Setup,
Bodyweight log, Data & Backup, Auth/token entry — each have a verification task (1-5) above, and the
one real gap (bodyweight empty-state copy) has a build task (6) with an exact diff. Phase 4's
"Migration/schema risk flag" (the unverified 401 path) is explicitly resolved in Task 4 Step 1 against
the real `auth.ts` source, closing the one open question Plan C itself flagged as blocking. Phase 4's
success criterion ("token field has a working reveal toggle; a fresh account can complete onboarding
... without ever being blocked on equipment/gym setup") is verified true in Task 1 Step 2 and Task 4
Step 3.

**Placeholder scan:** No "TBD"/"implement later"/"add appropriate handling" language anywhere above.
Task 6's code step contains the exact replacement HTML, not a description of one. Every verification
step cites exact file:line ranges from files actually read while writing this plan, not assumed
locations.

**Type consistency:** Task 6 introduces no new functions, props, or types — a template string
replacement only — so there is no cross-task signature to keep consistent. The file:line citations
in Tasks 1-5 were each checked against the actual file content read during planning (not inferred),
so a task-6-only executor reading Task 5's citation of `ProfilePage.vue:258-260` will find the exact
block quoted.

**Overall assessment:** this workstream is not a five-part rebuild — it is one nine-word copy fix.
Every other Phase 4 requirement Plan C specified was already shipped by the time this plan was
written, including the one item Plan C itself marked as unverified (the 401 path). Report this
plainly rather than padding the plan with unnecessary rework, per this plan's own instructions.
