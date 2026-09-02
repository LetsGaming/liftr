# UX Flow Audit v5 — "Does the current organization have a right to exist?"

Method: 5 independent agents tested cold (no prior audit context), each against the **live app** (localhost:5173) as a real user performing a real task, then cross-checked findings against source. Scope: top-level IA, routine creation, Overview/Ranks, Profile, workout logging.

## Verdict

**The organization is right, mostly. The content inside it is not.** Nobody needs a rearchitecture of tabs or a merged-inbox concept — the 5-tab IA, the wizard shape, and the two-dashboard split are all defensible designs that a fresh test didn't reject. What testing *did* reject is duplication (the same rank data rendered three times), a silently broken save path in the flagship routine-suggestion feature, a settings page that's really four settings pages taped together, and zero prioritization anywhere — every screen presents everything at the same volume, so "what needs my attention" is never answered without visiting every tab yourself.

If you fix the P0 bug and cut the duplication, this IA does not need a rework. If you leave duplication and the flat lists in place, it will keep feeling more complex than it is as more features land.

## P0 — Ship-blocking

**Muscle-guided routine creation silently fails to save.** The suggestion engine returns fractional rep targets (3.75, 4.25...) for bodyweight substitutes; the server's zod schema requires `reps: z.number().int()`; `RoutineWizard.vue`'s `save()` has no `.catch`, so the button just resets with zero user-facing error. This is the *guided* path — the one meant to solve "routine creation is our biggest friction point" — and it's a dead end on first real use.
- Fix: round/validate reps in `routineSuggestionService.ts`; add a client-side integer guard before POST; surface `save()` failures as a toast instead of swallowing them.

**Numeric set-entry can silently corrupt values.** `NumberStepper.vue`'s direct-entry input autofocuses but doesn't select existing text, so typing over a stale value concatenates digits ("0" + "9" → "09", or worse mid-set). One-line `select()`-on-focus fix, but it's a real data-integrity bug in the single most-repeated action in the app.

## P1 — Duplication (the actual "does this need reorganizing" answer)

Three separate agents independently found the same shape of problem in three different places: **content that already has a canonical home gets re-rendered elsewhere instead of linked to.**

- **Overview repeats Ranks.** The "Top Ränge" tile on Overview shows the identical top-3 exercises/tiers/LP values that Ranks shows in full, plus the overall-tier tile duplicates the subject of the entire Ranks page. Two near-identical LP explainer strings exist (Overview + Ranks), independently worded.
- **Overview repeats Profile.** Overview's "Entdecken" row has a "Daten-Export" shortcut that duplicates the export feature that actually lives on Profile.
- **Profile is 4 domains flattened into one scroll.** Bodyweight/training-profile/equipment/plates (training config), XP toggle (stats, not a setting), API-Token/Health-Connect/Export (server admin), attributions (About) — all rendered as identical `.card` sections in one continuous list. No grouping, no visual tier for the rarer/riskier items (token, export) vs. the everyday ones (bodyweight log).

None of this is "wrong content," it's content with **no single source of truth for where it's displayed**. The fix is subtraction, not restructuring:
1. Cut Overview's Top-Ränge tile and Daten-Export shortcut down to single-line links into Ranks/Profile.
2. Unify the LP-explainer copy into one string, reused via the existing `InfoToggle` component.
3. Split Profile into headed sections: Trainingsprofil / Fortschritt / Daten & Server / Über — this alone (not new IA) resolves the "flat list" complaint.

## P2 — Missing prioritization / "needs attention"

You explicitly asked whether a unified "needs attention" inbox is warranted. **No — not as a new inbox/page.** Every agent found that the *raw signal* already exists per-page (recovery-zone card, weekly-rank-up-pending caption, resume-workout card) but is rendered with the same neutral visual weight as everything else, and nothing surfaces across tabs (no badges, no dots). The fix that matches the evidence is smaller than an inbox:
- Give Overview's existing action-relevant cards (resume workout, rank-up-pending, streak-at-risk) actual visual priority — not a new section, just distinct treatment from the flat stat tiles below them.
- Consider a single small badge/dot on the Overview or Ranks tab icon when a rank-up is pending — cheap, doesn't require a new surface.
- Don't build a merged inbox: nothing found suggests users need cross-domain triage; they need the one page they already check (Overview) to visually rank its own content.

## P3 — Structural notes that don't need action, but are real

- **Workout/Läufe "merge" is cosmetic, not unified.** The switcher only appears on the finish screen, never mid-session, and Läufe is a completely different paradigm (GPX import / retroactive manual entry vs. live logging). It reads as two features sharing a tab slot. Either make this genuinely not-a-merge (fine, just stop implying otherwise) or don't surface the switcher as if it's a mode toggle within one session.
- **Workout vs. Exercises icons are visually confusable** at tab-bar size (both read as "barbell"-ish).
- **`/runs` is a live but nav-orphaned route** — reachable, not dead code, just not discoverable except via the switcher.
- Wizard shape (PathChooser → Pick/FastPath → Review) is validated as one coherent task with real glance-checks (`useRoutineReviewChecks.ts`) — not a maze, don't touch the step count.
- Rest timer, autosave/session-resume, and finish-sequence motion are all validated as working correctly and don't need rework — RestTimer is well-integrated (inline, skippable, intentionally non-persisted), and `activeWorkoutStore.ts` persists after every mutation so app kill/lock mid-set is safe.
- Finish screen has no explicit "Fertig" exit — minor dead-end, add a CTA.

## What this means for planning

Don't spend a phase on IA rework. Spend it on: (1) the save-path bug, (2) the NumberStepper text-selection bug, (3) a duplication-removal pass across Overview/Ranks/Profile, (4) a Profile section-header pass, (5) visual re-weighting of Overview's action cards. That's a tighter, higher-confidence scope than "reorganize the app," and it's what independent cold-testing actually surfaced — not a rewrite thesis.
