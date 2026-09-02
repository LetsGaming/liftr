/**
 * Server-side rank recompute (plan Phase 2.2 / audit §5 "rank engine runs server-side so it's
 * consistent and cheap to re-derive"). Pure orchestration — all the actual math (e1RM, tier
 * resolution, next-target search) lives in @liftr/shared and is unit-tested there; this file
 * only fetches the rows (via rankRepository.ts) and calls it. Always safe to re-run: `ranks` and
 * `prs` are derived caches, never the source of truth (plan's "every derived table is
 * rebuildable").
 */
import type { LiftrDb } from "@liftr/db";
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
} from "@liftr/shared";
import { findLatestBodyweightLog } from "../repositories/bodyweightRepository.js";
import {
  findBestPrByKind,
  findExerciseById,
  findLoggedSetsForExercise,
  findRankByExerciseId,
  findRankEventsSince,
  findStandardsForExercise,
  insertPr,
  insertRankEvent,
  upsertRank,
} from "../repositories/rankRepository.js";
import { readJsonSetting } from "../repositories/settingsRepository.js";
import type { Profile } from "../routes/settings.js";

/** No bodyweight-tracking UI exists yet (plan Phase 6) — fall back to a configurable default. */
const FALLBACK_BODYWEIGHT_KG = 75;

/**
 * Inverse of "ordinal*100 + lp" continuous position, including a real `lp`. Mirrors
 * @liftr/shared's rank/decay.ts `positionToBand` (unexported there) — needed here because
 * `ordinalToBand` alone only recovers the whole-number tier/division (it rounds to the *nearest*
 * ordinal, appropriate for its other callers, but loses the fractional LP entirely), and the
 * plausibility-scaled recovery-gain position below is fractional by construction.
 */
function scaledPositionToBand(position: number): { tier: ReturnType<typeof ordinalToBand>["tier"]; division: number; lp: number } {
  const clamped = Math.max(0, position);
  const bandOrdinal = Math.floor(clamped / 100);
  const { tier, division } = ordinalToBand(bandOrdinal);
  const lp = ordinal(tier, division) === bandOrdinal ? clamped - bandOrdinal * 100 : 100;
  return { tier, division, lp };
}

export async function getCurrentBodyweightKg(db: LiftrDb): Promise<number> {
  const latest = await findLatestBodyweightLog(db);
  if (latest) return latest.weightKg;

  const defaultKg = await readJsonSetting<number>(db, "defaultBodyweightKg");
  if (defaultKg != null) return Number(defaultKg);

  return FALLBACK_BODYWEIGHT_KG;
}

/**
 * QUAL-04: which standards population to rank against. Defaults to "male" when the onboarding
 * profile question is unanswered — the same population ANCHOR_STANDARDS was calibrated against
 * before FEMALE_ANCHOR_STANDARDS existed, so an unset profile keeps today's behavior rather than
 * silently guessing.
 */
export async function getUserSex(db: LiftrDb): Promise<"male" | "female"> {
  const profile = await readJsonSetting<Profile>(db, "profile");
  return profile?.sex ?? "male";
}

export interface RecomputeResult {
  rankedUp: boolean;
  newPr: { kind: string; value: number } | null;
  tier: string;
  division: number;
  /** LP within the current tier/division band, 0-100 (engagement rework W2) — returned on
   *  every recompute, not just rank-ups, so the client can animate the in-session rank bar on
   *  every logged set, not only the rare moment it crosses a division. */
  lp: number;
  /** LP before this set, so the client knows how far to animate from. Only meaningful when
   *  compared against `lp` for the *same* tier/division — a rank-up resets the band, so the
   *  client treats rankedUp as "bar fills to 100 then resets", not "prevLp -> lp directly". */
  prevLp: number;
}

/**
 * Recompute one exercise's rank from its full set history, detect PRs, and persist both.
 * Called after every finished workout, once per touched exercise (see services/syncService.ts).
 */
export async function recomputeRankForExercise(
  db: LiftrDb,
  exerciseId: string,
  plausibilityMultiplier = 1,
): Promise<RecomputeResult | null> {
  const exercise = await findExerciseById(db, exerciseId);
  if (!exercise) return null;

  const sex = await getUserSex(db);
  const thresholdRows = await findStandardsForExercise(db, exerciseId, sex);
  if (thresholdRows.length === 0) return null; // e.g. plank/side-plank — no metric modeled yet

  const thresholds: StandardThreshold[] = thresholdRows.map((t) => ({
    tier: t.tier,
    division: t.division,
    threshold: t.threshold,
    trust: t.trust,
  }));

  const loggedSets = await findLoggedSetsForExercise(db, exerciseId);
  if (loggedSets.length === 0) return null;

  const metric = thresholdRows[0]!.metric;
  const bodyweightKg = await getCurrentBodyweightKg(db);

  let bestValue = -Infinity;
  let bestSet: (typeof loggedSets)[number] | null = null;
  let bestE1rm = 0;
  let preferredReps = 8;

  for (const s of loggedSets) {
    let value: number;
    let e1rm: number;
    if (metric === "reps") {
      value = s.reps;
      e1rm = s.reps; // no load concept for pure rep-based exercises
    } else {
      const load = exercise.isBodyweight
        ? bodyweightKg * (exercise.bodyweightLeverage ?? 1) + (s.weightKg ?? 0)
        : (s.weightKg ?? 0);
      e1rm = estimateE1rm(load, s.reps).e1rm;
      value = e1rm / bodyweightKg;
    }
    if (value > bestValue) {
      bestValue = value;
      bestSet = s;
      bestE1rm = e1rm;
      preferredReps = s.reps;
    }
  }
  if (!bestSet) return null;

  const rank = resolveRank(bestValue, thresholds);

  const previousRank = await findRankByExerciseId(db, exerciseId);

  // Ratchet-only peak snapshot (rank engine redesign R1) — fixes the bodyweight-ratio
  // regression bug: peak is locked in at the moment it's achieved and never recomputed
  // retroactively against today's bodyweight, so a legitimate bodyweight increase alone can
  // never erase a peak. `storedPeak` is null on the first recompute after the R1 migration (or
  // for a brand-new exercise), which `ratchetPeak` treats as "current always becomes peak."
  const storedPeak =
    previousRank?.peakTier != null &&
    previousRank.peakDivision != null &&
    previousRank.peakLp != null &&
    previousRank.peakE1rm != null &&
    previousRank.peakAchievedAt != null
      ? {
          tier: previousRank.peakTier,
          division: previousRank.peakDivision,
          lp: previousRank.peakLp,
          e1rm: previousRank.peakE1rm,
          achievedAt: previousRank.peakAchievedAt.getTime(),
        }
      : null;

  // Plausibility gate (rank engine v2): a badly-flagged session's sets are excluded from peak
  // advancement entirely, not just discounted — the peak ratchet is the one thing in this system
  // meant to be un-fakeable. PEAK_ELIGIBILITY_FLOOR intentionally matches the plausibility module's
  // own PLAUSIBILITY_FLOOR-adjacent low end; a session has to be quite badly flagged to lose peak
  // eligibility outright, since most flagged sessions should still discount rather than block.
  const PEAK_ELIGIBILITY_FLOOR = 0.3;
  const peakEligible = plausibilityMultiplier >= PEAK_ELIGIBILITY_FLOOR;

  // PR hard-block (engagement-audit-v3 Phase 3, decision 1): stricter than peak eligibility on
  // purpose. A PR is the single highest-trust, highest-stakes artifact this system produces — it
  // is a permanent, individually-displayed claim ("you hit X on this exact date"), not a
  // continuously-recomputable derived value the way `peak`/`currentBand` are. Peak eligibility is
  // deliberately forgiving (0.3 — only the most badly flagged sessions lose it) because most
  // flagged sessions should still discount rather than block; a PR gets zero credit at a much
  // milder degree of flagging instead of a discount, per the hybrid decision. With the tightened
  // plausibility.ts thresholds above, PR_ELIGIBILITY_FLOOR = 0.5 works out to roughly: a
  // same-session e1RM jump beyond ~58% over the stored peak, a whole-session pace at/under
  // ~10.5s/set, or (the ceiling check is a hard 0/1, not a gradient) exceeding the value ceiling
  // at all, which always zeroes PR eligibility outright. That leaves a normal
  // ~40-55% single-session breakthrough — the exact "short rest, good day" case the audit calls
  // out to protect — still eligible for a PR, while a session flagged enough to already be
  // trending toward the peak-eligibility floor loses PR credit well before it gets there.
  const PR_ELIGIBILITY_FLOOR = 0.5;
  const prEligible = plausibilityMultiplier >= PR_ELIGIBILITY_FLOOR;

  // `peak` is `null` only when a session is badly flagged AND there is no `storedPeak` yet (a
  // brand-new exercise's very first recompute). That combination must NOT establish a peak from
  // this session — the improbable-jump check can't even fire without a prior peak to compare
  // against, so the ceiling check is the only thing that could have caught an absurd first-ever
  // session, and its whole point is defeated if a fallback quietly seeds peak from the flagged
  // data anyway. A later, plausible session is the one that gets to establish it. When
  // `peakEligible` is true, `ratchetPeak` always returns non-null (it treats a null `storedPeak`
  // as "current always becomes peak"), so this is the only null case.
  const peak =
    peakEligible
      ? ratchetPeak(
          { tier: rank.tier, division: rank.division, lp: rank.lp, e1rm: bestE1rm },
          bestSet.loggedAt.getTime(),
          storedPeak,
        )
      : storedPeak;

  // A genuine rank-up (R2) is a *peak* advancing, not the displayed current band changing —
  // decay softening or reversing current must never register as a rank-up, only a real new
  // best. `rankedUp` was previously defined against the naive current value; redefining it
  // against peak also fixes a latent bug decay would otherwise introduce: without this, a
  // decay-reversal snap-back (current jumping from a softened band back up to an
  // already-known peak) would have looked like a fresh rank-up and logged a spurious event.
  // No peak at all (see above) means nothing to log a rank-up for.
  const rankedUp = peak != null && (!storedPeak || storedPeak.tier !== peak.tier || storedPeak.division !== peak.division);

  // Current-rank recovery (rank engine v2). Two paths, applied in sequence:
  //  1. Passive decay (unchanged pure day-based curve) always runs first, using the same
  //     daysSinceLastTrained this function already computes below.
  //  2. If this recompute was triggered by a session logged *today* (daysSinceLastTrained === 0 —
  //     true for every call from the finish-workout path, since it only touches exercises trained
  //     in that same session), a buffed recovery gain is applied on top of whatever was already
  //     climbed in prior sessions (the *previously stored* current band), not on top of the
  //     freshly-passively-decayed value — discounted by this session's plausibility multiplier.
  // `pnpm recompute`'s maintenance/rebuild path also calls this function and will also apply
  // path 2 whenever it happens to run on the same day an exercise was trained — an accepted,
  // precedented simplification (the peak ratchet already has the same "not fully re-derivable
  // from a single from-scratch pass" property, see spec §2.2).
  const lastTrainedAtMs = loggedSets.reduce((max, s) => Math.max(max, s.loggedAt.getTime()), 0);
  const daysSinceLastTrained = Math.floor((Date.now() - lastTrainedAtMs) / (24 * 60 * 60 * 1000));

  const previousCurrentBand = previousRank
    ? { tier: previousRank.tier, division: previousRank.division, lp: previousRank.lp }
    : null;

  let currentBand: { tier: (typeof rank)["tier"]; division: number; lp: number };
  if (peak == null) {
    // No established peak (flagged first-ever session, see above) — there's nothing to decay
    // from or recover toward yet, so show the plain freshly-resolved current value honestly
    // rather than fabricating a band around the flagged/blocked peak.
    currentBand = { tier: rank.tier, division: rank.division, lp: rank.lp };
  } else {
    // Passive decay always runs, even on a first-ever recompute (no `previousCurrentBand` yet) —
    // gating it on `previousCurrentBand` existing would let a long-untouched exercise's very first
    // computation show an undecayed peak, contradicting the "decays below peak once the exercise
    // hasn't been trained in a long time" behavior this same file already tests for on a fresh
    // exercise.
    const passivelyDecayedBand = computeCurrentBand(peak, daysSinceLastTrained);

    // Only throttle today's climb through the buffed recovery-gain path when there was a genuine
    // decay backlog going into *this* recompute — i.e. `previousCurrentBand` sat below the OLD
    // peak (`storedPeak`, before this call's `ratchetPeak` above possibly advanced it). Comparing
    // against `storedPeak` rather than the freshly-computed `peak` matters: a lifter who was fully
    // caught up (current == old peak) and then hits a genuine new PR in this same session must see
    // that PR reflected immediately — `previousCurrentBand` would sit far below the *new*, just-
    // advanced `peak`, which would otherwise look identical to "returning from a real decay gap"
    // and wrongly throttle a rank the lifter just legitimately earned.
    const storedPeakPos = storedPeak ? ordinal(storedPeak.tier, storedPeak.division) * 100 + storedPeak.lp : null;
    const hadDecayBacklog =
      previousCurrentBand != null &&
      storedPeakPos != null &&
      ordinal(previousCurrentBand.tier, previousCurrentBand.division) * 100 + previousCurrentBand.lp < storedPeakPos;

    if (hadDecayBacklog && previousCurrentBand && daysSinceLastTrained === 0) {
      const rawGainBand = applySessionRecoveryGain(peak, previousCurrentBand);
      const prevPos = ordinal(previousCurrentBand.tier, previousCurrentBand.division) * 100 + previousCurrentBand.lp;
      const rawGainPos = ordinal(rawGainBand.tier, rawGainBand.division) * 100 + rawGainBand.lp;
      const scaledPos = prevPos + (rawGainPos - prevPos) * plausibilityMultiplier;
      currentBand = scaledPositionToBand(scaledPos);
    } else {
      currentBand = passivelyDecayedBand;
    }
  }

  // Next-target predictions follow the *decayed* current band, not the freshly-resolved naive
  // value — a softened display would otherwise show a next target the lifter has technically
  // already cleared.
  const currentOrdinal = ordinal(currentBand.tier, currentBand.division);
  const decayedNextTarget = nextTargetAtOrdinal(thresholds, currentOrdinal);
  const nextTargetWeightKg =
    metric === "load_ratio" && decayedNextTarget
      ? nextLoadTarget(decayedNextTarget.threshold, bodyweightKg, preferredReps).weightKg
      : null;
  const nextTargetReps =
    metric === "load_ratio" && decayedNextTarget
      ? nextLoadTarget(decayedNextTarget.threshold, bodyweightKg, preferredReps).reps
      : metric === "reps"
        ? (decayedNextTarget?.threshold ?? null)
        : null;

  // Read-only history of this rank-up (engagement rework W8) — not a new reward mechanic, just
  // a log of the event `rankedUp` above already detects. Fires exactly once per genuine peak
  // tier/division change, never per set logged and never on a decay-only recompute (decay can
  // only move `currentBand`, which `rankedUp` no longer depends on).
  if (rankedUp && peak) {
    await insertRankEvent(db, {
      exerciseId,
      tier: peak.tier,
      division: peak.division,
      occurredAt: bestSet.loggedAt,
    });
  }

  await upsertRank(db, {
    exerciseId,
    tier: currentBand.tier,
    division: currentBand.division,
    lp: currentBand.lp,
    e1rm: bestE1rm,
    trust: rank.trust,
    nextTargetWeightKg,
    nextTargetReps,
    peakTier: peak?.tier ?? null,
    peakDivision: peak?.division ?? null,
    peakLp: peak?.lp ?? null,
    peakE1rm: peak?.e1rm ?? null,
    peakAchievedAt: peak ? new Date(peak.achievedAt) : null,
  });

  // PR detection: a new best e1RM (or, for rep-based exercises, a new best rep count) is a PR —
  // but only when this session clears PR_ELIGIBILITY_FLOOR above. A badly-flagged session cannot
  // produce a PR record at all, not merely a discounted one: `bestE1rm` itself is never
  // discounted (unlike XP/LP), so without this gate a fabricated or mis-entered set would still
  // write a permanent PR row even while its XP/LP contribution was heavily reduced.
  const prKind = metric === "reps" ? "reps" : "e1rm";
  const existingPr = await findBestPrByKind(db, exerciseId, prKind);
  let newPr: RecomputeResult["newPr"] = null;
  if (prEligible && (!existingPr || bestE1rm > existingPr.value)) {
    await insertPr(db, {
      exerciseId,
      kind: prKind,
      value: bestE1rm,
      setId: bestSet.id,
      achievedAt: bestSet.loggedAt,
    });
    newPr = { kind: prKind, value: bestE1rm };
  }

  return {
    rankedUp,
    newPr,
    tier: currentBand.tier,
    division: currentBand.division,
    lp: currentBand.lp,
    prevLp: previousRank?.lp ?? 0,
  };
}

export interface RankEventsByWeekday {
  /** JS `Date.getDay()`-indexed: 0 = Sunday ... 6 = Saturday, same convention as the client's
   *  existing `DAY_ABBR` table (useWorkoutFinish.ts) — kept identical so a future caller never
   *  has to remap between the two. */
  weekday: number;
  count: number;
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
  for (const r of rows) {
    counts[r.occurredAt.getDay()]!++;
  }
  return counts.map((count, weekday) => ({ weekday, count }));
}
