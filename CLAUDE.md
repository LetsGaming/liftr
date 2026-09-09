# Agent instructions for this repo

Liftr is a self-hosted strength + running tracker: Vue 3 (Ionic/Capacitor PWA) client, Fastify
server, SQLite via Drizzle, TypeScript throughout in a pnpm monorepo (`packages/{client,server,
shared,db,ingest}`). Single bearer token auth (`LIFTR_TOKEN`), no accounts yet — see
`docs/adr/0002-single-bearer-token-auth.md` and `docs/adr/0006-multi-user-hardening.md`. The app's
UI strings are German; keep any copy you touch consistent with that.

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
`rank-decay-bug`, `routine-wizard-copy`). This starts an isolated backend + dashboard pair with
auth open (no `LIFTR_TOKEN` set, so there's no login screen), each on its own automatically-picked
free port, backed by its own disposable SQLite database. It then ingests the exercise catalog and
the running-standards table into that database and seeds it with realistic mock data so the
dashboard shows real content instead of empty states: an onboarded profile, owned equipment +
gym/plate setup, a bodyweight trend, a custom exercise, three routines (Push/Pull/Bein Tag, one
with a mesocycle) and ~4 weeks of finished workouts across 8 exercises — seeded through the real
sync pipeline, not hand-faked, so ranks, PRs, streaks, and XP all come out correctly derived. The
mock history is deliberately varied: most exercises get a locked-in (corroborated) peak rank, one
is left intentionally uncorroborated, and one (chin-up) is trained early and then abandoned so
current-vs-peak rank decay has something real to show too. Plus a short GPS-tracked run history —
three 5k-category runs at varied paces on different days (corroborating a 5k rank) and one 8 km run
that's off any category's exact distance, exercising the Riegel-adjustment path onto the 10k
category, each run through the same plausibility-gate/rank-recompute pipeline a real GPX import
uses — and one manually logged run (no route/HR/elevation, matching the real manual-entry contract,
XP-only with no rank chip since it has no GPS points to rank-eligibility-check against). Plus two
planned routes (Tempelhof-Runde with full ORS-style geometry, a second left as an unresolved
straight-line fallback), with the manual run linked back to the first. It prints the dashboard URL,
backend URL, and log paths to use.

Exercise catalog *images* are the one thing **not** scoped to your session — they're static,
network-fetched, and identical across every session, so they live in the ordinary shared
`data/images/` dir and are only ever fetched once per machine, not once per session.

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

## Client work

Liftr is used primarily on mobile; desktop is the adapted view, not the primary target. After any
change to `packages/client/src` (`.vue` files, styles, pages, components), use the
`mobile-viewport-check` skill (`.claude/skills/mobile-viewport-check/SKILL.md`) to verify the UI at
mobile viewport sizes before calling the work done.
