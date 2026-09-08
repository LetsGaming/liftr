# Roadmap

Liftr's planning history lives in `docs/superpowers/plans/` (task-by-task implementation plans)
and `docs/superpowers/specs/` (approved design specs, some implemented directly without a
separate plan doc). This file is the honest, forward-looking summary of that material as of
2026-09-07 — what's actually still open, not a restatement of what already shipped.

**The short version: there is very little open right now.** Every major initiative tracked in
`docs/superpowers/plans/` and `audit/workplan-v1.md` is marked shipped and independently
re-verified (see each plan's own status header, and `audit/workplan-v1.md` §1). If you're looking
for "what's next," it's mostly small, explicitly-deferred items below — not a backlog of
unfinished large work.

## Open work

- **Multi-user login itself.** The schema and backend are already hardened for it (every per-user
  table scoped by `user_id`, every repository/service/route threading a resolved `userId` — see
  [ADR 0006](adr/0006-multi-user-hardening.md)), but there's still no login UI, no passwords, and
  no per-person bearer tokens. `packages/server/src/userContext.ts`'s `resolveCurrentUserId` is
  the one place that needs to change (from a constant to a real session lookup) once that's built.
- **`landmine-press` exercise photo.** The only sourced candidate is a CC BY-SA SVG illustration
  (`bryllim/workout-guide`), not a raster photo — the catalog's image pipeline assumes
  `start.jpg`-style raster files, and browsers won't reliably render an SVG saved with a `.jpg`
  extension. Needs a small extension-aware change in three places (`packages/server/src/routes/
  exercises.ts`'s `hasImage` check, `ExerciseThumb.vue`, `ExerciseDemo.vue`) — deferred as
  lower-priority than the other photo-gap fixes it shipped alongside. See
  `audit/workplan-v1.md` §3.9 and `audit/missing-photo-sourcing-research.md` §4.
- **`goblet-lunge` exercise photo.** Genuinely unsourced — no match found in free-exercise-db,
  wger's ~374-image set, workout-guide, or Wikimedia Commons. Keeps the icon fallback
  indefinitely unless a source turns up.
- **Full-catalog custom illustration.** Commissioning original art for the catalog (rather than
  relying on openly-licensed third-party photos) is explicitly called out as a separate future
  initiative in `audit/missing-photo-sourcing-research.md` §4 — not scheduled, not scoped.

## Explicitly not planned (status quo is intentional)

These were considered and deliberately rejected, not overlooked — listed here so they don't get
proposed as "obvious" additions without the context of why they aren't happening:

- **Social features** — leaderboards, friends, public profiles, percentile comparisons against
  other people. Not planned regardless of how multi-user support itself evolves.
- **Manipulative engagement patterns** — masked/near-miss reward targets, a currency/cosmetics
  economy, chrome-hiding celebration interstitials, gated onboarding quests. Each was weighed and
  rejected against the product owner's own stated line against that class of dark pattern.
- **A full information-architecture rework beyond the current five-tab nav** (Overview / Workout
  / Ranks / Exercises / Profile). Live-tested verdict: "the organization is right, mostly" — the
  older five-zone Today/Train/Progress/Plan/Profile concept from early planning docs was not
  adopted.
- **Automatic dark/light switching from OS preference**, beyond the existing first-launch
  default. Would revisit only if user feedback specifically asks for it.
- **Changing the 9-tier badge system's colors, or adding a second brand gradient.** Rejected
  outright per `audit/nebula-design-system.md` §1.

## Where to look for more detail

- `docs/superpowers/plans/*.md` — one file per implementation effort, each with a status header
  stating shipped/superseded/partial as of its own last verification pass. Treat the status
  header as current truth over the plan's body text, which describes intent at write-time.
- `docs/superpowers/specs/*.md` — approved design specs. Most (rank engine v2, streak/XP
  mechanics, the 2026-09-05 workout-flow and Nebula visual redesigns, the 2026-09-06 XP/rank
  balancing rebalance) were fully implemented, in some cases via directly-committed
  task-by-task work rather than a separate plan file — cross-check against `git log` for
  matching commit prefixes (e.g. `feat(workout-flow): W1 —`, `feat(nebula): F1 —`) if you need
  to confirm a specific spec section actually landed.
- `audit/workplan-v1.md` — the consolidated, most-recently-corrected view of shipped-vs-open
  status as of 2026-09-05, superseded only by the 2026-09-06/07 XP/rank balancing work
  (`docs/adr/0001`, `docs/adr/0005`, and the commits in `git log --oneline` from `f880bb7`
  through `5b7c6e2`), which is not yet folded back into that document.
- If you find a claim in a plan or spec that seems to disagree with what the running app
  actually does, trust the code and file an issue — every plan in this repo has a history of
  being corrected after live re-verification found drift, and that's a healthy pattern to
  continue, not a flaw unique to any one document.
