# Writing tests

All tests live under [`tests/`](../../tests), mirroring the `packages/<pkg>/src/...` layout —
nothing under `packages/*/src` should have a colocated `*.test.ts`/`*.spec.ts` file. A test for
`packages/server/src/services/foo.ts` goes in `tests/server/services/foo.test.ts`.

Run them from the repo root:

```bash
pnpm test              # vitest run, whole repo
pnpm test tests/ingest # just one directory, e.g. while adding an exercise
```

The one doc that explains the conventions — import aliases (`~server/*`, `~client/*`,
`~ingest/*`), the shared test helpers (`createTestDb`, `createTestApp`, `mountWithProviders`,
`withSetup`), the `vi.hoisted()` gotcha, jsdom vs. node environments, and general style — is
[`tests/README.md`](../../tests/README.md). Read that before writing your first test; it's kept
current as the suite's own source of truth, so this page won't duplicate it.

## Quick example

Adding a test for a new `packages/server/src/services/streakBonus.ts`:

```ts
// tests/server/services/streakBonus.test.ts
import { describe, expect, it } from "vitest";
import { computeStreakBonus } from "~server/services/streakBonus.js";

describe("computeStreakBonus", () => {
  it("awards no bonus below a 3-day streak", () => {
    expect(computeStreakBonus(2)).toBe(0);
  });
});
```

Same directory shape (`tests/<pkg>/<same path as src>/<file>.test.ts`), same `~<pkg>` alias into
that package's `src/`, real collaborators over mocks unless you're crossing a true external
boundary. See `tests/README.md` for everything else.
