# Tests

All tests live here, mirroring `packages/<pkg>/src/...` under `tests/<pkg>/...`. Nothing under
`packages/*/src` should have a colocated `*.test.ts`/`*.spec.ts` file — if you're adding a test
for `packages/server/src/services/foo.ts`, it goes in `tests/server/services/foo.test.ts`.

Run everything from the repo root:

```
pnpm test                # vitest run, all packages
pnpm typecheck            # packages' own typecheck + typecheck:tests below
pnpm typecheck:tests      # tsc/vue-tsc over tests/, one pass per package
```

## Importing the code under test

- **`@liftr/shared`, `@liftr/db`** — real workspace packages with a public `exports` map. Import
  them by package name, same as production code does:
  `import { computeLevel } from "@liftr/shared"`. Everything shared's tests need is re-exported
  from `packages/shared/src/index.ts`; if something isn't, export it there first rather than
  reaching for a relative path.
- **`~server/*`, `~client/*`, `~ingest/*`** — path aliases (defined in `vitest.config.ts` and each
  package's `tsconfig.test.json`) that map straight to that package's `src/`, e.g.
  `import { getXpSummary } from "~server/services/xpService.js"` or
  `import Foo from "~client/components/exercise/Foo.vue"`. server/ingest use `moduleResolution:
  NodeNext`, so keep the `.js` extension on these specifiers even though the real file is `.ts`.
  `db` and `shared` don't have this alias — they're always imported by package name (above).
- Never use relative imports (`./`, `../`) to reach back into `packages/*/src` from a test file —
  the depth varies per file and is easy to get wrong. Relative imports are fine only for reaching
  *other test files/helpers*, e.g. `tests/server/repositories/foo.test.ts` importing
  `../helpers/testDb.js`.
- `vi.mock(...)` specifiers must match whatever specifier the *source under test* would resolve to
  the same absolute file — use the `~server`/`~client`/`~ingest` alias there too (e.g.
  `vi.mock("~client/lib/idb", ...)`), not a relative path computed from the test file's own
  location.
- Third-party packages that only `packages/client` (not this root `package.json`) depends on —
  `idb`, `@capacitor/*` — need a `resolve.alias` entry in `vitest.config.ts` pointing straight at
  `packages/client/node_modules/<pkg>` before `vi.mock("idb", ...)`-style mocking of them will
  actually take effect. Without it, a bare `import "idb"` from a test file (outside any package)
  and from `packages/client/src/lib/idb.ts` resolve to two *different* module ids, so the test's
  mock registration silently never matches what the source under test really imported. If you hit
  a mock that "doesn't apply" for a package client-only depends on, add it there (see the existing
  `idb`/`@capacitor/core`/`@capacitor/haptics`/`@capacitor/app`/`@capacitor/network` entries for
  the pattern) rather than debugging the mock itself.

### `vi.mock()` + a same-file `const` mock: use `vi.hoisted()`

`vi.mock()` calls are hoisted above all imports *and* above top-of-file `const`s — but a `const
fooMock = vi.fn()` sitting next to it is **not** hoisted along with it. If the mock factory reads
that `const` directly (`vi.mock("~client/services/fooService", () => ({ getFoo: fooMock })))`),
you get `ReferenceError: Cannot access 'fooMock' before initialization` at runtime, because the
hoisted `vi.mock` call now runs before the `const` line does. Wrap it in `vi.hoisted()` instead,
which hoists the declaration together with the registration:

```ts
const { fooMock } = vi.hoisted(() => ({ fooMock: vi.fn() }));
vi.mock("~client/services/fooService", () => ({ getFoo: fooMock }));
```

(Nesting the reference inside an uninvoked inner function, or reading it via `vi.mocked(importedFn)`
*after* importing the now-mocked module, both dodge the same TDZ hazard too — `vi.hoisted()` is
just the most direct fix.)

## Shared test helpers

- `tests/server/helpers/testDb.ts` — `createTestDb()` returns a fresh, fully-migrated in-memory
  SQLite `LiftrDb` (real constraints/cascades, no disk I/O). `insertTestExercise(db, overrides?)`
  seeds a minimal exercise row. Use in a `beforeEach` for one fresh db per test.
- `tests/server/helpers/testApp.ts` — `createTestApp()` returns `{ app, db }`: a bare Fastify
  instance with the production `configureApp()` wiring (real Zod validation + the real error
  handler) but no db/CORS/static/auth setup. Register only the route(s) under test on it:
  ```ts
  const { app, db } = createTestApp();
  registerXpRoutes(app, db);
  const res = await app.inject({ method: "GET", url: "/api/xp" });
  ```
  `LIFTR_TOKEN` is unset in tests, so `requireAuth` (only wired up in the real `buildApp()`, not
  here) is moot either way — route tests don't need an Authorization header.
- `tests/client/helpers/mountWithProviders.ts` — `mountWithProviders(Component, options?)` wraps
  `@vue/test-utils`'s `mount()` with a fresh Pinia, the real `i18n` instance (actual `de` copy, so
  text assertions match production strings), and a stub router (`createTestRouter()`, no real
  routes — good enough for components that just call `useRouter()`/render `<router-link>`). Pass
  `options.global` to add more; it's merged in, not replaced. Ionic's `ion-*` tags need no special
  handling — Vue's compiler already renders unresolved hyphenated tags as plain custom elements
  (no warning), so they render in jsdom without the real Stencil/web-components runtime. If a
  component reads a property/method Ionic itself would set on one, stub that specific element via
  `global.stubs` instead of trying to load real `@ionic/vue`.
- `tests/client/helpers/withSetup.ts` — `withSetup(() => useMyComposable(...))` returns
  `{ result, unmount }`. Needed for any composable using lifecycle hooks or injection
  (`onMounted`/`onUnmounted`/`watch`/`useI18n`/`inject`) — calling those bare outside a component's
  `setup()` throws. It mounts a throwaway host component and runs the composable inside its real
  `setup()`, so lifecycle behavior (including cleanup on `unmount()`) works exactly as in
  production. Needs a real DOM, so add `// @vitest-environment jsdom` to any test file that uses
  it (composables/ isn't covered by the `environmentMatchGlobs` jsdom glob — only
  components/pages are). Composables with no lifecycle hooks don't need this; call them directly.

## Environment

Everything runs under vitest's `node` environment by default. `tests/client/components/**` and
`tests/client/pages/**` run under `jsdom` (`environmentMatchGlobs` in `vitest.config.ts`) — that's
the only place DOM globals exist. A composable/store/service test that needs `document`/`window`
needs to move under one of those two globs, or add its own
`// @vitest-environment jsdom` docblock at the top of the file.

## Style

Match the existing tests: `describe`/`it` from `vitest`, no test framework abstractions beyond
that. Test names read as full sentences describing the behavior (`"does not regress on a lower LP
within the same tier/division"`, not `"test 3"`). Prefer exercising real collaborators (the real
in-memory db, the real error handler, the real i18n strings) over mocking — mock only true
external boundaries (network, IndexedDB, Capacitor native plugins, `Date.now()`/timers where a
test needs to control time).
