# Agent instructions for this repo

Liftr is a self-hosted strength + running tracker: Vue 3 (Ionic/Capacitor PWA) client, Fastify
server, SQLite via Drizzle, TypeScript throughout in a pnpm monorepo (`packages/{client,server,
shared,db,ingest}`). Real per-person accounts: an owner (set up on first launch) can invite other
people via time-limited invite codes, and everyone logs in with their own username/password to a
session-scoped bearer token — no `LIFTR_TOKEN` anymore. See `docs/adr/0006-multi-user-hardening.md`
for the schema/scoping groundwork (`docs/adr/0002-single-bearer-token-auth.md` documents the
original single-token design it superseded) and `docs/reference/http-api.md#auth` for how auth
actually works today. The app's UI strings are German; keep any copy you touch consistent with
that.

Start with [`docs/README.md`](docs/README.md) for the full documentation map — architecture, the
HTTP API, concepts (rank engine, XP/streaks, sync), and guides. Docs link to source instead of
restating values that could drift; when a doc and the code it links to disagree, the code is
right — that's a bug in the doc, not the code (see `docs/README.md`'s own note on this).

## Before doing any dev/manual-testing work

Run:

```bash
node scripts/dev-up.mjs --id <your-session-id>
```

Pick `<your-session-id>` yourself — something short and specific to this task/session (e.g.
`rank-decay-bug`, `routine-wizard-copy`). This starts an isolated backend + dashboard pair, each on
its own automatically-picked free port, backed by its own disposable SQLite database.

It then ingests the exercise catalog and the running-standards table into that database and seeds
it with realistic mock data — through the real sync pipeline, not hand-faked, so ranks, PRs,
streaks, and XP all come out correctly derived. See `scripts/seed-mock-data.ts` for exactly what's
seeded. The seed also sets the owner's password (`DEV_OWNER_PASSWORD` in that file), so the printed
dashboard URL goes straight to seeded content — no first-run setup screen. It prints the dashboard
URL, backend URL, login credentials, and log paths to use.

**When you add a feature, extend the seed in the same change.** `scripts/seed-mock-data.ts` is a
living inventory of what every screen needs to render real, non-empty data for manual/agent
verification — a new screen or feature with no seeded data is untested by every future dev-up.mjs
session, not just this one. Matches this doc's own CHANGELOG-entry discipline below: cheap to do
now, easy to forget later.

Exercise catalog *images* are the one thing **not** scoped to your session — they're static,
network-fetched, and identical across every session, so they live in the ordinary shared
`data/images/` dir and are only ever fetched once per machine, not once per session.

The other thing not scoped to your session is the **seed cache** (`data/.devcache/seed-db/`,
`scripts/lib/seedCache.mjs`): catalog ingest + the full mock-data seed are the slow part of this
script, and their output is fully determined by code/schema/catalog state, not by which session
runs it. On a cache hit, `dev-up.mjs` copies a previously-seeded database straight into your
session's own private `liftr.db` instead of re-running that pipeline — the cache is read-only from
a session's point of view, so this never couples your database to another session's. It's not
date-scoped (a cached database's mock-data timestamps stay fixed at whenever it was built); pass
`--fresh` if you specifically need today-relative timestamps.

**Never run bare `pnpm dev` directly, and never reuse another session's server or port.** Each
agent/session gets its own `--id` and therefore its own isolated server, dashboard, and database —
this is what stops concurrent agents from clobbering each other's data or fighting over a port, and
it holds across separate sessions too, not just within one conversation.

## After finishing that work

Run:

```bash
node scripts/dev-down.mjs --id <the-same-session-id>
```

This stops exactly the two processes `dev-up.mjs` started for that id (never a broad process-name
kill — only the recorded PIDs), then deletes that id's database and logs. It never touches the
shared `data/images/` cache. Always pair a `dev-up` with a matching `dev-down`, even if the session
ends abnormally — `dev-up.mjs` also defensively wipes stale state under the same id before
starting, but don't rely on that; clean up your own id when you're done with it.

## Never do this instead

- Never `kill`/`taskkill` a dev process by matching its command name or working directory — you
  cannot tell your own dev server apart from another agent's that way (or from the maintainer's own
  long-running `pnpm dev`). Use `dev-down.mjs`, which kills by exact recorded PID.
- Never delete `data/` or `logs/` wholesale, or edit the repo's own `.env` — those aren't scoped to
  your session and may belong to someone else's in-progress work. `dev-up.mjs`/`dev-down.mjs` only
  ever touch `data/agent-<id>/`, `logs/agent-<id>/`, and (read/append-only) the shared
  `data/images/`.
- Never point a manually-started `pnpm dev` at the default ports/database "just this once" — even
  for a quick check. Use `dev-up.mjs` every time; it's exactly as fast and never collides with
  anyone else's session.

See `docs/guides/local-development.md`'s "Isolated dev sessions & mock data" section for the
human-facing version of this, and `scripts/dev-up.mjs`/`scripts/dev-down.mjs`/
`scripts/seed-mock-data.ts` for the implementation.

## Commands

- `pnpm dev` — bootstrap + run server and client together (single, non-isolated instance; prefer
  `dev-up.mjs` above for agent work).
- `pnpm test` / `pnpm test:watch` — full test suite (vitest), mirrors `packages/*` under `tests/`.
- `pnpm typecheck` / `pnpm lint` — run before considering non-trivial work done.
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migration generate/apply. **Don't hand-edit
  files under `packages/db/drizzle/`** (a `PreToolUse` hook in `.claude/settings.json` blocks
  this) — edit `packages/db/src/schema.ts` and regenerate. See the `db-migration` skill
  (`.claude/skills/db-migration/SKILL.md`) for the full generate → review SQL → apply → verify
  workflow; it's user-invoked only (migrations have side effects on the local database).
- Editing a `.ts`/`.vue` file under a `packages/<pkg>/` triggers an automatic `PostToolUse`
  typecheck of that package (`.claude/settings.json`) — you don't need to run `pnpm typecheck`
  yourself after every small edit, just before calling non-trivial work done.

## Changelog

Add an entry to `CHANGELOG.md` under `## [Unreleased]` for any change that could plausibly
bother or interest a user — a new feature, a behavior change, a UI change, a fixed bug they could
have hit, a removed/renamed setting, anything touching data/migrations. Use the existing
`### Added` / `### Changed` / `### Fixed` / `### Removed` subheadings (see entries below
`[Unreleased]` for tone and format — short, user-facing, no internal jargon or file paths).

Skip it only for genuinely internal-only changes: refactors with no behavior change, variable/
function renames, test-only edits, comment/doc typo fixes, dependency bumps with no user-visible
effect, dev-tooling changes (`scripts/dev-up.mjs` etc.). When in doubt, add the entry — it's
cheap to write and easy to drop during release cleanup, but a missed one means a real change ships
undocumented.

## Client work

Liftr is used primarily on mobile; desktop is the adapted view, not the primary target. After any
change to `packages/client/src` (`.vue` files, styles, pages, components), use the
`mobile-viewport-check` skill (`.claude/skills/mobile-viewport-check/SKILL.md`) to verify the UI at
mobile viewport sizes before calling the work done.
