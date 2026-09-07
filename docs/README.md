# Liftr docs

Start with the [root README](../README.md) for the pitch. This folder is for anyone building,
running, or extending Liftr.

## Orientation

- **[OVERVIEW.md](OVERVIEW.md)** — the project's vision and design principles.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the pieces fit together: packages, data flow,
  server/client/db shape.
- **[features.md](features.md)** — what's actually built, organized by area.
- **[ROADMAP.md](ROADMAP.md)** — what's planned next.

## Building on it

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev workflow, conventions, CI.
- **[SECURITY.md](SECURITY.md)** — auth model, CORS, upload handling, reporting an issue.
- **[concepts/](concepts/)** — foundational explainers for the non-obvious systems: the rank
  engine, XP/streaks, offline sync, the exercise catalog, and a glossary of the domain terms used
  throughout.
- **[reference/](reference/)** — lookup material: the HTTP API, environment variables, pnpm
  scripts.
- **[guides/](guides/)** — task-oriented walkthroughs: local dev setup, adding an exercise,
  writing tests, getting the app on a phone.
- **[operations/](operations/)** — running it for real: Android release signing, deployment,
  backups, troubleshooting.
- **[adr/](adr/)** — architecture decision records: short, dated write-ups of significant
  technical choices and why they were made.
- **[../tests/README.md](../tests/README.md)** — the test suite's own conventions (import
  aliases, shared helpers, environment rules). Lives next to the tests it documents, not under
  `docs/`, but linked from everywhere here that talks about testing.

## A note on staying accurate

These docs link to source files (`packages/shared/src/rank/tiers.ts`, `packages/server/src/env.ts`,
etc.) instead of restating exact values — thresholds, endpoint shapes, env var defaults — that
would silently drift out of sync with the code otherwise. When a doc and the code it links to
disagree, the code is right; treat that as a bug in the doc and fix the doc, not the other way
around.
