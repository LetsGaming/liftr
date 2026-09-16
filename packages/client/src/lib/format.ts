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
