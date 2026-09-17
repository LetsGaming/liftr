/** `m:ss`, e.g. 95 -> "1:35". Was reimplemented separately in RestTimer.vue, ArrangeStep.vue,
 *  and RunDetail.vue's pace formatter. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** German long date, e.g. "16. September 2026". Was reimplemented separately in
 *  ExerciseHistoryList.vue, RunDetail.vue, WorkoutDetail.vue, and useWorkoutShareCard.ts. */
export function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

/** `m:ss`, rolling over to `h:mm:ss` once it crosses an hour (race/run durations can). Was
 *  reimplemented separately in RecordsPage.vue's formatRaceTime and LiveRunScreen.vue's
 *  fmtDuration. */
export function formatClockLong(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  if (hours <= 0) return formatClock(total);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Pace (seconds/km) as `mm:ss/km`, or an em dash when unknown. Was reimplemented separately in
 *  RunDetail.vue, LiveRunScreen.vue, and RunReplay.vue. */
export function formatPace(sPerKm: number | null): string {
  if (sPerKm == null) return "–";
  return `${formatClock(Math.round(sPerKm))}/km`;
}

/** Duration rounded to the nearest whole minute, e.g. "42 min". Was reimplemented separately in
 *  RunDetail.vue, WorkoutDetail.vue, and useWorkoutFinish.ts. */
export function formatDurationMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}
