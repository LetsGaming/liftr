/**
 * Periodization / mesocycle builder (plan §6.8). Deliberately the simplest structure that's
 * still a real mesocycle: attach a fixed-length week-by-week intensity curve to a routine, with
 * a built-in deload on the final week — no hand-entered percentages per week (that would be
 * exactly the kind of planning-desk friction the routine builder already avoids elsewhere).
 * "Purely additive": a routine with no mesocycle attached behaves exactly as it always has.
 */

/** +5%/week ramp, deloading to 60% on the final week. A single-week cycle is just 100%. */
export function generateMesocycleWeekPercents(totalWeeks: number): number[] {
  if (totalWeeks <= 1) return [100];
  const percents: number[] = [];
  for (let w = 0; w < totalWeeks - 1; w++) percents.push(100 + w * 5);
  percents.push(60);
  return percents;
}

/** Suggests this week's working weight from last time's, rounded to the stepper increment. */
export function applyMesocycleWeek(lastTimeWeightKg: number | null, weekPercent: number, roundToKg = 1.25): number | null {
  if (lastTimeWeightKg == null) return null;
  const raw = lastTimeWeightKg * (weekPercent / 100);
  return Math.round(raw / roundToKg) * roundToKg;
}
