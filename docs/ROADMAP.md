# Roadmap

Liftr's planning history was originally tracked in `docs/superpowers/plans/` (task-by-task
implementation plans) and `docs/superpowers/specs/` (approved design specs, some implemented
directly without a separate plan doc), plus a consolidated `audit/workplan-v1.md`. Those were
point-in-time planning/audit documents and have since been removed from the repo; this document
reflects the current, forward-looking state directly rather than restating what already shipped.

**The short version: there is very little open right now.** Every major initiative from that
planning history is shipped and independently re-verified. If you're looking for "what's next,"
it's mostly small, explicitly-deferred items below — not a backlog of unfinished large work.

## Shipped

- **Multi-user login.** Real per-person accounts shipped in v1.0.0 and were hardened through
  v1.3.5: an owner (set up on first launch) can invite other people via time-limited invite codes,
  and everyone logs in with their own username/password to a session-scoped bearer token — see
  [ADR 0010](adr/0010-real-per-person-auth-and-sessions.md) (the login/session design itself),
  [ADR 0006](adr/0006-multi-user-hardening.md) (the schema groundwork it supersedes), and
  [`docs/SECURITY.md`](SECURITY.md) for the shipped design.

## Open work

- **`landmine-press` exercise photo.** The only sourced candidate is a CC BY-SA SVG illustration
  (`bryllim/workout-guide`), not a raster photo — the catalog's image pipeline assumes
  `start.jpg`-style raster files, and browsers won't reliably render an SVG saved with a `.jpg`
  extension. Needs a small extension-aware change in three places (`packages/server/src/routes/
  exercises.ts`'s `hasImage` check, `ExerciseThumb.vue`, `ExerciseDemo.vue`) — deferred as
  lower-priority than the other photo-gap fixes it shipped alongside. (Originally tracked in
  `audit/workplan-v1.md` §3.9 and a `missing-photo-sourcing-research.md` doc §4, both since removed
  from the repo; this bullet reflects the current state directly.)
- **`goblet-lunge` exercise photo.** Genuinely unsourced — no match found in free-exercise-db,
  wger's ~374-image set, workout-guide, or Wikimedia Commons. Keeps the icon fallback
  indefinitely unless a source turns up.
- **Full-catalog custom illustration.** Commissioning original art for the catalog (rather than
  relying on openly-licensed third-party photos) was called out as a separate future initiative in
  the same now-removed photo-sourcing research doc — not scheduled, not scoped.

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
  outright per a now-removed `nebula-design-system.md` audit doc §1 (see the note above on
  removed planning material).

## Where to look for more detail

`docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md`, and `audit/workplan-v1.md` were the
original planning/audit sources for this material (implementation plans, approved design specs,
and a consolidated shipped-vs-open tracker respectively) — all have since been removed from the
repo, and this document reflects their conclusions directly rather than pointing back to them. For
whether a given design spec actually landed, cross-check `git log` for matching commit prefixes
(e.g. `feat(workout-flow): W1 —`, `feat(nebula): F1 —`) and the ADRs under `docs/adr/` for anything
that rose to the level of a lasting architectural decision.
- If you find a claim in this roadmap that seems to disagree with what the running app
  actually does, trust the code and file an issue — every plan in this repo has a history of
  being corrected after live re-verification found drift, and that's a healthy pattern to
  continue, not a flaw unique to any one document.
