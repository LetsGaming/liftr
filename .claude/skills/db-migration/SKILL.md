---
name: db-migration
description: Generate and apply a Drizzle migration for @liftr/db after changing packages/db/src/schema.ts. User-invoked only — running migrations has side effects on the local SQLite database.
disable-model-invocation: true
---

# DB Migration (Drizzle / @liftr/db)

`@liftr/db` uses `drizzle-kit generate` to produce migrations from `packages/db/src/schema.ts`,
and a custom `migrate.ts` runner to apply them against the local SQLite (`better-sqlite3`) database.
Migration files are generated artifacts — never hand-edit them (see the `PreToolUse` guard in
`.claude/settings.json`, which blocks edits under `packages/db/src/**/*migrat*`).

## Steps

1. Confirm the schema change is complete and typechecks:
   ```
   pnpm --filter @liftr/db run typecheck
   ```
2. Generate the migration:
   ```
   pnpm db:generate
   ```
   (equivalent to `pnpm --filter @liftr/db generate`, i.e. `drizzle-kit generate`)
3. **Read the generated SQL** in the new migration file before applying it — check for:
   - Unexpected `DROP COLUMN` / `DROP TABLE` on tables that may hold real data
   - Column type changes that could truncate or reject existing rows
   - Missing default values on new `NOT NULL` columns (SQLite will fail the migration
     on existing rows without one)
4. Apply the migration:
   ```
   pnpm db:migrate
   ```
   (equivalent to `pnpm --filter @liftr/db migrate`, i.e. `tsx src/migrate.ts`)
5. Verify: run `pnpm --filter @liftr/server run typecheck` and the relevant tests, since
   `schema.ts` types flow into `server/src/repositories` and `db.ts` — a schema change
   that doesn't also update consuming code will surface as type errors there.

## Notes

- This is a single-user, self-hosted app — there is no migration-rollback tooling in
  the repo today. Treat schema changes as forward-only; if a mistake is generated,
  fix `schema.ts` and generate a corrective follow-up migration rather than editing
  or deleting the bad one once it has been applied to a real database.
- Never run this against a production/homelab database without a backup of the SQLite
  file first — ask the user to confirm the target database before applying if it's
  anything other than local dev data.
