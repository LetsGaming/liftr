/**
 * Streak tracking with protection (plan Phase 2.4, audit §2.2: "one missed day must never
 * destroy motivation"). Pure function over a set of activity dates — computed fresh each read,
 * not incrementally maintained, so it's always self-consistent with whatever's actually logged.
 *
 * Known simplification: protection is a fixed pool per computation, not a true weekly-accrual
 * bank (the plan's "1 token per week, max 2 banked" isn't tracked across time — every walk just
 * starts with a fresh pool). Close enough for "a missed day doesn't wreck it" in practice;
 * flagged here rather than silently overclaiming precision.
 */
export interface StreakResult {
  streak: number;
  tokensRemaining: number;
}

/** Fallback pool when the onboarding profile's `workoutsPerWeek` is unset — today's original
 *  flat behavior, unchanged for anyone who hasn't answered that onboarding question. */
const DEFAULT_TOKEN_POOL = 2;
/** A ceiling so a very low stated frequency (e.g. 1x/week) doesn't inflate the pool to where
 *  "streak" stops meaning anything — the goal is accuracy for the stated schedule, not
 *  protecting genuine long stretches of inactivity. */
const MAX_TOKEN_POOL = 6;

/**
 * Derives the protection pool from how many rest days the lifter's own stated schedule implies.
 * The daily-granularity walk below spends one token per gap day regardless of *why* it's a gap
 * — someone training 2x/week has, by design, ~5 non-training days a week, and without this the
 * flat 2-token pool exhausts mid-week and reports a "broken" streak for a perfectly on-schedule
 * lifter. `expectedGapDays` is the longest gap the stated frequency implies within a week (e.g.
 * 3x/week → sessions roughly every 2-3 days); the pool is one more than that, so a single normal
 * between-session gap doesn't cost the streak, while a *second* consecutive missed cycle still
 * does — this is about matching the stated schedule, not being lenient with it.
 */
function tokenPoolFor(workoutsPerWeek: number | undefined): number {
  if (!workoutsPerWeek || workoutsPerWeek <= 0) return DEFAULT_TOKEN_POOL;
  const expectedGapDays = Math.ceil(7 / workoutsPerWeek) - 1;
  return Math.min(MAX_TOKEN_POOL, Math.max(DEFAULT_TOKEN_POOL, expectedGapDays + 1));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeStreak(activityDates: Set<string>, now: Date = new Date(), workoutsPerWeek?: number): StreakResult {
  const tokenPool = tokenPoolFor(workoutsPerWeek);
  if (activityDates.size === 0) return { streak: 0, tokensRemaining: tokenPool };

  // Bound the backward walk by the earliest-ever activity date — without this, a single
  // logged day would burn through the protection pool walking into calendar history that
  // predates the app being used at all, which isn't a "missed day" in any meaningful sense.
  const earliest = [...activityDates].sort()[0]!;

  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayStr = toDateStr(cursor);

  // if today has no activity yet, that's not a break — just start the real count from yesterday
  if (!activityDates.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  let tokens = tokenPool;

  while (toDateStr(cursor) >= earliest) {
    const dateStr = toDateStr(cursor);
    if (activityDates.has(dateStr)) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else if (tokens > 0) {
      tokens--; // protected gap: doesn't count toward the streak, doesn't break it either
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return { streak, tokensRemaining: tokens };
}
