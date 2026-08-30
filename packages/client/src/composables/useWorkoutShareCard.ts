/**
 * "Als Bild teilen" on the post-finish summary — renders the session onto a canvas and shares
 * or downloads it. Extracted out of WorkoutPage.vue (QUAL-03). Takes the finish flow's own refs
 * (from useWorkoutFinish) rather than re-deriving them, so the two composables share one source
 * of truth for what a session earned.
 */
import { ref, type Ref } from "vue";
import type { WorkoutCardModel } from "@liftr/shared";
import { canvasToBlob, copyBlobToClipboard, drawWorkoutCard, shareOrDownloadBlob } from "../lib/shareCard";
import type { RankUpSummary } from "../components/workout/FinishSequence.vue";
import type { FinishedSummary } from "./useWorkoutFinish";

/** Feedback: "the rankups should be stripped completely, not important for shares — the PRs
 *  stat already carries that info." Rank-ups still drive the in-app FinishSequence celebration
 *  (unrelated, untouched); only the exported image dropped them, in favor of just prCount. */
function buildCardModel(s: FinishedSummary, sessionRankUps: RankUpSummary[]): WorkoutCardModel {
  return {
    kind: "workout",
    routineName: s.routineName,
    dateLabel: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
    durationLabel: s.durationLabel,
    volumeKg: s.volumeKg,
    setCount: s.setCount,
    prCount: sessionRankUps.filter((r) => r.isPr).length,
    exercises: s.exercises,
    muscles: s.muscles,
  };
}

export function useWorkoutShareCard(finishedSummary: Ref<FinishedSummary | null>, sessionRankUps: Ref<RankUpSummary[]>) {
  const finishedCanvas = ref<HTMLCanvasElement | null>(null);
  const sharingFinished = ref(false);
  const copyingFinished = ref(false);

  async function shareFinished() {
    const s = finishedSummary.value;
    if (!s || !finishedCanvas.value) return;
    sharingFinished.value = true;
    try {
      await drawWorkoutCard(finishedCanvas.value, buildCardModel(s, sessionRankUps.value));
      const blob = await canvasToBlob(finishedCanvas.value);
      if (blob) await shareOrDownloadBlob(blob, "liftr-workout.png", "Mein Liftr-Workout");
    } finally {
      sharingFinished.value = false;
    }
  }

  /** "In Zwischenablage kopieren" — the share flow never had a copy option (feedback: "copying
   *  also does not work correctly" — there wasn't one to work in the first place). Returns
   *  whether the copy actually succeeded so the caller can show the right toast. */
  async function copyFinished(): Promise<boolean> {
    const s = finishedSummary.value;
    if (!s || !finishedCanvas.value) return false;
    copyingFinished.value = true;
    try {
      await drawWorkoutCard(finishedCanvas.value, buildCardModel(s, sessionRankUps.value));
      const blob = await canvasToBlob(finishedCanvas.value);
      return blob ? await copyBlobToClipboard(blob) : false;
    } finally {
      copyingFinished.value = false;
    }
  }

  return { finishedCanvas, sharingFinished, shareFinished, copyingFinished, copyFinished };
}
