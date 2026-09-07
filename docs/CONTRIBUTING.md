# Contributing

Liftr is a self-hosted, single-maintainer project, but the workflow below is what's actually
enforced by tooling — useful whether you're the maintainer coming back to this after a break or
someone sending a PR.

## Repo layout

A pnpm workspace (`pnpm-workspace.yaml`) with five packages under `packages/`:

| Package | What it is |
|---|---|
| `packages/client` | Vue 3 + Ionic/Capacitor PWA — the app itself. |
| `packages/server` | Fastify API — routes, services, repositories, the SQLite/Drizzle wiring. |
| `packages/db` | Drizzle schema, migrations, and the DB client shared by `server` and `ingest`. |
| `packages/ingest` | Builds the exercise catalog (images, i18n, `standards` seed data) from `tools/catalog/curated.yaml`. |
| `packages/shared` | Pure, environment-agnostic logic used by both client and server — the rank engine, XP math, catalog types — so client-side optimistic recompute and server-side authoritative recompute can never drift. |

`@liftr/shared` and `@liftr/db` are real workspace packages with a public `exports` map (see
`tsconfig.base.json`'s `paths` for the `@liftr/shared`/`@liftr/db` aliases); `client`, `server`,
and `ingest` are consumed only within their own package, not imported by name from elsewhere.

## Getting set up

See [`docs/guides/local-development.md`](guides/local-development.md) for environment setup,
running the dev servers, and the database/ingest bootstrap steps — that's the authoritative,
step-by-step guide; this document doesn't duplicate it.

## Coding conventions

These are the conventions actually enforced by `pnpm lint` / `pnpm typecheck`, not aspirational
style guidance:

- **TypeScript strictness** (`tsconfig.base.json`, inherited by every package): `strict: true`
  plus `noUncheckedIndexedAccess` — array/object index access is typed as possibly-`undefined`,
  so code has to prove or check before using an indexed value. `exactOptionalPropertyTypes` is
  explicitly `false` — an optional field being `undefined` and being omitted are treated the same.
- **ESLint** (`eslint.config.js`), a single flat config for the whole workspace:
  - `@typescript-eslint/recommended`, with `no-unused-vars` narrowed to warn on args (except a
    leading `_`) and to ignore rest-siblings (`const { omit, ...rest } = obj` is the standard way
    to drop a field, and the omitted binding is intentionally unused).
  - Core `no-undef` is off for TS/Vue files — it isn't type-aware and false-positives on ambient
    lib types. `pnpm typecheck` (tsc/vue-tsc) is the real check for undefined identifiers.
  - Node globals for `packages/{server,db,ingest}`, browser globals for `packages/client` — this
    matters because `crypto`/`Buffer` mean different things in each environment.
  - `eslint-plugin-vue`'s `flat/recommended` for `.vue` files, with three rules deliberately
    disabled for this codebase: `vue/html-self-closing` (hand-authored SVG icon maps rendered via
    `v-html`), `vue/no-deprecated-slot-attribute` (Ionic's native `slot="start"` etc., not Vue 2's
    slot API), and `vue/require-default-prop` (this codebase's convention is an explicit
    `!= null`/`??` check at the read site rather than a `withDefaults` entry for every optional
    prop).
  - Formatting defers to Prettier (`eslint-config-prettier` turns off ESLint's own stylistic
    rules) — there's no separate Prettier config check wired into CI beyond what ESLint enforces.

There's no separate style guide beyond what these tools check — if lint and typecheck pass,
you're following the conventions.

## Tests

All tests live under `tests/`, mirroring `packages/<pkg>/src/...` — nothing under `packages/*/src`
should have a colocated `*.test.ts`. See [`tests/README.md`](../tests/README.md) for the full
conventions (import aliases, `vi.mock`/`vi.hoisted` patterns, per-package quirks); that document is
authoritative and actively maintained, so this file just points at it rather than repeating it.

Run tests from the repo root:

```bash
pnpm test              # vitest run, all packages
pnpm typecheck          # each package's own typecheck + tests/ typecheck
```

## Commit / PR expectations

There's no `CONTRIBUTING`-adjacent template in `.github/` — no PR template, no issue template, no
`CODEOWNERS`. In practice: keep commits scoped and describe *why* a change was made, not just
what changed (see `git log` for the existing style). There's no other process to follow beyond
that and the CI gate below.

## CI gate

Every push and pull request runs `.github/workflows/ci.yml`, which does, in order:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`

All three checks (typecheck, lint, test) must pass — there's no partial/optional check. The same
workflow is reused as the test gate for `release.yml` (tag-triggered Android APK builds) via
`workflow_call`, so a red CI run also blocks releases, not just PRs.
