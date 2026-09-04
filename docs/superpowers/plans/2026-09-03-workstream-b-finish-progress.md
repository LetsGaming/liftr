# Workstream B: Finish, Progress & Mechanics Implementation Plan

**STATUS: SHIPPED, VERIFIED LIVE** on 2026-09-04 — plausibility-reason threading, Finish Sequence muted badge rings, RankUpCalendar flagged-dot logic, and the LP-bar animation all confirmed working live, including a forced-implausible session that was correctly caught and visually flagged (`audit/verify/agent-8.md`, `audit/verify/round2-agent-3.md`). **Task 7 (streak/XP mechanics redesign) is correctly still deferred** — confirmed NOT implemented: `packages/shared/src/math/xp.ts` still uses the pre-redesign, weight-fabricable formula, and no `consistencyBonusXp`/`varietyBonusXp` code exists anywhere in the repo (`audit/verify/agent-8.md`). Do not mark Task 7 done; see `docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md` for the spec waiting to be planned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real, already-shipped plausibility-gating bug in the rank-up celebration path, finish the Finish Sequence's LP-bar animation and three-way visual distinction (genuine rank-up / same-band recovery / plausibility-discounted), verify (not rebuild) two areas prior review flagged as likely-already-done, and scope — but not implement — the open streak/XP mechanics question.

**Architecture:** Server-side: thread the plausibility gate's `reason` through the one place it doesn't yet reach (`rank_events` rows), via a new nullable column, so both consumers of "did this exercise rank up" (the finish-workout verdict array and the weekday rank-events aggregation) can distinguish a genuine rank-up from a discounted one. Client-side: surface that distinction in `FinishSequence.vue`'s Beat 1 and `RankUpCalendar.vue`'s dots without touching either component's existing Nebula additions (`.badge-ring`, `.nebula-dot`). No new mechanics are designed in this plan — the streak/XP task explicitly stops at "run a brainstorm," per the orchestration plan's instruction not to invent mechanics blind.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API) + Ionic on the client; Fastify + Zod + Drizzle/SQLite on the server; `@liftr/shared` for pure math/typing shared by both; Vitest for server tests (this codebase has no client-side `.test.ts` files — client verification here is manual, per existing convention, using the `mobile-viewport-check` skill).

**Spec:** `docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §3.2 (this workstream's scope and priority order); `audit/plan-c-new-ui-rebuild.md` §3 Phase 2 (original Finish Sequence & Progress spec); `audit/workplan-v1.md` §0's "Underlying mechanics — also open" note and consolidated open question 10 (streak/XP framing); `audit/nebula-design-components.md` §3 (already-shipped Nebula additions this plan builds on top of, not around).

## Global Constraints

- A plausibility-discounted session must never be visually indistinguishable from a genuine rank-up.
- The LP bar must animate literally from `prevLp` to `lp`, not jump.
- A same-band recovery gain gets a lighter single-beat tag, not a full celebration.
- XP/level must never be shown twice in disconnected treatments simultaneously.

---

## Codebase findings that ground this plan (read before starting)

**The plausibility-gating bug is real and matches the orchestration brief's description, with one addition the brief didn't call out.** Confirmed by direct trace:

- `packages/client/src/composables/useWorkoutFinish.ts:183-195` builds `sessionRankUps` (feeds `FinishSequence`'s Beat 1 celebration) with `ranks.filter((r) => r.rankedUp || r.newPr)` and **no check against `r.plausibilityReason`** — even though `r.plausibilityReason` is already present on every verdict object (`packages/server/src/services/syncService.ts:76`, `:241`) and is *already* consulted three lines below, at `useWorkoutFinish.ts:214`, when building the separate `sessionCaptions` list. The field is right there; Beat 1's filter just never looks at it.
- `packages/server/src/services/rankService.ts:176-220`: `rankedUp` requires `peakEligible` (`plausibilityMultiplier >= PEAK_ELIGIBILITY_FLOOR = 0.3`, `rankService.ts:176-177`), which is far more forgiving than `packages/shared/src/rank/plausibility.ts`'s own floor (`PLAUSIBILITY_FLOOR = 0.05`, `plausibility.ts:61`) or its reason-setting condition (`reason` is set whenever `worst > 0` at all, `plausibility.ts:121-126` — i.e. essentially any detected severity, not just severe cases). So a session with multiplier anywhere in the wide (0.3, 1) band can carry a non-null `plausibilityReason` *and* still set `rankedUp = true` on the peak's own (never-discounted, `rankService.ts:328-330`'s own comment) `bestE1rm`. That session renders Beat 1's full badge-ring celebration exactly as if it were clean.
- **Addition the brief's file list didn't fully anticipate:** `RankUpCalendar.vue`'s gap is *not* purely a client filtering bug — it's a genuine data gap. The `rank_events` table (`packages/db/src/schema.ts:268-280`) has no plausibility column at all, and `insertRankEvent` (called from `rankService.ts:300-306`, inside `recomputeRankForExercise`) is never passed a reason — only `plausibilityMultiplier` reaches that function today, not the `reason` string. `computeRankEventsByWeekday` (`rankService.ts:368-377`) can only count events, it has nothing to filter on. **Fixing this requires a schema migration** (new nullable `plausibility_reason` column on `rank_events`, threaded through `recomputeRankForExercise`'s signature and its one `insertRankEvent` call), not just a filter added to existing aggregation code. Task 1 below does this migration; it is real, if small, backend work — flagged here so it isn't mistaken for a pure client fix at execution time.
- **LP bar animation is not yet implemented at all for Beat 1.** `FinishSequence.vue:131` renders each rank-up row's bar as a static `scaleX(${Math.round(r.lp) / 100})` — no animation, no reference to `prevLp` whatsoever, despite `RankUpSummary` already carrying both `lp` and `prevLp` (`FinishSequence.vue:18-25`). This directly violates the second Global Constraint today; Task 4 fixes it.
- **Ranks/Progress trust legibility is already implemented, confirmed by direct read, not just grep.** `RankProgress.vue:66-76,101,109,152-156,172-176` computes and renders a `trustLabel` ("Abgeleiteter Standard" / "Geschätzter Standard") plus a `≈` marker, both visible (not `title`-only), for `derived`/`synthetic` trust — and `RanksPage.vue:74-78` has a page-level `InfoToggle` explaining the `≈` marker in plain language. Task 5 is verification-only, no rebuild, per the instruction to confirm before scoping new work.
- **Overall Rank placement is already implemented in three places**, confirmed by direct read: `RanksPage.vue:63-68` (a `TierLadder` hero showing current vs. peak position on the full 9-tier ladder), `OverviewPage.vue:289` (a `StatTile reward` showing `overallRankLabel`), and `WorkoutPage.vue:130-132` (the finish-sequence share card's tier badge reads `overallRank.current`). Task 6 is verification-only.
- **The Finish Sequence's PR beat already links into `/records`** — `RanksPage.vue:70-72` has a `🏆 Rekorde ansehen` link to `/records`; this is verified as part of Task 4, not rebuilt.

---

## Task 1: Thread `plausibilityReason` onto `rank_events` rows (server)

The one piece of real backend work this workstream needs: today `rank_events` (the table `RankUpCalendar.vue`'s weekday strip reads from) has no way to know whether the rank-up it's recording came from a flagged session. Add a nullable column, thread the reason from `syncService.ts` (which already computes it) through `recomputeRankForExercise` to the one `insertRankEvent` call, and split the weekday aggregation into total vs. flagged counts.

**Files:**
- Modify: `packages/db/src/schema.ts:268-280` (add column)
- Create (via `drizzle-kit generate`, not hand-authored): `packages/db/drizzle/0011_*.sql` and its `meta/0011_snapshot.json`
- Modify: `packages/server/src/repositories/rankRepository.ts:87-89` (`findRankEventsSince`)
- Modify: `packages/server/src/services/rankService.ts:95-99` (function signature), `:300-306` (`insertRankEvent` call), `:368-377` (`computeRankEventsByWeekday`)
- Modify: `packages/server/src/services/syncService.ts:240` (call site)
- Modify: `packages/server/src/routes/rankEvents.ts:12-17` (response schema)
- Modify: `packages/client/src/services/rankEventsService.ts:3-7` (client type)
- Test: `packages/server/src/services/rankService.test.ts`

**Interfaces:**
- Consumes: `PlausibilityReason` type, already exported from `@liftr/shared` (`packages/shared/src/index.ts:17` re-exports `./rank/plausibility.js`, which defines `export type PlausibilityReason = "pace" | "improbable_jump" | "exceeds_ceiling"`).
- Produces: `recomputeRankForExercise(db, exerciseId, plausibilityMultiplier?, plausibilityReason?)` — new 4th optional parameter, default `null`, backward-compatible with every existing caller (`recompute.ts`, `workoutService.ts`, `overallRankService.test.ts`, `rankService.test.ts`'s many 2-arg calls) which need no changes. `computeRankEventsByWeekday` now returns `RankEventsByWeekday[]` where each row is `{ weekday: number; count: number; flaggedCount: number }` — Task 3 (client) consumes `flaggedCount`.

- [ ] **Step 1: Add the column to the schema**

Edit `packages/db/src/schema.ts`, replacing the `rankEvents` table definition (lines 268-280):

```ts
export const rankEvents = sqliteTable(
  "rank_events",
  {
    id: id(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),
    division: integer("division").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    /** Rank engine v2 gap fix (workstream B, task 1): null when the workout that produced this
     *  rank-up was fully plausible, otherwise the same reason plausibility.ts attached to that
     *  workout. Lets the weekday aggregation (rankService.ts's computeRankEventsByWeekday) and
     *  RankUpCalendar.vue mute a flagged-but-still-peak-eligible rank-up's dot instead of
     *  rendering it identically to a genuine one — `ranks`/`rankedUp` itself was already gated
     *  by PEAK_ELIGIBILITY_FLOOR (0.3), which is looser than plausibility.ts's own floor (0.05)
     *  and reason-setting threshold (any detected severity at all), so a moderately-flagged
     *  session can genuinely advance peak and still deserve a muted dot, not an omitted one. */
    plausibilityReason: text("plausibility_reason", { enum: ["pace", "improbable_jump", "exceeds_ceiling"] }),
  },
  (t) => [index("rank_events_exercise_idx").on(t.exerciseId)],
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @liftr/db run generate`

This produces a new `packages/db/drizzle/00NN_<random-name>.sql` (next sequential number after `0010`) containing `ALTER TABLE rank_events ADD COLUMN plausibility_reason text;`, plus the matching `meta/00NN_snapshot.json` and an updated `meta/_journal.json`. Do not hand-author these — drizzle-kit generates them from the schema diff. Open the generated `.sql` file and confirm it contains exactly one `ALTER TABLE` statement adding the nullable column (no data loss, no other tables touched).

- [ ] **Step 3: Apply the migration to the dev/test databases**

Run: `pnpm --filter @liftr/db run migrate`

- [ ] **Step 4: Update `findRankEventsSince` to select the new column**

Edit `packages/server/src/repositories/rankRepository.ts:87-89`:

```ts
/** Raw rank-up timestamps (+ plausibility flag) within the window — the weekday reduction
 *  happens in the service layer (readinessService.ts's "repository fetches, service reduces"
 *  split). */
export function findRankEventsSince(db: LiftrDb, since: Date) {
  return db
    .select({ occurredAt: rankEvents.occurredAt, plausibilityReason: rankEvents.plausibilityReason })
    .from(rankEvents)
    .where(gte(rankEvents.occurredAt, since));
}
```

- [ ] **Step 5: Thread `plausibilityReason` through `recomputeRankForExercise`**

Edit `packages/server/src/services/rankService.ts`. First, add `type PlausibilityReason` to the existing `@liftr/shared` import (top of file, currently lines 10-21):

```ts
import {
  estimateE1rm,
  resolveRank,
  nextLoadTarget,
  nextTargetAtOrdinal,
  ordinal,
  ordinalToBand,
  ratchetPeak,
  computeCurrentBand,
  applySessionRecoveryGain,
  type StandardThreshold,
  type PlausibilityReason,
} from "@liftr/shared";
```

Change the function signature (lines 95-99):

```ts
export async function recomputeRankForExercise(
  db: LiftrDb,
  exerciseId: string,
  plausibilityMultiplier = 1,
  plausibilityReason: PlausibilityReason | null = null,
): Promise<RecomputeResult | null> {
```

Update the one `insertRankEvent` call (lines 300-306):

```ts
  if (rankedUp && peak) {
    await insertRankEvent(db, {
      exerciseId,
      tier: peak.tier,
      division: peak.division,
      occurredAt: bestSet.loggedAt,
      plausibilityReason,
    });
  }
```

- [ ] **Step 6: Split `computeRankEventsByWeekday` into total vs. flagged counts**

Edit `packages/server/src/services/rankService.ts:354-377`:

```ts
export interface RankEventsByWeekday {
  /** JS `Date.getDay()`-indexed: 0 = Sunday ... 6 = Saturday, same convention as the client's
   *  existing `DAY_ABBR` table (useWorkoutFinish.ts) — kept identical so a future caller never
   *  has to remap between the two. */
  weekday: number;
  count: number;
  /** Count of this weekday's rank-ups whose originating workout was plausibility-flagged
   *  (workstream B task 1) — lets the client mute a day's dot when every rank-up logged that
   *  day was discounted, without omitting the day's existence outright the way dropping it from
   *  `count` entirely would. */
  flaggedCount: number;
}

/**
 * Rank-ups grouped by weekday over the current rolling week (engagement rework W8's
 * "Rangaufstiege" calendar strip) — repository fetches the raw rows, this reduces them, the
 * same split `readinessService.ts`'s `computeMuscleLastTrained` already uses. Always returns
 * all 7 weekdays (zero-filled), so the client can render a fixed 7-cell strip without gaps.
 */
export async function computeRankEventsByWeekday(db: LiftrDb, days = 7): Promise<RankEventsByWeekday[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await findRankEventsSince(db, since);

  const counts = new Array<number>(7).fill(0);
  const flagged = new Array<number>(7).fill(0);
  for (const r of rows) {
    const weekday = r.occurredAt.getDay();
    counts[weekday]!++;
    if (r.plausibilityReason != null) flagged[weekday]!++;
  }
  return counts.map((count, weekday) => ({ weekday, count, flaggedCount: flagged[weekday]! }));
}
```

- [ ] **Step 7: Update the `syncService.ts` call site to pass the reason**

Edit `packages/server/src/services/syncService.ts:240`:

```ts
    const result = await recomputeRankForExercise(db, exerciseId, plausibility.multiplier, plausibility.reason);
```

- [ ] **Step 8: Update the `/api/rank-events` response schema**

Edit `packages/server/src/routes/rankEvents.ts:12-17`:

```ts
const rankEventsResponse = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    count: z.number().int().min(0),
    flaggedCount: z.number().int().min(0),
  }),
);
```

- [ ] **Step 9: Update the client-side type to match**

Edit `packages/client/src/services/rankEventsService.ts`:

```ts
import { api } from "../lib/api";

export interface RankEventsByWeekday {
  /** JS `Date.getDay()`-indexed: 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  count: number;
  /** Count of this weekday's rank-ups whose originating workout was flagged by the
   *  plausibility gate (workstream B task 1) — see RankUpCalendar.vue for how this mutes a
   *  day's dot. */
  flaggedCount: number;
}

export function getRankEvents(): Promise<RankEventsByWeekday[]> {
  return api.get<RankEventsByWeekday[]>("/api/rank-events");
}
```

- [ ] **Step 10: Write the failing tests first**

Add to `packages/server/src/services/rankService.test.ts`, inside the existing `describe("recomputeRankForExercise", ...)` block (after the test ending at line 418, before the closing `});`):

```ts
  it("stores the plausibility reason on the rank_events row for a moderately-flagged rank-up", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id);

    await logSet(ex.id, 90, 8); // genuinely higher e1RM -> a real peak advance
    // 0.4 is peak-eligible (>= PEAK_ELIGIBILITY_FLOOR 0.3) so this still fires rankedUp, but it
    // carries a reason — exactly the gap this task closes.
    const result = await recomputeRankForExercise(db, ex.id, 0.4, "improbable_jump");
    expect(result!.rankedUp).toBe(true);

    const rows = await db.select().from(rankEvents).where(eq(rankEvents.exerciseId, ex.id));
    expect(rows).toHaveLength(2); // the clean first rank-up + this flagged one
    expect(rows.some((r) => r.plausibilityReason === "improbable_jump")).toBe(true);
    expect(rows.some((r) => r.plausibilityReason === null)).toBe(true);
  });
```

Add to the existing `describe("computeRankEventsByWeekday", ...)` block (after the test ending at line 440, before the closing `});`):

```ts
  it("splits today's rank-ups into total vs. flagged counts", async () => {
    const ex = await insertTestExercise(db);
    await seedStandards(ex.id);
    await logSet(ex.id, 60, 8);
    await recomputeRankForExercise(db, ex.id); // clean rank-up #1

    const ex2 = await insertTestExercise(db);
    await seedStandards(ex2.id);
    await logSet(ex2.id, 60, 8);
    await recomputeRankForExercise(db, ex2.id, 0.4, "pace"); // flagged rank-up #2

    const result = await computeRankEventsByWeekday(db);
    const todayWeekday = new Date().getDay();
    const today = result.find((r) => r.weekday === todayWeekday)!;
    expect(today.count).toBe(2);
    expect(today.flaggedCount).toBe(1);
  });
```

- [ ] **Step 11: Run the new tests and confirm they fail before the implementation, pass after**

Run: `pnpm --filter @liftr/server test -- rankService.test.ts`

Expected before Steps 1-9: compile error (`plausibilityReason` not a valid 4th argument, `rankEvents.plausibilityReason` doesn't exist). Expected after: all tests in the file pass, including the two new ones.

- [ ] **Step 12: Run the full server test suite**

Run: `pnpm --filter @liftr/server test`

Expected: PASS — in particular `syncService.test.ts` (which already asserts on `result!.ranks?.some((r) => r.plausibilityReason === ...)` at the `SyncResult`/`RankVerdict` level, unaffected by this task since that field's shape didn't change) and `overallRankService.test.ts` (calls `recomputeRankForExercise` with 2 args, still valid against the new 4-arg signature with two defaults).

- [ ] **Step 13: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle packages/server/src/repositories/rankRepository.ts packages/server/src/services/rankService.ts packages/server/src/services/rankService.test.ts packages/server/src/services/syncService.ts packages/server/src/routes/rankEvents.ts packages/client/src/services/rankEventsService.ts
git commit -m "feat(rank): store plausibility reason on rank_events rows

Closes the gap where a moderately-flagged-but-peak-eligible rank-up
(multiplier in [0.3, 1)) advanced peak and logged a rank_events row
with no way to later distinguish it from a genuine one. Threads the
reason from syncService's already-computed plausibility gate through
recomputeRankForExercise into the one insertRankEvent call, and splits
computeRankEventsByWeekday into count/flaggedCount so RankUpCalendar
can mute a day's dot instead of showing it identically to a clean
rank-up."
```

---

## Task 2: Fix the plausibility-gating bug in the Finish Sequence's rank-up beat (client, highest priority)

The actual bug: `sessionRankUps` in `useWorkoutFinish.ts` never checks `plausibilityReason`, so `FinishSequence.vue`'s Beat 1 renders a discounted rank-up with the exact same full-saturation `.badge-ring` celebration as a genuine one. Fix: carry a `plausibilityNote` onto each `RankUpSummary` (reusing the same `PLAUSIBILITY_NOTE_DE` copy map `sessionCaptions` already uses three lines below — same honest, threshold-free German copy, no new strings to invent), and have `FinishSequence.vue` render a visibly muted treatment whenever it's set.

**Files:**
- Modify: `packages/client/src/components/workout/FinishSequence.vue:18-25` (interface), `:54-60` (`topTierClass`), `:118-136` (Beat 1 template), style block (~lines 241-248)
- Modify: `packages/client/src/composables/useWorkoutFinish.ts:183-195`

**Interfaces:**
- Consumes: `PLAUSIBILITY_NOTE_DE` (module-scoped `Record<string, string>` already defined at `useWorkoutFinish.ts:34-38`, no export needed — used in the same file).
- Produces: `RankUpSummary` gains a required field `plausibilityNote: string | null`. `useWorkoutShareCard.ts` imports this type (`import type { RankUpSummary } from "../components/workout/FinishSequence.vue"`) — adding a field doesn't break its usage (it only reads `exerciseName`/`tier`/`isPr` for the share-card canvas, confirmed by the type being additive-only here).

- [ ] **Step 1: Add `plausibilityNote` to `RankUpSummary` and compute it in `useWorkoutFinish.ts`**

Edit `packages/client/src/components/workout/FinishSequence.vue:18-25`:

```ts
export interface RankUpSummary {
  exerciseName: string;
  tier: string;
  division: number;
  isPr: boolean;
  lp: number;
  prevLp: number;
  /** Rank engine v2 gap fix (workstream B task 2): set when this exercise's rank-up came from a
   *  plausibility-flagged session — never states exact numbers (same PLAUSIBILITY_NOTE_DE copy
   *  useWorkoutFinish.ts's sessionCaptions already uses). Global constraint: a flagged rank-up
   *  must never render identically to a genuine one — see the template below. */
  plausibilityNote: string | null;
}
```

Edit `packages/client/src/composables/useWorkoutFinish.ts:183-195`:

```ts
    sessionRankUps.value = ranks
      .filter((r) => r.rankedUp || r.newPr)
      .map((r) => {
        const ex = catalogStore.byId(r.exerciseId);
        return {
          exerciseName: ex ? exerciseName(ex.slug) : "",
          tier: r.tier,
          division: r.division,
          isPr: r.newPr != null,
          lp: r.lp,
          prevLp: r.prevLp,
          plausibilityNote: r.plausibilityReason ? (PLAUSIBILITY_NOTE_DE[r.plausibilityReason] ?? null) : null,
        };
      });
```

- [ ] **Step 2: Stop a discounted-only session from staging the celebratory tier-gradient background**

Edit `packages/client/src/components/workout/FinishSequence.vue:54-60` — `topTierClass` currently picks the highest tier across *all* `rankUps`, including discounted ones, which would still stage the full-color background wash even when nothing genuine happened this session:

```ts
/** Rework Phase 4 (critique finding: .finish-seq had no background, no color, no shadow — the
 *  emotional climax of the app rendered as centered text on plain --bg). Highest tier among this
 *  session's *genuine* rank-ups stages the whole sequence's background; a discounted-only session
 *  (workstream B task 2 — Global Constraint: a discounted session must never look genuine) falls
 *  back to the same neutral surface ramp as a session with no rank-ups at all. */
const topTierClass = computed(() => {
  const genuine = props.rankUps.filter((r) => !r.plausibilityNote);
  if (genuine.length === 0) return "";
  const top = genuine.reduce((best, r) => (TIERS.indexOf(r.tier as Tier) > TIERS.indexOf(best.tier as Tier) ? r : best));
  return `t-${top.tier}`;
});
```

- [ ] **Step 3: Mute discounted rows in the Beat 1 template**

Edit `packages/client/src/components/workout/FinishSequence.vue`, replacing the `.rankup-row` block inside Beat 1 (lines 121-134):

```html
        <div
          v-for="(r, i) in rankUps"
          :key="i"
          class="rankup-row panel-reward pop-in"
          :class="[`t-${r.tier}`, { discounted: r.plausibilityNote }]"
          :style="{ animationDelay: i * 90 + 'ms' }"
        >
          <span :class="r.plausibilityNote ? 'badge-ring-muted' : 'badge-ring'">
            <span class="badge" :class="`t-${r.tier}`">
              <svg viewBox="0 0 24 24"><path :d="TIER_BADGE_PATH[r.tier as RankTier]" /></svg>
            </span>
          </span>
          <div class="rankup-meta">
            <b>{{ r.exerciseName }}</b>
            <span>{{ r.isPr ? "Neuer Rekord" : `${TIER_LABEL_DE[r.tier as RankTier]} ${DIVISION_LABEL[r.division]}` }}</span>
            <span v-if="r.plausibilityNote" class="plausibility-note">{{ r.plausibilityNote }}</span>
            <div class="rankbar">
              <i class="bar-fill" :style="{ transform: `scaleX(${Math.round(r.lp) / 100})` }" />
            </div>
          </div>
        </div>
```

(The `scaleX` here stays a placeholder for Task 4, which replaces it with the animated value — this task only needs the muted-vs-genuine visual split in place.)

- [ ] **Step 4: Add the muted styling**

Edit `packages/client/src/components/workout/FinishSequence.vue`'s `<style scoped>` block, right after the existing `.badge-ring` rule (currently ending around line 248):

```css
/* Muted counterpart to .badge-ring (workstream B task 2 — Global Constraint: a plausibility-
   discounted session must never be visually indistinguishable from a genuine rank-up). Flat
   --surface-3 instead of the Nebula brand gradient — deliberately the one place in this beat
   that does NOT get the gradient treatment. */
.badge-ring-muted {
  display: inline-block;
  flex: none;
  padding: 3px;
  border-radius: 2px;
  background: var(--surface-3);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}
/* Discounted row: desaturated + slightly dimmed, so it reads as "happened, but muted" rather
   than a full celebration — paired with .badge-ring-muted above and the plausibility-note line
   below. */
.rankup-row.discounted {
  filter: grayscale(0.55);
  opacity: 0.85;
}
.plausibility-note {
  font-size: 11px;
  font-style: italic;
  color: var(--dim);
}
```

- [ ] **Step 5: Manual verification (no client unit tests exist in this codebase for `.vue` components — this is the established pattern, e.g. no test file exists for `FinishSequence.vue` today)**

Start the dev server (`pnpm --filter @liftr/client dev` and `pnpm --filter @liftr/server dev`, or however this repo's local dev loop normally runs — check `package.json` scripts at the repo root if unsure). Log a workout with a session logged fast enough / with a big enough single-session jump to trip `computeWorkoutPlausibility` (e.g. many sets logged in well under `PACE_FINE_THRESHOLD_S` seconds/set, per `plausibility.ts:32`) on an exercise close to a rank-up. Confirm:
- The rank-up still appears in Beat 1 (it is not hidden — only its treatment changes).
- Its badge has no colored Nebula gradient ring (flat `--surface-3` instead).
- The row is visibly desaturated relative to a genuine rank-up row.
- The `plausibilityNote` copy (e.g. "Diese Session wirkte ungewöhnlich schnell — Rang- und XP-Gewinn wurden reduziert.") is visible under the tier line.
- If this was the *only* rank-up this session, the whole `.finish-seq` background does not pick up that tier's color wash (stays the neutral surface ramp).

Then invoke the `mobile-viewport-check` skill against `WorkoutPage.vue`'s finish flow to confirm this still renders correctly at mobile widths (this workstream's primary target per that skill's own description).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/workout/FinishSequence.vue packages/client/src/composables/useWorkoutFinish.ts
git commit -m "fix(finish-sequence): mute plausibility-discounted rank-ups in Beat 1

sessionRankUps only filtered on rankedUp||newPr and never checked
plausibilityReason, so a moderately-flagged session (peak-eligible at
multiplier >= 0.3, but still flagged per plausibility.ts's much looser
0.05 floor) rendered the exact same full badge-ring celebration as a
genuine rank-up. Threads a plausibilityNote onto RankUpSummary (same
copy sessionCaptions already used) and mutes the row/badge/background
whenever it's set."
```

---

## Task 3: Fix `RankUpCalendar.vue`'s independent copy of the same gap

Same underlying issue, different consumer: the weekday strip's dot lit up identically for a flagged rank-up as a genuine one, because `rank_events` itself never recorded the flag (fixed server-side in Task 1). Now that `computeRankEventsByWeekday` returns `flaggedCount`, make the dot distinguish "at least one genuine rank-up this day" from "every rank-up this day was flagged."

**Files:**
- Modify: `packages/client/src/components/rank/RankUpCalendar.vue`

**Interfaces:**
- Consumes: `RankEventsByWeekday` from `rankEventsService.ts` (Task 1, Step 9) — now `{ weekday: number; count: number; flaggedCount: number }`.

- [ ] **Step 1: Compute a per-day "has a genuine rank-up" flag**

Edit `packages/client/src/components/rank/RankUpCalendar.vue:20-27`:

```ts
const days = computed(() => {
  const byWeekday = new Map(store.byWeekday.map((d) => [d.weekday, d]));
  return MO_SO_ORDER.map((weekday) => {
    const row = byWeekday.get(weekday);
    const count = row?.count ?? 0;
    const flaggedCount = row?.flaggedCount ?? 0;
    return {
      weekday,
      label: DAY_ABBR[weekday]!,
      count,
      /** Workstream B task 3: a day where every logged rank-up was plausibility-flagged should
       *  not render identically to a day with a genuine one (Global Constraint). */
      hasGenuine: count > flaggedCount,
    };
  });
});
```

- [ ] **Step 2: Update the template — full gradient only for a day with a genuine rank-up, muted flat dot for flagged-only**

Edit `packages/client/src/components/rank/RankUpCalendar.vue:36-40`:

```html
      <div v-for="d in days" :key="d.weekday" class="streak-day">
        <span class="dot" :class="{ active: d.hasGenuine, flagged: d.count > 0 && !d.hasGenuine }">{{ d.count > 0 ? d.count : "" }}</span>
        <span v-if="d.hasGenuine" class="nebula-dot" aria-hidden="true" />
        <span class="dl">{{ d.label }}</span>
      </div>
```

- [ ] **Step 3: Add the muted `.dot.flagged` style, next to the existing `.dot.active` rule**

Edit `packages/client/src/components/rank/RankUpCalendar.vue`'s `<style scoped>` block, right after the existing `.dot.active` rule (currently lines 84-90):

```css
/* Workstream B task 3 (Global Constraint: a flagged rank-up must never look genuine) — a day
   where every rank-up was plausibility-flagged gets a flat, unlit dot instead of the tier
   gradient .dot.active uses; the count still shows (the day isn't hidden), just not celebrated.
   No .nebula-dot accent for this state either (see the template's v-if="d.hasGenuine" above). */
.dot.flagged {
  background: var(--surface-3);
  opacity: 0.7;
}
```

- [ ] **Step 4: Manual verification**

With the same flagged-session repro from Task 2 Step 5 (or the new `computeRankEventsByWeekday` test data as a mental model), confirm on the Ränge page:
- A day with only flagged rank-ups shows its count but a flat, unlit dot — no gradient, no `.nebula-dot` accent.
- A day with at least one genuine rank-up (even alongside flagged ones) keeps the full gradient + `.nebula-dot` treatment.
- A day with zero rank-ups is unchanged (empty dot, as before).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/rank/RankUpCalendar.vue
git commit -m "fix(rank-up-calendar): mute days where every rank-up was flagged

Reads the new flaggedCount from /api/rank-events (workstream B task 1)
to distinguish a day with a genuine rank-up from a day where every
logged rank-up was plausibility-discounted — previously both rendered
identically."
```

---

## Task 4: Finish Sequence — literal `prevLp`→`lp` bar animation + verify PR beat linkage

The second Global Constraint ("the LP bar must animate literally from `prevLp` to `lp`, not jump") is not implemented at all today — every row's bar renders a static final value. Fix that for Beat 1's per-exercise bars, using the same ease-out-cubic curve `useCountUp.ts` already uses elsewhere in this file for the XP roll-up, adapted for an array of rows (since `useCountUp`'s `Ref<number>` API assumes one static target, which doesn't fit a `v-for` of independently-valued rows).

**Files:**
- Modify: `packages/client/src/components/workout/FinishSequence.vue`

**Interfaces:**
- Consumes: `RankUpSummary.prevLp` / `RankUpSummary.lp` (already present, `FinishSequence.vue:18-25`), `celebrate.activeIndex` (`useCelebrate.ts`'s existing `ref<number>`), `prefers-reduced-motion` convention already used by `useCountUp.ts` and `useCelebrate.ts` (collapse to instant, no animation).

- [ ] **Step 1: Add the array-variant animation state**

Edit `packages/client/src/components/workout/FinishSequence.vue`'s `<script setup>`, near the existing `xpRollTarget`/`barPercentTarget` declarations (around line 67-70):

```ts
/** LP bar animation for Beat 1 (Global Constraint: "the LP bar must animate literally from
 *  prevLp to lp, not jump"). useCountUp's Ref<number> API assumes one static target per call,
 *  which doesn't fit a v-for of independently-valued rows — this is a small array variant of
 *  the same ease-out-cubic curve instead of reusing useCountUp as-is. */
function prefersReducedMotionLocal(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const rankUpBarDisplay = ref<number[]>([]);
let rankUpBarFrame: number | null = null;

function animateRankUpBars() {
  if (rankUpBarFrame != null) cancelAnimationFrame(rankUpBarFrame);
  const rows = props.rankUps;
  const to = rows.map((r) => Math.max(0, Math.min(100, Math.round(r.lp))));
  if (prefersReducedMotionLocal() || rows.length === 0) {
    rankUpBarDisplay.value = to;
    return;
  }
  const from = rows.map((r) => Math.max(0, Math.min(100, Math.round(r.prevLp))));
  rankUpBarDisplay.value = [...from];
  const start = performance.now();
  const durationMs = 700;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3); // matches useCountUp.ts's ease-out-cubic
    rankUpBarDisplay.value = from.map((f, i) => f + (to[i]! - f) * eased);
    if (t < 1) {
      rankUpBarFrame = requestAnimationFrame(step);
    } else {
      rankUpBarDisplay.value = to;
      rankUpBarFrame = null;
    }
  };
  rankUpBarFrame = requestAnimationFrame(step);
}
```

- [ ] **Step 2: Trigger it when Beat 1 becomes active, and cancel on unmount**

Edit the existing `watch(() => celebrate.activeIndex.value, ...)` block (`FinishSequence.vue:71-84`) to also handle `i === 0`:

```ts
watch(
  () => celebrate.activeIndex.value,
  (i) => {
    if (i === 0) animateRankUpBars();
    if (i === 2) {
      xpDisplay.value = 0;
      barPercent.value = leveledUp.value ? 0 : props.progressBefore;
      requestAnimationFrame(() => {
        xpRollTarget.value = props.sessionXp;
        barPercentTarget.value = props.progressAfter;
      });
      if (leveledUp.value) void haptics.success();
    }
  },
);
```

Add cleanup — `FinishSequence.vue` doesn't currently import `onBeforeUnmount`, so add it to the existing `vue` import (line 11):

```ts
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
```

Add near the bottom of `<script setup>`, after the existing `watch(() => celebrate.running.value, ...)` block:

```ts
onBeforeUnmount(() => {
  if (rankUpBarFrame != null) cancelAnimationFrame(rankUpBarFrame);
});
```

- [ ] **Step 3: Wire the animated value into the template**

Replace the placeholder `scaleX` from Task 2 Step 3 in the Beat 1 template:

```html
            <div class="rankbar">
              <i class="bar-fill" :style="{ transform: `scaleX(${(rankUpBarDisplay[i] ?? r.prevLp) / 100})` }" />
            </div>
```

- [ ] **Step 4: Verify the PR beat's link into `/records` still holds**

This is a confirmation step, not new work (`audit/nebula-design-components.md` §3 and the source-read above already establish `RanksPage.vue:70-72` has the `🏆 Rekorde ansehen` link). Read `packages/client/src/pages/RanksPage.vue:70-72` again after this task's edits and confirm the link is untouched — this task's file (`FinishSequence.vue`) doesn't reach `/records` itself, so there is nothing to change here; this step exists only to catch an accidental regression if Task 2/3/4's edits somehow touched routing (they don't).

- [ ] **Step 5: Manual verification**

With `prefers-reduced-motion` off, trigger a workout finish with a genuine rank-up whose `prevLp` and `lp` differ visibly (e.g. an exercise sitting at LP 70 before the session, ranking up to a fresh LP 15 in the new band, or staying same-band and climbing from 40 to 85). Confirm:
- Beat 1's bar visibly animates from the old value to the new one over ~700ms, not a jump-cut.
- With `prefers-reduced-motion: reduce` (browser/OS setting, or DevTools emulation), the bar renders at its final value immediately with no animation — consistent with `useCountUp.ts`'s and `useCelebrate.ts`'s existing reduced-motion behavior.
- A session with multiple rank-ups animates every row's bar independently and correctly (no cross-row value bleed — confirms the array-indexed `from`/`to` mapping is correct per row).

Then invoke the `mobile-viewport-check` skill on the Finish Sequence flow.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/workout/FinishSequence.vue
git commit -m "feat(finish-sequence): animate Beat 1's LP bars from prevLp to lp

Every rank-up row's bar previously rendered a static final scaleX with
no reference to prevLp at all, despite RankUpSummary already carrying
it — directly violating the 'must animate literally from prevLp to lp'
constraint. Adds a small array-variant of useCountUp's ease-out-cubic
curve (one rAF loop driving every row's bar in parallel, since
useCountUp's Ref<number> API assumes a single static target)."
```

---

## Task 5: Verify Ranks/Progress trust legibility (confirm-only — likely already closed)

`audit/workplan-v1.md`'s 2026-09-03 status check found `trust` referenced across six `.vue` files and flagged it as "likely already closed... needs a quick visual confirmation, not a fresh build." The direct read done for this plan (see "Codebase findings" above) confirms the *code* renders a visible label and marker, not just a `title` attribute. This task is the remaining step: confirm it renders correctly, don't rebuild it.

**Files:** none modified unless a genuine gap is found (none was, per the trace below).

- [ ] **Step 1: Re-confirm the render path by direct read (already done once for this plan — repeat only if time has passed since Task 1-4 shipped and you want a fresh check)**

Read `packages/client/src/components/rank/RankProgress.vue:66-76` (computes `trustLabel`), `:101` (the `≈` marker next to the tier name), `:109` (`<div v-if="trustLabel" class="rp-trust">{{ trustLabel }}</div>`), and `:152-156,172-176` (the CSS — `.trust-marker`/`.rp-trust` are real, visible, non-zero-opacity rules, not `display:none` or a decoy). Confirm `RanksPage.vue:74-78`'s `InfoToggle` still explains the `≈` marker in reachable copy (not a `title`-only tooltip, which would be invisible on this app's touch-only platform per `lens-3`'s original finding this was designed against).

- [ ] **Step 2: Manual visual confirmation**

On a real or seeded exercise with `trust: "derived"` or `trust: "synthetic"` standards, open the Ränge page and confirm: the `≈` marker is visible next to the tier name, and a caption line below the LP bar reads "Abgeleiteter Standard" or "Geschätzter Standard" as appropriate. Tap the page's `InfoToggle` and confirm the explanation is reachable without hover (this app is touch-only).

- [ ] **Step 3: Record the outcome**

If Steps 1-2 confirm the behavior (expected, based on this plan's own trace) — no code change, no commit. Just note in the PR/plan tracking that this item is confirmed closed, so it isn't silently re-flagged as "open" on the next audit pass. If a genuine gap is found instead (e.g. the marker is present but the caption text is missing on some variant, or a specific screen was missed), stop and write a new bite-sized task before touching any code — this plan deliberately does not pre-author a fix for a gap that direct reading didn't find.

---

## Task 6: Verify Overall Rank placement (confirm-only — likely already closed)

Same pattern as Task 5: `audit/workplan-v1.md` flags this as likely-closed based on a source grep; this plan's direct read (see "Codebase findings" above) confirms three concrete render sites. Confirm, don't rebuild.

**Files:** none modified unless a genuine gap is found (none was, per the trace below).

- [ ] **Step 1: Re-confirm the three render sites by direct read**

`RanksPage.vue:63-68` — `TierLadder` hero, fed `overallRank.current`/`overallRank.peak` (renders even pre-first-workout, per `TierLadder.vue:35`'s `cur === -1` fallback lighting Initiate). `OverviewPage.vue:289` — `<StatTile reward :value="overallRankLabel" label="Gesamt&shy;rang" />`. `WorkoutPage.vue:130-132` — the finish share-card's `shareTier` computed reads `overallRank.current`.

- [ ] **Step 2: Manual visual confirmation of prominence, not just presence**

Open Overview, Ränge, and a finished-workout share card. Confirm the overall rank is genuinely legible at a glance on each (not buried below the fold, not truncated — `OverviewPage.vue`'s own comment near line 513 already documents a prior truncation fix for `overallRankLabel`, confirm it still holds).

- [ ] **Step 3: Record the outcome**

Per Task 5 Step 3's same rule: if confirmed, no code change, just note it closed. If a genuine placement/prominence gap is found (a taste call, not a missing-plumbing bug — `audit/workplan-v1.md` §5 already flags this as "a taste call for whoever implements it, not something research can settle"), write a new bite-sized task rather than guessing at a fix here.

---

## Task 7: Streak/XP mechanics — design pass (brainstorm first, no implementation here)

`audit/workplan-v1.md`'s §0 "Decided 2026-09-03" note is explicit that this is broader than a UI reskin: the product owner's own framing is "appetite for genuinely new mechanics beyond what the existing rank ladder/streak system does," and the rank/tier ladder itself (9-tier, peak/current, decay-with-recovery) was explicitly *not* flagged — it stays as-is. What's open is the streak/XP layer specifically. Per the orchestration plan's explicit instruction, this plan does not invent that shape — it scopes the design step and stops.

**Files:** none — this task produces a design document, not code.

- [ ] **Step 1: Run a brainstorming session before writing any implementation task**

Invoke the `superpowers:brainstorming` skill (per its own trigger condition: "before any creative work — creating features... requires exploring user intent, requirements and design before implementation"). Ground it explicitly in:
- What currently exists and is *not* up for redesign: the 9-tier rank ladder, peak/current split, decay-with-recovery math (`packages/shared/src/rank/`), and the plausibility gate this very plan just hardened (Tasks 1-4) — any new mechanic must compose with, not bypass, the plausibility gate.
- What currently exists and *is* explicitly open: the streak system (`packages/server/src/services/streakService.ts` or equivalent — locate it during the brainstorm, don't assume its exact file layout here) and the XP/level system (`xpStore.ts`, `xp.ts` server-side), both currently "purely additive, never gates or replaces the rank system" per `lens-2 §6 item 4` (cited in `plan-c-new-ui-rebuild.md`).
- The explicit out-of-scope boundary already established elsewhere in this workstream's source documents: no social/multi-user features (leaderboards, friends, percentile comparison — `plan-c-new-ui-rebuild.md` §5, structurally unbuildable on the current single-bearer-token, no-accounts backend), no masked/near-miss reward targets, no currency/cosmetics economy, no gated onboarding quests (`audit/workplan-v1.md` §6, "each individually evidenced against by the product owner's own stated line on manipulative patterns").
- The product owner's own visual-identity decision already made (Nebula: "bolder... not motion-heavy ceremony beyond what the evidence already supports for rare/earned moments," `audit/workplan-v1.md` §0) — any new mechanic's *presentation* should stay consistent with that restraint-on-motion, boldness-on-color stance, even though the mechanic itself is unresolved.

- [ ] **Step 2: Produce a short design note from the brainstorm, not a full plan**

Output of Step 1 should be a written design note (its own file, e.g. `docs/superpowers/plans/<date>-streak-xp-mechanics-design.md` or wherever the brainstorming skill's own output convention points) covering: what problem the new mechanic(s) solve that the existing streak/XP system doesn't, a concrete shape (not "something more engaging"), and how it interacts with the plausibility gate and the rank ladder. This note is a prerequisite for a future implementation plan — it is explicitly not written here, per the orchestration plan's instruction that this sub-item "needs its own brainstorm/design pass before implementation tasks can be written for it."

- [ ] **Step 3: Do not proceed to implementation tasks in this plan**

Once Step 2's design note exists, a *separate* bite-sized implementation plan should be written against it (following this same `superpowers:writing-plans` process) before any code changes land. This task's own deliverable is the design note, not shipped mechanics — closing it here, rather than guessing at a shape, is the honest scoping this workstream's source documents explicitly called for.

---

## Self-review (per `superpowers:writing-plans`)

**Spec coverage:** Global Constraint 1 (discounted ≠ genuine) → Tasks 1-3. Global Constraint 2 (literal `prevLp`→`lp` animation) → Task 4. Global Constraint 3 (recovery gain gets a lighter tag) → already satisfied by existing code (`sessionCaptions`/`captionRows` in `WorkoutPage.vue:337-350`, `RankProgress.vue`'s `recoveryGainLabel` prop) and structurally untouched by this plan's edits (`sessionRankUps`'s filter, which recovery gains never satisfy, is unchanged) — verified during Task 2's manual check, no dedicated task needed since there's no gap to close. Global Constraint 4 (XP/level shown once) → already fixed per `App.vue`'s `hideTopHud` (workplan-v1 §1.4, verified fixed) and untouched by this plan. Orchestration §3.2's priority order (1. plausibility fix, 2. Finish Sequence rebuild, 3. PR-beat-links-to-/records confirm, 4. Ranks/Progress trust + Overall Rank, 5. streak/XP design pass) → Tasks 1-3, 4, 4-Step-4, 5-6, 7 respectively.

**Placeholder scan:** every step above contains real file paths, real line numbers (as read, subject to drift if earlier tasks in this same plan shift line numbers within a file — noted inline where a later task edits a file an earlier task already changed, e.g. Task 4 replaces a template line Task 2 just wrote), and real code, not descriptions of code. Tasks 5-7 are legitimately verification/design-only (not implementation), per the brief's own explicit instruction not to invent mechanics or rebuild what's already confirmed working — this is not a placeholder, it's the correctly-scoped shape of "verify, don't rebuild" and "brainstorm, don't guess."

**Type consistency:** `RankUpSummary.plausibilityNote: string | null` (Task 2) is the single new field threaded through; Task 4 reads `r.prevLp`/`r.lp` (already existing fields, unchanged). `RankEventsByWeekday` (Task 1) gains `flaggedCount: number`, consumed identically by name in Task 3. `recomputeRankForExercise`'s new 4th parameter name `plausibilityReason: PlausibilityReason | null` (Task 1) matches the type already exported as `PlausibilityReason` from `@liftr/shared`.
