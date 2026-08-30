/**
 * Warm-up ramp calculator (plan Phase 6.3): 40/60/80% x 5/3/2 of the working weight, rounded
 * to the client's stepper increment. Steps that would round to the bar weight or below are
 * dropped — a "warm-up" at empty-bar-or-lighter isn't a meaningful set, it's noise.
 */
import { DEFAULT_BAR_WEIGHT_KG } from "./plates.js";

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

const RAMP: { pct: number; reps: number }[] = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 2 },
];

export function warmupRamp(
  workingWeightKg: number,
  barWeightKg: number = DEFAULT_BAR_WEIGHT_KG,
  roundToKg: number = 1.25,
): WarmupSet[] {
  const sets: WarmupSet[] = [];
  for (const step of RAMP) {
    const raw = workingWeightKg * step.pct;
    if (raw <= barWeightKg + roundToKg) continue;
    const rounded = Math.max(barWeightKg, Math.round(raw / roundToKg) * roundToKg);
    sets.push({ weightKg: rounded, reps: step.reps });
  }
  return sets;
}
