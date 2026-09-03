# Nebula & Workplan Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every currently-open item from `audit/workplan-v1.md`'s 2026-09-03 status sweep — the
Personal Records ledger, the Nebula visual-identity layer (tokens, light mode, chrome, rank-medallion
ring), and the `engagement-audit-v5.md` carry-forward (duplication cut, Profile grouping, Overview
priority) — as one ordered sequence of independently shippable phases.

**Architecture:** No new subsystems. Every phase is additive to Liftr's existing thin-route/service/
repository server pattern (see `overallRank.ts`/`overallRankService.ts`) and existing Pinia-store/
`api.ts`-service client pattern (see `streakStore.ts`/`xpStore.ts`), and every CSS change is additive
to `packages/client/src/styles/tokens.css`/`motion.css` in place — nothing here restructures those
files, it extends them exactly the way their own internal comments already describe extension working.

**Tech Stack:** TypeScript, Fastify + Zod (server), Drizzle (`@liftr/db`), Vue 3 + Ionic + Pinia
(client), Vitest (server/shared unit tests — the client package has none today; client tasks below
are verified by `pnpm typecheck` + manual browser check, matching this codebase's existing
convention, not a gap introduced by this plan).

**Spec:**
- `audit/workplan-v1.md` (source of truth for what's open vs. done, updated 2026-09-03)
- `audit/nebula-design-philosophy.md`, `-framework.md`, `-patterns.md`, `-layout.md`, `-plan.md`
  (the Nebula visual system this plan's Phases 3–5 implement)
- `audit/engagement-audit-v5.md` (source of Phases 6–8's scope)

## Global Constraints

- No new bottom-tab / top-level nav surface, anywhere (`engagement-audit-v5.md` §1.3, hard boundary
  carried from `engagement-audit-v4.md` — still binding). The Personal Records screen (Phase 1) is a
  linked-to route (`/records`), not a nav tab — same pattern as the existing `/attributions` route.
- No masked/near-miss reward targets, no currency, no gating, no subscription/premium framing, no
  urgency/scarcity copy (`engagement-audit-v5.md` §1.1–§1.2, `lens-1` comparison table — still binding
  everywhere in this plan, including the new PR screen and every Nebula-touched surface).
- Nebula's gradient (`--nebula-1/-m/-2`) is chrome/CTA/streak/focus **only** — never applied to the
  existing 9-tier `.badge`/`.t-<tier>` metal-gradient system itself (`nebula-design-philosophy.md`
  §2). Every Nebula CSS task below respects this; if a task's diff would touch a `.t-<tier>` rule,
  that's a bug in the task, not a valid implementation choice.
- Nebula glow (`--nebula-glow`/`--nebula-glow-strong`) fires only during an existing `success`-tier
  motion event (`.streak-pulse`, `useCelebrate`'s rank-up beat) and never as a resting/ambient state
  (`nebula-design-framework.md` §5). A plausibility-discounted session must never reach glow/ring code
  — this is structural (the ring only mounts inside the rank-up beat's own branch), not a runtime flag.
- Every text/surface color addition (Phase 3's `:root[data-theme="light"]` block especially) must be
  checked for ≥4.5:1 contrast (body text) / ≥3:1 (large text, UI components) against the surface it
  sits on in **both** themes before a task is marked done — this repo's `tokens.css` already records
  measured ratios in comments next to its own color tokens; new tokens follow that same convention.
- Follow this repo's existing "one canonical rule, no per-component redeclaration" convention
  (`tokens.css`'s own stated practice) — every shared-class CSS change in this plan touches exactly
  one rule and lets it cascade, never adds a scoped per-component override of the same property.

---

## Phase 1 — Personal Records ledger

**Why first:** confirmed in `audit/workplan-v1.md` §2 as not started and now the single highest-
leverage open item — no schema change needed (the `prs` table is already fully populated on every
workout finish), fully independent of every other phase, and its own future Nebula paint (Phase 5)
needs this phase's screen to exist first.

### Task 1: Server — `GET /api/prs` route + service

**Files:**
- Create: `packages/server/src/services/prService.ts`
- Create: `packages/server/src/services/prService.test.ts`
- Create: `packages/server/src/routes/prs.ts`
- Modify: `packages/server/src/app.ts` (register the new route, following the existing
  `registerOverallRankRoutes`/`registerRankEventsRoutes` pattern at lines 18–19 and 95–96)

**Interfaces:**
- Produces: `getPrs(db: LiftrDb): Promise<PrListItem[]>` from `prService.ts`, where
  ```ts
  export interface PrListItem {
    id: string;
    exerciseId: string;
    exerciseSlug: string;
    kind: "e1rm" | "weight" | "reps" | "volume";
    value: number;
    achievedAt: string; // ISO
    workoutId: string | null; // null if the originating set was deleted (setId -> null cascade)
  }
  ```
- Route: `GET /api/prs` returns `PrListItem[]`, newest-first.

- [ ] **Step 1: Write the failing service test**

```ts
// packages/server/src/services/prService.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { exercises, prs, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { getPrs } from "./prService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("getPrs", () => {
  it("returns an empty list when no PRs exist yet", async () => {
    const result = await getPrs(db);
    expect(result).toEqual([]);
  });

  it("returns a PR joined to its exercise slug and originating workout", async () => {
    const exercise = await insertTestExercise(db, { slug: "bench-press" });
    const [workout] = await db
      .insert(workouts)
      .values({ clientId: "w-1", startedAt: new Date(), pausedSeconds: 0 })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise.id, orderIndex: 0 })
      .returning();
    const [set] = await db
      .insert(sets)
      .values({
        workoutExerciseId: we!.id,
        setIndex: 0,
        weightKg: 100,
        reps: 5,
        kind: "normal",
        isWarmup: false,
        loggedAt: new Date(),
        clientId: "s-1",
      })
      .returning();
    await db.insert(prs).values({
      exerciseId: exercise.id,
      kind: "weight",
      value: 100,
      setId: set!.id,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const result = await getPrs(db);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      exerciseSlug: "bench-press",
      kind: "weight",
      value: 100,
      workoutId: workout!.id,
    });
  });

  it("returns workoutId null when the originating set was deleted", async () => {
    const exercise = await insertTestExercise(db);
    await db.insert(prs).values({
      exerciseId: exercise.id,
      kind: "e1rm",
      value: 120,
      setId: null,
      achievedAt: new Date("2026-09-01T10:00:00Z"),
    });

    const result = await getPrs(db);
    expect(result[0]!.workoutId).toBeNull();
  });

  it("sorts newest-first", async () => {
    const exercise = await insertTestExercise(db);
    await db.insert(prs).values([
      { exerciseId: exercise.id, kind: "weight", value: 80, setId: null, achievedAt: new Date("2026-08-01T00:00:00Z") },
      { exerciseId: exercise.id, kind: "weight", value: 90, setId: null, achievedAt: new Date("2026-09-01T00:00:00Z") },
    ]);

    const result = await getPrs(db);
    expect(result.map((r) => r.value)).toEqual([90, 80]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @liftr/server test prService`
Expected: FAIL — `Cannot find module './prService.js'`

- [ ] **Step 3: Write the service**

```ts
// packages/server/src/services/prService.ts
/**
 * Personal Records ledger (workplan-v1 §2). Reads the `prs` table — already fully populated on
 * every workout finish per the rank-recompute pipeline — joined to the exercise's slug (for
 * display via the client's useExerciseName composable) and, where the originating set still
 * exists, the workout it belongs to (for a "jump to this workout" link). Purely additive read
 * access; no new computation, no schema change.
 */
import { desc, eq } from "drizzle-orm";
import { exercises, prs, sets, workoutExercises, type LiftrDb } from "@liftr/db";

export interface PrListItem {
  id: string;
  exerciseId: string;
  exerciseSlug: string;
  kind: "e1rm" | "weight" | "reps" | "volume";
  value: number;
  achievedAt: string;
  workoutId: string | null;
}

export async function getPrs(db: LiftrDb): Promise<PrListItem[]> {
  const rows = await db
    .select({
      id: prs.id,
      exerciseId: prs.exerciseId,
      exerciseSlug: exercises.slug,
      kind: prs.kind,
      value: prs.value,
      achievedAt: prs.achievedAt,
      workoutId: workoutExercises.workoutId,
    })
    .from(prs)
    .innerJoin(exercises, eq(prs.exerciseId, exercises.id))
    .leftJoin(sets, eq(prs.setId, sets.id))
    .leftJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .orderBy(desc(prs.achievedAt));

  return rows.map((r) => ({
    ...r,
    achievedAt: r.achievedAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @liftr/server test prService`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the route**

```ts
// packages/server/src/routes/prs.ts
/**
 * GET /api/prs — Personal Records ledger (workplan-v1 §2). Same shape as `overallRank.ts`: the
 * route is a thin schema wrapper, the actual query lives in `prService.ts`.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { getPrs } from "../services/prService.js";
import type { ZodFastifyInstance } from "../types.js";

const prListResponse = z.array(
  z.object({
    id: z.string(),
    exerciseId: z.string(),
    exerciseSlug: z.string(),
    kind: z.enum(["e1rm", "weight", "reps", "volume"]),
    value: z.number(),
    achievedAt: z.string(),
    workoutId: z.string().nullable(),
  }),
);

export function registerPrRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/prs", { schema: { response: { 200: prListResponse } } }, async () => {
    return getPrs(db);
  });
}
```

- [ ] **Step 6: Register the route in `app.ts`**

Add alongside the existing imports and registrations (match the exact pattern at lines 18–19/95–96):

```ts
// near the other route imports
import { registerPrRoutes } from "./routes/prs.js";
// near registerOverallRankRoutes(app, db);
registerPrRoutes(app, db);
```

- [ ] **Step 7: Run the full server test suite and typecheck**

Run: `pnpm --filter @liftr/server test && pnpm --filter @liftr/server typecheck`
Expected: PASS, no new failures

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/services/prService.ts packages/server/src/services/prService.test.ts packages/server/src/routes/prs.ts packages/server/src/app.ts
git commit -m "feat(server): add GET /api/prs Personal Records ledger route"
```

---

### Task 2: Client — PR service, store, page, route

**Files:**
- Create: `packages/client/src/services/prService.ts`
- Create: `packages/client/src/stores/prStore.ts`
- Create: `packages/client/src/pages/RecordsPage.vue`
- Modify: `packages/client/src/router.ts`
- Modify: `packages/client/src/pages/RanksPage.vue` (entry point link, per the "no new nav surface"
  constraint — this is a `router-link` from an existing screen, not a new tab)

**Interfaces:**
- Consumes: Task 1's `GET /api/prs` response shape (`PrListItem[]`, field names as above).
- Consumes: `useExerciseName()` from `packages/client/src/composables/useExerciseName.ts` —
  `exerciseName(slug: string): string`.
- Produces: `usePrStore()` with `{ prs: PrListItem[], loaded: boolean, error: boolean, load(): Promise<void> }`,
  reused by Phase 5's Nebula paint task.

- [ ] **Step 1: Client service**

```ts
// packages/client/src/services/prService.ts
import { api } from "../lib/api";

export interface PrListItem {
  id: string;
  exerciseId: string;
  exerciseSlug: string;
  kind: "e1rm" | "weight" | "reps" | "volume";
  value: number;
  achievedAt: string;
  workoutId: string | null;
}

export function getPrs(): Promise<PrListItem[]> {
  return api.get<PrListItem[]>("/api/prs");
}
```

- [ ] **Step 2: Pinia store**

```ts
// packages/client/src/stores/prStore.ts
/** Personal Records ledger (workplan-v1 §2), backed by /api/prs. */
import { defineStore } from "pinia";
import { getPrs, type PrListItem } from "../services/prService";

export const usePrStore = defineStore("prs", {
  state: () => ({
    prs: [] as PrListItem[],
    loaded: false,
    error: false,
  }),
  actions: {
    async load() {
      try {
        this.prs = await getPrs();
        this.loaded = true;
        this.error = false;
      } catch {
        this.error = true;
      }
    },
  },
});
```

- [ ] **Step 3: Page component**

```vue
<!-- packages/client/src/pages/RecordsPage.vue -->
<script setup lang="ts">
// Personal Records ledger (workplan-v1 §2 / nebula-design-layout.md §3). Reads `prs`, a table the
// server already fully populates on every workout finish and, until this page, never displayed.
// Honest empty state, no locked/teaser treatment (engagement-audit-v5.md §1.2's boundary).
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted } from "vue";
import { useExerciseName } from "../composables/useExerciseName";
import { usePrStore } from "../stores/prStore";

const prStore = usePrStore();
const { exerciseName } = useExerciseName();
onMounted(() => void prStore.load());

const KIND_LABEL: Record<string, string> = {
  e1rm: "e1RM",
  weight: "Gewicht",
  reps: "Wiederholungen",
  volume: "Volumen",
};

const sorted = computed(() => prStore.prs.slice().sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)));

function formatValue(kind: string, value: number): string {
  if (kind === "reps") return `${Math.round(value)} Wdh.`;
  if (kind === "volume") return `${Math.round(value).toLocaleString("de-DE")} kg`;
  return `${value} kg`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Rekorde</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p style="color: var(--dim)">Deine besten Sätze pro Übung — automatisch erfasst, nie verpasst.</p>

      <template v-if="!prStore.loaded && !prStore.error">
        <div v-for="i in 4" :key="i" class="shimmer pr-skel-row" aria-hidden="true" />
      </template>

      <p v-else-if="prStore.error" class="page-note load-error" style="margin-top: var(--sp4)">
        Rekorde konnten nicht geladen werden.
        <button type="button" class="btn-secondary" @click="prStore.load()">Erneut versuchen</button>
      </p>

      <p v-else-if="sorted.length === 0" class="page-note" style="margin-top: var(--sp4)">
        Noch keine Rekorde — dein erster harter Satz auf einer beliebigen Übung startet einen.
      </p>

      <ul v-else class="pr-list">
        <li v-for="pr in sorted" :key="pr.id" class="panel pr-row">
          <div class="pr-row-main">
            <b>{{ exerciseName(pr.exerciseSlug) }}</b>
            <span class="pr-kind">{{ KIND_LABEL[pr.kind] }}</span>
          </div>
          <div class="pr-row-meta">
            <span class="tnum pr-value">{{ formatValue(pr.kind, pr.value) }}</span>
            <span class="pr-date">{{ formatDate(pr.achievedAt) }}</span>
          </div>
        </li>
      </ul>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.pr-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  margin-top: var(--sp4);
}
.pr-row {
  padding: var(--sp4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
}
.pr-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pr-kind {
  font-size: 12px;
  color: var(--dim);
}
.pr-row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: none;
}
.pr-value {
  font-weight: 800;
}
.pr-date {
  font-size: 12px;
  color: var(--faint);
}
.pr-skel-row {
  height: 56px;
  border-radius: var(--r-lg);
  margin-top: var(--sp3);
}
</style>
```

- [ ] **Step 4: Register the route**

```ts
// packages/client/src/router.ts — add alongside the existing routes, same pattern as /attributions
{ path: "/records", name: "records", component: () => import("./pages/RecordsPage.vue") },
```

- [ ] **Step 5: Add the entry point on RanksPage.vue**

Add a `router-link` near the top of `RanksPage.vue`'s template (immediately after the `TierLadder`,
before the `InfoToggle` block at line 69), so it's reachable without a new nav item:

```vue
<router-link to="/records" class="btn-secondary" style="display: inline-flex; margin-top: var(--sp3)">
  🏆 Rekorde ansehen
</router-link>
```

- [ ] **Step 6: Typecheck and manual verification**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS

Manual (per this repo's mobile-viewport-check convention): start the dev server
(`pnpm --filter @liftr/client dev`), navigate to `/ranks`, click "🏆 Rekorde ansehen", confirm the
list renders (or the empty state, on a fresh DB) at 390px and 1024px+ widths, in a real browser.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/services/prService.ts packages/client/src/stores/prStore.ts packages/client/src/pages/RecordsPage.vue packages/client/src/router.ts packages/client/src/pages/RanksPage.vue
git commit -m "feat(client): add Personal Records ledger screen at /records"
```

---

## Phase 2 — Nebula tokens & light-mode foundation (N0)

**Why second:** every later Nebula phase (3–5) consumes these tokens; nothing about Phase 1 depends
on this, so it's safe to run in parallel with Phase 1 by a second subagent.

### Task 3: `tokens.css` — Nebula color tokens + light-mode `:root[data-theme="light"]` block

**Files:**
- Modify: `packages/client/src/styles/tokens.css`

**Interfaces:**
- Produces: `--nebula-1`, `--nebula-m`, `--nebula-2`, `--nebula-grad`, `--nebula-grad-cta`,
  `--nebula-ink`, `--nebula-ink-on-fill`, `--nebula-glow`, `--nebula-glow-strong` (consumed by
  Phase 3/4/5's CSS tasks) and the full `:root[data-theme="light"]` palette (consumed by Phase 4's
  theme store, which sets the `data-theme` attribute this selector matches on).

- [ ] **Step 1: Add the Nebula token block**

Add immediately after the existing `--pl-red`/`--pl-blue`/`--pl-yellow`/`--pl-green` block (before
the `--r-sm` spacing tokens begin), inside the existing `:root { ... }`:

```css
  /* Nebula — the app's brand-identity gradient (nebula-design-framework.md §1). Chrome, CTAs,
     streak/level accents, focus states ONLY — never the 9-tier .badge/.t-<tier> system above,
     which answers a different question (which of 9 tiers) than Nebula does (is this interactive
     or just-earned). See audit/nebula-design-philosophy.md §2 for the full reasoning. */
  --nebula-1: #2f9fe0;
  --nebula-m: #7c5cff;
  --nebula-2: #d63aff;
  --nebula-grad: linear-gradient(120deg, var(--nebula-1), var(--nebula-m), var(--nebula-2));
  --nebula-grad-cta: linear-gradient(135deg, var(--nebula-1), var(--nebula-m), var(--nebula-2));
  --nebula-ink: #6b3fd6;
  --nebula-ink-on-fill: #1a0f2e;
  --nebula-glow: rgba(124, 92, 255, 0.4);
  --nebula-glow-strong: rgba(214, 58, 255, 0.55);
```

- [ ] **Step 2: Add the light-mode block**

Add immediately after the closing `}` of the dark `:root { ... }` block:

```css
/* Light theme (nebula-design-framework.md §2). Applied by themeStore setting
   document.documentElement.dataset.theme = "light" before first paint. Liftr ships dark-first —
   this is a user setting (Profile), not inferred from OS preference; see the framework doc §2.1
   for why. Every existing color-bearing token is re-specified here, not just the new ones, so
   nothing silently falls through to a dark value on a light ground. */
:root[data-theme="light"] {
  --bg: #f6f4fb;
  --surface: #ffffff;
  --surface-2: #f4f2f9;
  --surface-3: #ece7f7;
  --line: rgba(20, 16, 32, 0.1);
  --line-2: rgba(20, 16, 32, 0.16);
  --text: #14121c;
  /* 6.1:1 on --surface-2 (#f4f2f9) */
  --dim: #635f78;
  /* 5.4:1 on --surface-2 */
  --faint: #6c6178;
  --shadow: 0 8px 20px -14px rgba(15, 15, 25, 0.18);
  --nebula-ink: #6b3fd6;
}
```

- [ ] **Step 3: Verify no other rule in the file references a color token only inside a
  media/attribute block**

Run: `grep -n "prefers-color-scheme" packages/client/src/styles/*.css`
Expected: no matches (confirms this plan deliberately doesn't add an OS-preference media query, per
`nebula-design-framework.md` §2.1's reasoning — theme is a user setting, applied via `data-theme`).

- [ ] **Step 4: Typecheck (CSS has no typecheck, but confirm the client build still compiles)**

Run: `pnpm --filter @liftr/client build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/styles/tokens.css
git commit -m "feat(client): add Nebula gradient tokens and light-mode palette"
```

---

### Task 4: Theme store + boot-time application + Profile toggle

**Files:**
- Create: `packages/client/src/stores/themeStore.ts`
- Modify: `packages/client/src/main.ts`
- Modify: `packages/client/src/pages/ProfilePage.vue` (add the toggle to the existing "Daten &
  Server"-bound area — Phase 7 later gives this a real group header; this task just adds the control)

**Interfaces:**
- Produces: `useThemeStore()` with `{ theme: "dark" | "light", toggle(): void }`.
- Consumes: nothing new — this is the first consumer of Task 3's `[data-theme="light"]` selector.

- [ ] **Step 1: Write the theme store, following `xpStore.ts`'s exact
  localStorage-boolean-with-module-level-getter/setter pattern**

```ts
// packages/client/src/stores/themeStore.ts
/** Theme preference (nebula-design-framework.md §2.2), applied via <html data-theme="...">.
 *  Purely a client-side rendering preference — not synced to the server, same reasoning as
 *  xpStore.ts's showXp flag: this needs to be readable before the app has even authenticated. */
import { defineStore } from "pinia";

export type Theme = "dark" | "light";
const THEME_KEY = "liftr.theme";

export function getStoredTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export const useThemeStore = defineStore("theme", {
  state: () => ({
    theme: getStoredTheme(),
  }),
  actions: {
    toggle() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      setStoredTheme(this.theme);
    },
  },
});
```

- [ ] **Step 2: Apply the theme before first paint in `main.ts`**

Add at the very top of `main.ts`, before the `createApp(App)` line, so there's no flash of the wrong
theme:

```ts
import { getStoredTheme } from "./stores/themeStore";
document.documentElement.dataset.theme = getStoredTheme();
```

- [ ] **Step 3: Add the toggle to `ProfilePage.vue`**

Add a new `<script setup>` import and a new `<section class="card">` immediately before the existing
`<section class="card">` for "API-Token" (line 373), so it sits with the app's other low-frequency
settings:

```ts
// ProfilePage.vue <script setup> additions
import { useThemeStore } from "../stores/themeStore";
const theme = useThemeStore();
```

```vue
<section class="card">
  <h2 class="eyebrow">Darstellung</h2>
  <div class="chip-row">
    <button class="chip" :class="{ active: theme.theme === 'dark' }" @click="theme.theme === 'light' && theme.toggle()">Dunkel</button>
    <button class="chip" :class="{ active: theme.theme === 'light' }" @click="theme.theme === 'dark' && theme.toggle()">Hell</button>
  </div>
</section>
```

This reuses the existing `.chip`/`.chip-row` classes already defined in this file for the
sex/experience-level selectors above (line ~266) — no new CSS needed.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS

- [ ] **Step 5: Manual verification**

Start the dev server, open Profile, toggle Hell/Dunkel, confirm every visible surface re-themes with
no unstyled flash and no illegible text (spot-check Overview, Ranks, Profile, and the new `/records`
page from Phase 1 in both themes).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/stores/themeStore.ts packages/client/src/main.ts packages/client/src/pages/ProfilePage.vue
git commit -m "feat(client): add theme store and light/dark toggle"
```

---

## Phase 3 — Nebula chrome & CTA migration (N1)

**Why third:** depends on Phase 2's tokens; independent of Phase 1. Highest-leverage, lowest-risk
Nebula phase — every target is a single already-centralized class (`nebula-design-plan.md`'s own
framing).

### Task 5: `.btn-primary` gradient migration

**Files:**
- Modify: `packages/client/src/styles/tokens.css`

- [ ] **Step 1: Replace the fill and ink**

In the existing `.btn-primary` rule (around line 286), change:

```css
  background: linear-gradient(160deg, var(--blue-hi), var(--blue));
  color: var(--blue-ink);
```

to:

```css
  background: var(--nebula-grad-cta);
  color: var(--nebula-ink-on-fill);
```

Leave every other property in the rule (`border-radius`, `min-height`, `transition`, the
`:active`/`:disabled`/`:hover` blocks below it) untouched — this is a fill/ink swap only, per
`nebula-design-patterns.md` §3.

- [ ] **Step 2: Contrast-check the new ink against the gradient's darkest stop**

`--nebula-ink-on-fill: #1a0f2e` against `--nebula-1: #2f9fe0` (the gradient's lightest, lowest-
contrast-risk stop is actually the endpoints, not the middle) — verify with a contrast calculator
(e.g. WebAIM) that `#1a0f2e` on `#2f9fe0` clears 4.5:1. If it doesn't, darken `--nebula-1` slightly
(not the ink — the ink token is reused elsewhere) until it does, and update
`nebula-design-framework.md` §1.1 to match.

- [ ] **Step 3: Manual verification**

Run the dev server, visually confirm every primary CTA across Overview, Workout (Train), the Routine
Wizard, and the new Records page renders the Nebula gradient in both themes with legible text.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/styles/tokens.css
git commit -m "feat(client): migrate .btn-primary to Nebula gradient"
```

---

### Task 6: HUD chrome (`.level-chip`/`.streak-chip`) + glow-on-extend wiring

**Files:**
- Modify: `packages/client/src/App.vue`

- [ ] **Step 1: Add a Nebula accent dot to `.level-chip`**

In `App.vue`'s template, both `.level-chip` instances (mobile, line ~171, and desktop, line ~193)
currently render `<b>Lv. {{ xp.level }}</b>` first. Add a small accent span immediately before it:

```vue
<span class="level-dot" aria-hidden="true"></span>
```

Add the corresponding CSS in the `<style>` block (co-located with the existing `.level-chip` rule
near line 430):

```css
.level-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nebula-grad);
  margin-right: 4px;
  vertical-align: middle;
}
```

- [ ] **Step 2: Wire the streak-pulse glow**

Find the existing `.streak-pulse` rule (near line 415). It currently only drives the `streak-pulse`
keyframe animation. Add a glow that activates for the same duration, scoped to the same class so it
can never appear outside the existing `streakJustExtended` window:

```css
.streak-pulse {
  animation: streak-pulse var(--dur-cele) var(--ease-spring);
  box-shadow: 0 0 0 1px var(--nebula-glow), 0 8px 20px -8px var(--nebula-glow-strong);
}
```

Do not add a `box-shadow` to the base (non-`.streak-pulse`) `.streak-chip` rule — its absence there
is what makes this glow transient rather than ambient, per the global constraint above.

- [ ] **Step 3: Manual verification**

In the dev server, trigger a streak extension (or temporarily set `streakJustExtended.value = true`
in Vue devtools) and confirm the glow appears only while `.streak-pulse` is applied, then fades with
the existing animation — not a permanent glow on the chip afterward.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.vue
git commit -m "feat(client): add Nebula accent to HUD level/streak chips"
```

---

### Task 7: Non-tiered `.rankbar` fallback + nav active-indicator fallback

**Files:**
- Modify: `packages/client/src/styles/tokens.css`

- [ ] **Step 1: Update the `.rankbar > i` fallback**

Find the existing rule (near line 571):

```css
  background: linear-gradient(90deg, var(--b2, var(--blue)), var(--b3, var(--blue-hi)));
```

Change the fallback values only (leave `var(--b2, ...)`/`var(--b3, ...)` — the tier-context path —
structurally identical):

```css
  background: linear-gradient(90deg, var(--b2, var(--nebula-1)), var(--b3, var(--nebula-2)));
```

This keeps every tier-context bar (inside a `.t-<tier>` ancestor) rendering that tier's own metal
gradient exactly as before — only the *fallback* (no tier context at all — e.g. `App.vue`'s XP bar)
changes.

- [ ] **Step 2: Find and update the nav active-indicator's fallback**

Search for the nav-indicator rule referencing `--tier-accent`:

Run: `grep -n "tier-accent" packages/client/src/App.vue`

Update its fallback chain from `var(--tier-accent, var(--blue-hi))` (or whatever the exact current
fallback is) to `var(--tier-accent, var(--nebula-1))` — read the exact surrounding rule first
(`nebula-design-layout.md` §0 describes the intent: nav chrome outside any tier context falls back
to Nebula, not plain blue).

- [ ] **Step 3: Manual verification**

Confirm the resting (no-tier-context) XP bar on `App.vue`'s HUD and the bottom-nav active-tab
indicator both render blue→violet→magenta instead of flat blue, in both themes.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/styles/tokens.css packages/client/src/App.vue
git commit -m "feat(client): migrate non-tiered progress-bar and nav-indicator fallbacks to Nebula"
```

---

## Phase 4 — Rank medallion Nebula ring & Finish Sequence glow (N2)

**Why fourth:** depends on Phase 2's tokens and Phase 3's glow-wiring precedent (Task 6 established
the "glow only inside the transient class" pattern this phase reuses for the rank-up beat).

### Task 8: Nebula ring around the rank medallion during a rank-up beat only

**Files:**
- Find the component rendering `.badge` inside the Finish Sequence's rank-up beat (search first):

Run: `grep -rln "class=\"badge\"" packages/client/src/components`

- Modify: whichever component that search returns (expected: the Finish Sequence's rank-up beat
  component, and/or a shared `RankBadge.vue` if one exists — confirm before editing)

- [ ] **Step 1: Locate the exact render site**

Run the grep above and open the result. Confirm it's specifically the rank-up beat's render path
(not `RanksPage.vue`'s resting-state grid, and not `RankProgress.vue`'s generic card variant — the
ring must only wrap the beat-specific instance, per the structural-not-conditional rule in Global
Constraints).

- [ ] **Step 2: Wrap the badge in a ring element, scoped to that one render site**

```vue
<span class="badge-ring">
  <span class="badge" :class="`t-${tier}`">
    <!-- existing badge SVG content unchanged -->
  </span>
</span>
```

```css
.badge-ring {
  display: inline-block;
  padding: 3px;
  border-radius: 2px;
  background: var(--nebula-grad);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}
```

- [ ] **Step 3: Verify the plausibility-discounted path cannot reach this markup**

Read the surrounding component logic for the conditional branch that renders a discounted-session
vs. a rank-up beat (per `lens-2` §5's existing three-way split, referenced in
`nebula-design-layout.md` §3). Confirm `.badge-ring` only appears inside the rank-up branch's own
template block, not behind a boolean prop/class toggle that a discounted session could also satisfy.
If the current component structure makes this ambiguous, restructure the `v-if`/`v-else-if` chain so
the ring is physically absent from the DOM (not just visually hidden) in every non-rank-up branch.

- [ ] **Step 4: Manual verification — the three-way test from `nebula-design-plan.md` Phase N2**

In the dev server, produce (or simulate via test data) three Finish Sequence outcomes: a rank-up, a
same-band recovery gain, and a plausibility-discounted session. Confirm the ring appears only for
the rank-up.

- [ ] **Step 5: Commit**

```bash
git add <the modified component>
git commit -m "feat(client): add Nebula ring to rank-up beat medallion only"
```

---

### Task 9: Rangaufstiege weekday-strip Nebula dot

**Files:**
- Modify: `packages/client/src/components/rank/RankUpCalendar.vue`

- [ ] **Step 1: Find the per-day cell render**

Read `RankUpCalendar.vue`'s template for the 7-cell weekday strip (already tier-accent-bordered per
the earlier engagement-audit-v4 Phase 2B work — confirm the exact class name for "this day had a
rank-up" before editing).

- [ ] **Step 2: Add a small Nebula dot to cells with `count > 0`**

```css
.rank-up-day.has-rankup::after {
  content: "";
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nebula-grad);
  margin: 2px auto 0;
}
```

Apply the `.has-rankup` class conditionally in the template based on that day's existing rank-up
count (already computed — this is a class binding, not new data fetching).

- [ ] **Step 3: Manual verification**

Confirm days with at least one rank-up show the dot, days with zero don't, in both themes.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/rank/RankUpCalendar.vue
git commit -m "feat(client): mark rank-up days in the weekday strip with a Nebula dot"
```

---

## Phase 5 — PR ledger Nebula paint (N3)

**Why fifth:** depends on Phase 1 (the screen must exist) and Phase 2 (the tokens). Small — this
phase is paint on an already-built screen, not new structure.

### Task 10: `.panel-reward--nebula` modifier + "just achieved" one-time treatment

**Files:**
- Modify: `packages/client/src/styles/tokens.css` (new modifier class)
- Modify: `packages/client/src/pages/RecordsPage.vue` (apply it conditionally)

- [ ] **Step 1: Add the modifier class**

Add immediately after the existing `.panel-reward::after` rule in `tokens.css`:

```css
/* A PR-ledger row that isn't tier-anchored (nebula-design-patterns.md §5) — same fallback
   pattern as .rankbar's --b2/--b3 fallback above, falling back to Nebula instead of blue when
   no tier context exists. */
.panel-reward.panel-reward--nebula {
  background: linear-gradient(155deg, var(--b2, var(--nebula-m)), var(--b1, var(--nebula-ink-on-fill)) 70%);
  border: 1px solid var(--b3, var(--nebula-1));
}
```

- [ ] **Step 2: Apply it to newly-achieved rows only**

In `RecordsPage.vue`, add a computed that flags a PR as "new" (achieved within, say, the current
session/last 24h — reuse whatever "recently" threshold convention exists elsewhere in the codebase;
if none exists, use a simple 24-hour check against `achievedAt`):

```ts
function isRecentlyAchieved(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}
```

```vue
<li
  v-for="pr in sorted"
  :key="pr.id"
  class="panel pr-row"
  :class="{ 'panel-reward panel-reward--nebula': isRecentlyAchieved(pr.achievedAt) }"
>
```

- [ ] **Step 3: Manual verification**

Confirm a freshly-set PR (log a real set that beats a prior best, or seed test data with a recent
`achievedAt`) renders with the Nebula reward treatment, and older rows stay on the plain `.panel`
style — not every row wearing the gradient.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/styles/tokens.css packages/client/src/pages/RecordsPage.vue
git commit -m "feat(client): add Nebula reward treatment for newly-achieved PRs"
```

---

## Phase 6 — Cut duplication (`engagement-audit-v5` Phase 2)

**Why here:** fully independent of every Nebula phase and Phase 1; can run in parallel with any of
them. Small, mechanical, per the source audit's own framing ("a subtraction... never a new page").

### Task 11: Simplify Overview's "Top Ränge" tile

**Files:**
- Modify: `packages/client/src/pages/OverviewPage.vue`

- [ ] **Step 1: Replace the full re-render with a single actionable line**

Replace the block at lines 332–346 (the `<div class="tile">...Top Ränge...</div>`) with:

```vue
<div class="tile">
  <div class="eyebrow tile-head">Nächster Rang</div>
  <p v-if="topRanks.length > 0" class="tile-empty">
    <b class="tnum">{{ Math.round(100 - topRanks[0]!.lp) }} LP</b> bis zum nächsten Rang in
    <b>{{ exerciseName(topRanks[0]!.slug) }}</b>
  </p>
  <p v-else class="tile-empty">Dein erster Rang entsteht, sobald du eine Übung geloggt hast.</p>
</div>
```

This keeps `topRanks` (already sorted by LP descending) but only reads its first element — no
per-tier badge SVG, no three-row list, since Ranks already shows that in full and this tile's job is
now a teaser line, not a duplicate render.

- [ ] **Step 2: Remove now-unused imports/constants if this was their only use site**

Run: `grep -n "TIER_BADGE_PATH\|TIER_LABEL_DE" packages/client/src/pages/OverviewPage.vue`

If either symbol has no other reference in the file after Step 1's edit, remove its import/
definition. If either is still used elsewhere on the page, leave it.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Confirm the tile renders the one-line teaser correctly for both a populated and an empty
`topRanks`, and that tapping through to `/ranks` (existing "Rang-Analyse" discover tile) still shows
the full detail.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/OverviewPage.vue
git commit -m "fix(client): simplify Overview's Top-Ränge tile to a single teaser line"
```

---

### Task 12: Remove the duplicate Daten-Export entry point; unify the LP explainer string

**Files:**
- Modify: `packages/client/src/pages/OverviewPage.vue`
- Create: `packages/client/src/copy/rankCopy.ts`
- Modify: `packages/client/src/pages/RanksPage.vue`

- [ ] **Step 1: Remove the Daten-Export discover tile**

In `OverviewPage.vue`, remove the `<router-link to="/profile" class="tile discover-tile">` block for
"Daten-Export" (lines 374–378), keeping the "Rang-Analyse" tile immediately after it. Profile already
hosts this feature (`ProfilePage.vue`'s own "Daten-Export" card); this removes the second entry point
advertising it, per `engagement-audit-v5.md` Phase 2's "keep one instance" rule.

- [ ] **Step 2: Extract the shared LP-explainer sentence**

```ts
// packages/client/src/copy/rankCopy.ts
/** Canonical wording for "what LP measures" — was independently worded on OverviewPage.vue and
 *  RanksPage.vue (engagement-audit-v5.md Phase 2 finding); one string, both call sites. */
export const LP_EXPLAINER = "misst deinen Fortschritt innerhalb der aktuellen Stufe (0–100)";
```

- [ ] **Step 3: Use it in both `InfoToggle` bodies**

In `OverviewPage.vue`'s `InfoToggle` (around line 300), replace the hand-written LP sentence with:

```vue
<b class="tnum">LP</b> {{ LP_EXPLAINER }}.
```

(keeping the rest of that explainer's unique "Gesamtrang"/division wording unchanged around it), and
import `LP_EXPLAINER` from `../copy/rankCopy`. Do the same substitution in `RanksPage.vue`'s
`InfoToggle` (around line 71), keeping its unique trust-marker (`≈`) sentence unchanged.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS

- [ ] **Step 5: Manual verification**

Confirm both InfoToggle explainers still read naturally as full sentences (not concatenated
oddly) and use identical wording for the LP-specific clause.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/OverviewPage.vue packages/client/src/pages/RanksPage.vue packages/client/src/copy/rankCopy.ts
git commit -m "fix(client): remove duplicate Daten-Export entry point, unify LP explainer wording"
```

---

## Phase 7 — Profile domain grouping (`engagement-audit-v5` Phase 3)

**Why here:** independent of everything else; small, purely structural (adds group headers, doesn't
move or rebuild any existing card).

### Task 13: Add domain-group headers to `ProfilePage.vue`

**Files:**
- Modify: `packages/client/src/pages/ProfilePage.vue`

- [ ] **Step 1: Insert four group headers around the existing card sequence**

The current flat order (after Phase 2/4's additions above) is: Körpergewicht, Trainingsprofil,
Equipment, Scheiben & Stange, Darstellung (Phase 2 Task 4), XP & Level, API-Token, Health Connect,
Daten-Export, Attributions link. Group them with a new `.group-header` element inserted before the
first card of each group:

```vue
<h1 class="group-header">Trainingsprofil</h1>
<!-- Körpergewicht, Trainingsprofil, Equipment, Scheiben & Stange cards unchanged below -->

<h1 class="group-header">Fortschritt</h1>
<!-- XP & Level card unchanged below -->

<h1 class="group-header">Daten &amp; Server</h1>
<!-- Darstellung, API-Token, Health Connect, Daten-Export cards unchanged below -->

<h1 class="group-header">Über</h1>
<!-- Attributions link unchanged below -->
```

(Move the "Darstellung" theme-toggle card from Phase 2 Task 4 to sit under "Daten & Server" if it
isn't already positioned there, since it's a device/app-level setting, not a training-profile one.)

- [ ] **Step 2: Style the new header**

Add to the `<style scoped>` block:

```css
.group-header {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--faint);
  margin: var(--sp6) 0 0;
}
.group-header:first-of-type {
  margin-top: var(--sp2);
}
```

- [ ] **Step 3: Give "Daten & Server" a visually quieter tier**

Per `engagement-audit-v5.md` Phase 3's explicit note ("not a danger zone... just a lower-priority
visual tier"), add a modifier to the three cards under that group:

```css
.card--quiet {
  opacity: 0.92;
  background: var(--surface);
}
```

Apply `class="card card--quiet"` to the "Darstellung", "API-Token", "Health Connect", and
"Daten-Export" `<section>` elements.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS

- [ ] **Step 5: Manual verification**

Confirm the page now reads as four visually distinct groups with real headers, the animation
stagger (existing `.card:nth-of-type` rules) still looks reasonable with headers interspersed, and
the "Daten & Server" cards read as a visually quieter tier without looking broken/disabled, in both
themes.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/ProfilePage.vue
git commit -m "fix(client): add domain-group headers to Profile, per engagement-audit-v5 Phase 3"
```

---

## Phase 8 — Overview priority surfacing (`engagement-audit-v5` Phase 4)

**Why last among the audit-v5 phases:** the source doc itself sequences this after Phases 2–3
(duplication cut, grouping) — the layout Phase 8 re-weights is cleaner once Phase 6 has already
simplified the tile it's ranking against.

### Task 14: Distinct visual priority for action-relevant Overview cards

**Files:**
- Modify: `packages/client/src/pages/OverviewPage.vue`

- [ ] **Step 1: Identify the action-relevant cards**

Locate the resume-workout card, recovery-zone status card (Erholungszone), and the
"Rangaufstiege diese Woche" weekly nudge in the template (all already exist per
`engagement-audit-v5.md` §4's own confirmation — this task re-weights their existing rendering, does
not add new cards).

- [ ] **Step 2: Add a priority modifier class**

```css
.tile--priority {
  border: 1px solid var(--nebula-1);
  background: var(--surface-3);
}
```

Apply `class="tile tile--priority"` (or the equivalent existing card class on each of those three
elements) in place of their current plain treatment. Use `--nebula-1` (a static border accent, not
the full gradient/glow) — this is a resting-state visual-hierarchy cue, not a transient earned
moment, so it deliberately does not use `--nebula-grad` or any glow token per the global constraint
above.

- [ ] **Step 3: Reframe the empty "Rangaufstiege diese Woche" copy**

Find the current copy ("Der erste Aufstieg dieser Woche steht noch aus" or equivalent) and replace
with encouraging/actionable framing, e.g.:

```vue
<p class="tile-empty">Dein nächster Rangaufstieg wartet — leg los!</p>
```

Keep this within the fun/informational boundary — no urgency language ("verpasse nicht...", countdown
framing), per `engagement-audit-v5.md` §1.5.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client typecheck`
Expected: PASS

- [ ] **Step 5: Manual verification**

Confirm the three action-relevant cards visually stand out from plain stat tiles on the same page,
in both themes, without a new section or layout restructure.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/OverviewPage.vue
git commit -m "fix(client): give action-relevant Overview cards visual priority over stat tiles"
```

---

## Phase 9 — Verification sweep (N4)

**Why last:** closes the loop across every phase above; needs all of them done first.

### Task 15: Cross-phase contrast, viewport, and rule-compliance sweep

**Files:** none created/modified — this is a checklist/verification task; any fix it surfaces
becomes a follow-up commit against the specific file involved, not a new file of its own.

- [ ] **Step 1: Screen-by-screen Nebula rule check**

For each of Overview, Train, Ranks, Records, Plan/Wizard, Profile, Runs: confirm exactly one resting
`.btn-primary` per screen carries the Nebula gradient, and every other Nebula appearance
(HUD dot, streak glow, badge ring, weekday-strip dot, PR reward treatment) is either static/small
(border accents, dots) or strictly transient (tied to `.streak-pulse`/the rank-up beat), per
`nebula-design-layout.md` §7.

- [ ] **Step 2: Full contrast re-audit, both themes**

For every color pairing touched by Phases 2–8 (not just Phase 2's original token list), verify
≥4.5:1 (body text) / ≥3:1 (large text/UI) using a contrast checker, in both `data-theme="dark"` and
`data-theme="light"`. Record any failure as a follow-up task against the specific token/rule.

- [ ] **Step 3: Mobile-viewport check, both themes**

Run this repo's existing mobile-viewport-check convention (per `CLAUDE.md`/the `mobile-viewport-
check` skill) across Overview, Train, Ranks, Records, and Profile at 390px width, in both themes —
this is the first time that check needs to cover two themes, not just one.

- [ ] **Step 4: Full test suite + typecheck across all packages**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no regressions from any phase above.

- [ ] **Step 5: Commit any fixes found in Steps 1–3**

Each fix gets its own small, targeted commit against the file it corrects — do not batch unrelated
fixes into one commit.

---

## Phase dependency summary

| Phase | Depends on | Can run in parallel with |
|---|---|---|
| 1 (PR ledger) | — | 2, 6, 7 |
| 2 (Nebula tokens/theme) | — | 1, 6, 7 |
| 3 (chrome/CTA) | 2 | 6, 7, 8 (after 6) |
| 4 (medallion ring) | 2, 3 (glow pattern) | 6, 7 |
| 5 (PR paint) | 1, 2 | 6, 7 |
| 6 (cut duplication) | — | 1, 2, 3, 4, 5, 7 |
| 7 (Profile grouping) | 2 (for the theme toggle's placement) | 1, 3, 4, 5, 6 |
| 8 (priority surfacing) | 6 (cleaner once dedup lands) | 1, 5, 7 |
| 9 (verification) | all above | — |

Dispatch order for subagent-driven execution: **Tasks 1, 3, 11 can start immediately in parallel**
(three independent subagents). Task 4 follows Task 3. Tasks 5–7 follow Task 4. Task 8–9 follow
Tasks 3 and 5–7. Task 10 follows Tasks 2 and 3. Tasks 12–14 can run any time after Task 11 (Task 12)
or independently (Tasks 13–14). Task 15 runs last, after everything else lands.
