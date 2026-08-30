/**
 * Bodyweight trend (plan Phase 6.7): the mockup's "52,5 kg · stabil · 30 Tage" tile. An
 * exponential moving average smooths day-to-day water-weight noise; the trend direction
 * compares the current EMA against the EMA from ~`windowDays` ago, with a small dead zone so
 * normal fluctuation doesn't flip the label between "steigend"/"fallend" every other weigh-in.
 */
export interface BodyweightPoint {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export type BodyweightTrendDirection = "up" | "down" | "stable";

export interface BodyweightTrend {
  emaKg: number;
  trend: BodyweightTrendDirection;
  /** actual days spanned by the comparison — may be less than the requested window if the log is younger than that. */
  daysSpan: number;
}

const EMA_ALPHA = 0.2;
const STABLE_THRESHOLD_KG = 0.3;

/** `entries` in any order; only `date` + `weightKg` are read. Returns null with no entries. */
export function computeBodyweightTrend(entries: BodyweightPoint[], windowDays = 30): BodyweightTrend | null {
  if (entries.length === 0) return null;

  const asc = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let ema = asc[0]!.weightKg;
  const series: { date: string; ema: number }[] = [{ date: asc[0]!.date, ema }];
  for (let i = 1; i < asc.length; i++) {
    ema = EMA_ALPHA * asc[i]!.weightKg + (1 - EMA_ALPHA) * ema;
    series.push({ date: asc[i]!.date, ema });
  }

  const latest = series[series.length - 1]!;
  const latestMs = new Date(latest.date).getTime();
  const cutoffMs = latestMs - windowDays * 86_400_000;
  const past = series.find((s) => new Date(s.date).getTime() >= cutoffMs) ?? series[0]!;

  const delta = latest.ema - past.ema;
  const trend: BodyweightTrendDirection = Math.abs(delta) < STABLE_THRESHOLD_KG ? "stable" : delta > 0 ? "up" : "down";
  const daysSpan = Math.round((latestMs - new Date(past.date).getTime()) / 86_400_000);

  return { emaKg: latest.ema, trend, daysSpan };
}
