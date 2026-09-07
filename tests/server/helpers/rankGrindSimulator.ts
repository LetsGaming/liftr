import { eq } from "drizzle-orm";
import { ANCHOR_STANDARDS, TIERS, ordinal, rankRepMultiplier, type Tier } from "@liftr/shared";
import { ranks, standards, type LiftrDb } from "@liftr/db";
import { applySyncBatch, type SyncItem, type RankVerdict } from "~server/services/syncService.js";

/** Every anchor slug has a full, real 9-tier/27-division threshold ladder (the same numbers
 *  `pnpm ingest --standards` would load into a real db) — pick whichever anchor's ratio range
 *  suits the scenario. `back-squat` is the default: a real (not derived/synthetic) anchor with a
 *  wide, well-populated spread. */
export type AnchorSlug = keyof typeof ANCHOR_STANDARDS;

/** Seeds the REAL production threshold ladder for one exercise — not hand-picked test numbers,
 *  the actual `ANCHOR_STANDARDS[anchorSlug]` values every real user's rank is resolved against.
 *  Using the production data (rather than a trimmed 2-3-row fixture like the unit tests use) is
 *  the point for balance/anti-cheat simulation: a grind through a fake ladder doesn't tell you
 *  anything about whether the *real* one is well paced. */
export async function seedRealAnchorStandards(
  db: LiftrDb,
  exerciseId: string,
  anchorSlug: AnchorSlug = "back-squat",
  sex: "male" | "female" = "male",
) {
  const thresholds = ANCHOR_STANDARDS[anchorSlug];
  if (!thresholds) throw new Error(`no ANCHOR_STANDARDS entry for "${anchorSlug}"`);
  await db.insert(standards).values(
    thresholds.map((t) => ({
      exerciseId,
      sex,
      metric: "load_ratio" as const,
      tier: t.tier,
      division: t.division,
      threshold: t.threshold,
      trust: t.trust,
    })),
  );
}

/** The load-ratio a lifter needs to just *enter* `tier` (its weakest division's threshold) for
 *  the given anchor — read from the real production standards, not hand-derived. Useful for
 *  picking realistic start/target ratios for a simulated lifter profile ("start a beginner just
 *  under Initiate", "target a pro just past Elite"). */
export function tierEntryRatio(anchorSlug: AnchorSlug, tier: Tier): number {
  const rows = ANCHOR_STANDARDS[anchorSlug]!.filter((t) => t.tier === tier);
  if (rows.length === 0) throw new Error(`no ${tier} rows for anchor "${anchorSlug}"`);
  return Math.min(...rows.map((t) => t.threshold));
}

export const TIER_ORDER: readonly Tier[] = TIERS;

export interface GrindSession {
  /** Days since the grind's start date (fractional allowed for same-day multi-session tests). */
  dayOffset: number;
  weightKg: number;
  reps: number;
  /** Whole-session wall-clock duration. Default (25min) is comfortably above the pace-flag floor
   *  for a realistic 3-working-set session; override to deliberately trigger the pace heuristic. */
  durationSeconds?: number;
  /** Working sets per session; default 3, matches a realistic top-set-plus-backoffs session. */
  setCount?: number;
}

export interface GrindTraceEntry {
  sessionIndex: number;
  dayOffset: number;
  weightKg: number;
  reps: number;
  /** The *displayed current* band from this session's RankVerdict — decays toward/below peak
   *  based on real wall-clock time elapsed since this session's `loggedAt`, per
   *  `computeCurrentBand`. For a grind dated in the past (the normal case here, to simulate
   *  months/years of training quickly), this is NOT what a real user training in real time would
   *  have seen session-to-session — it reflects decay all the way from this session's simulated
   *  date to whenever the test actually runs. Use `peakTier`/`peakDivision`/`peakLp` for
   *  pacing/balance assertions instead; use `tier`/`division`/`lp` only when the scenario is
   *  deliberately testing decay itself (see tests/README.md-adjacent comment on `runGrind`). */
  tier: Tier;
  division: number;
  lp: number;
  /** The stored *peak* band, read directly from the `ranks` table after this session — the
   *  timeless, decay-immune "best ever proven" measure (never recomputed against today's
   *  bodyweight or today's date). This is what pacing/balance tests should assert against. */
  peakTier: Tier | null;
  peakDivision: number | null;
  peakLp: number | null;
  rankedUp: boolean;
  plausibilityReason: RankVerdict["plausibilityReason"];
  newPr: boolean;
  /** Present only when the session's log_set item(s) were hard-rejected (e.g. over
   *  MAX_PLAUSIBLE_WEIGHT_KG) rather than merely discounted — a different, earlier defense layer
   *  than the plausibility gate. */
  rejected: boolean;
}

async function readPeak(
  db: LiftrDb,
  exerciseId: string,
): Promise<{ peakTier: Tier | null; peakDivision: number | null; peakLp: number | null }> {
  const [row] = await db.select().from(ranks).where(eq(ranks.exerciseId, exerciseId));
  return {
    peakTier: (row?.peakTier as Tier | null) ?? null,
    peakDivision: row?.peakDivision ?? null,
    peakLp: row?.peakLp ?? null,
  };
}

let uidCounter = 0;
/** Deterministic, collision-free id generator — avoids Math.random() so a failing simulation is
 *  reproducible from its trace alone. */
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/** Runs a sequence of single-exercise training sessions through the real production sync
 *  pipeline (`applySyncBatch` — the exact function `/api/sync` calls), one finished workout per
 *  session, and returns the resulting rank trace. This is deliberately NOT a reimplementation of
 *  rank/plausibility logic — every number in the trace came from the same code path a real
 *  logged set goes through, so a balance/anti-cheat finding here is a finding about the real
 *  app, not about a simulation's own bugs. */
export async function runGrind(
  db: LiftrDb,
  exerciseId: string,
  sessions: GrindSession[],
  startDate: Date,
): Promise<GrindTraceEntry[]> {
  const trace: GrindTraceEntry[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    const startedAt = new Date(startDate.getTime() + s.dayOffset * 86_400_000);
    const durationSeconds = s.durationSeconds ?? 25 * 60;
    const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const setCount = s.setCount ?? 3;
    const workoutId = uid("grind-w");
    const weId = uid("grind-we");

    const items: SyncItem[] = [
      {
        clientId: uid("c-start"),
        type: "start_workout",
        payload: { id: workoutId, startedAt, exercises: [{ id: weId, exerciseId, orderIndex: 0 }] },
      },
      ...Array.from({ length: setCount }, (_, setIndex) => ({
        clientId: uid("c-set"),
        type: "log_set" as const,
        payload: {
          workoutExerciseId: weId,
          setIndex,
          weightKg: s.weightKg,
          reps: s.reps,
          kind: "normal" as const,
          loggedAt: new Date(startedAt.getTime() + (setIndex * durationSeconds * 1000) / setCount),
        },
      })),
      {
        clientId: uid("c-finish"),
        type: "finish_workout",
        payload: { workoutId, endedAt, pausedSeconds: 0 },
      },
    ];

    const results = await applySyncBatch(db, items);
    const rejected = results.some((r) => r.status === "error");
    const finishResult = results[results.length - 1]!;
    const verdict = finishResult.ranks?.find((r) => r.exerciseId === exerciseId);

    if (!verdict) {
      if (rejected) {
        // every set was hard-rejected (e.g. over MAX_PLAUSIBLE_WEIGHT_KG) — nothing to recompute,
        // carry the previous trace entry's band forward so callers can still index by session.
        const prev = trace[trace.length - 1];
        trace.push({
          sessionIndex: i,
          dayOffset: s.dayOffset,
          weightKg: s.weightKg,
          reps: s.reps,
          tier: prev?.tier ?? TIER_ORDER[0]!,
          division: prev?.division ?? 0,
          lp: prev?.lp ?? 0,
          peakTier: prev?.peakTier ?? null,
          peakDivision: prev?.peakDivision ?? null,
          peakLp: prev?.peakLp ?? null,
          rankedUp: false,
          plausibilityReason: null,
          newPr: false,
          rejected: true,
        });
        continue;
      }
      throw new Error(`no rank verdict for session ${i} — check standards are seeded for ${exerciseId}`);
    }

    const peak = await readPeak(db, exerciseId);
    trace.push({
      sessionIndex: i,
      dayOffset: s.dayOffset,
      weightKg: s.weightKg,
      reps: s.reps,
      tier: verdict.tier as Tier,
      division: verdict.division,
      lp: verdict.lp,
      ...peak,
      rankedUp: verdict.rankedUp,
      plausibilityReason: verdict.plausibilityReason,
      newPr: verdict.newPr != null,
      rejected,
    });
  }
  return trace;
}

/** Converts a load-ratio *threshold* (as stored in `standards`/`ANCHOR_STANDARDS`, and what
 *  `resolveRank` compares `rankSkillScore(weight, reps) / bodyweightKg` against) into the actual
 *  weightKg needed to hit it at a given rep count. NOT `ratio * bodyweightKg` — that formula
 *  silently ignores `rankRepMultiplier`, so at reps=5 (multiplier ~1.17) it overshoots the real
 *  target by ~17%, more at higher reps. Always derive weight from a ratio through this function,
 *  not by hand — this is the one arithmetic mistake this whole harness is built to avoid
 *  repeating in every test file. */
export function ratioToWeightKg(ratio: number, bodyweightKg: number, reps: number): number {
  return (ratio * bodyweightKg) / rankRepMultiplier(reps);
}

/** Realistic diminishing-returns progressive-overload curve, expressed in load-ratio space (the
 *  same unit `resolveRank` operates in) and converted to weightKg via `ratioToWeightKg` — fast
 *  early gains, decelerating toward `targetRatio`. Rounds to the nearest 2.5kg plate increment
 *  (standard barbell loading), which matters beyond realism: the rank engine's peak only
 *  advances once a result is corroborated by a SECOND, separate day reaching or exceeding the
 *  same band (see rankService.ts's `isPeakCorroborated`) — a continuously, individually-
 *  incrementing weight (no two sessions ever landing on the same band) can never corroborate
 *  naturally. Real barbell loading already produces this coarseness (you don't add a fresh 0.1kg
 *  every session), so this isn't inventing plateaus to make the harness "work" — it's removing
 *  an unrealistically smooth curve that was masking how corroboration behaves for a real lifter. */
export function progressiveOverloadSessions(opts: {
  sessionCount: number;
  sessionsPerWeek: number;
  startRatio: number;
  targetRatio: number;
  bodyweightKg: number;
  /** Higher = faster approach to targetRatio. 0.015 reaches ~90% of the gain by session ~150. */
  rate?: number;
  reps?: number;
  startDayOffset?: number;
}): GrindSession[] {
  const { sessionCount, sessionsPerWeek, startRatio, targetRatio, bodyweightKg, rate = 0.02, reps = 5, startDayOffset = 0 } =
    opts;
  const daysBetween = 7 / sessionsPerWeek;
  return Array.from({ length: sessionCount }, (_, i) => {
    const ratio = targetRatio - (targetRatio - startRatio) * Math.exp(-rate * i);
    const weightKg = ratioToWeightKg(ratio, bodyweightKg, reps);
    return {
      dayOffset: startDayOffset + Math.round(i * daysBetween),
      weightKg: Math.round(weightKg / 2.5) * 2.5,
      reps,
    };
  });
}

/** Re-exported for convenience — tests comparing two trace entries' bands want the real
 *  `ordinal()` (0 = Initiate's weakest division, higher = stronger), not a hand-rolled copy. */
export { ordinal as bandOrdinal };
