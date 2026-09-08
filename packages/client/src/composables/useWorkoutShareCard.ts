/**
 * "Als Bild teilen" on the post-finish summary — renders the session onto a canvas and shares
 * or downloads it. Extracted out of WorkoutPage.vue. Takes the finish flow's own refs
 * (from useWorkoutFinish) rather than re-deriving them, so the two composables share one source
 * of truth for what a session earned.
 */
import { ref, type Ref } from "vue";
import type { WorkoutCardModel, WorkoutCardTier, WorkoutCardTopRankUp } from "@liftr/shared";
import { canvasToBlob, copyBlobToClipboard, drawWorkoutCard, shareOrDownloadBlob } from "../lib/shareCard";
import type { RankUpSummary } from "../components/workout/FinishSequence.vue";
import type { FinishedSummary } from "./useWorkoutFinish";

/**
 * The full rank-up list is deliberately never passed through wholesale for shares — it isn't
 * important for a share card and the PRs stat already carries that info. Two narrower,
 * deliberately different things are included instead: the current overall tier badge (a
 * persistent identity, not a per-session list) and, if
 * one exists, just the single highest rank-up this session — the same "one headline, not a
 * repeat of the in-app beat" reduction WorkoutPage.vue's own `topRankUp` already uses for its
 * terminal-frame recap, reused here rather than re-derived.
 */
function buildCardModel(
  s: FinishedSummary,
  sessionRankUps: RankUpSummary[],
  tier: WorkoutCardTier | null,
  topRankUp: WorkoutCardTopRankUp | null,
): WorkoutCardModel {
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
    tier,
    topRankUp,
  };
}

export function useWorkoutShareCard(
  finishedSummary: Ref<FinishedSummary | null>,
  sessionRankUps: Ref<RankUpSummary[]>,
  tier: Ref<WorkoutCardTier | null>,
  topRankUp: Ref<WorkoutCardTopRankUp | null>,
) {
  const finishedCanvas = ref<HTMLCanvasElement | null>(null);
  const sharingFinished = ref(false);
  const copyingFinished = ref(false);

  async function shareFinished() {
    const s = finishedSummary.value;
    if (!s || !finishedCanvas.value) return;
    sharingFinished.value = true;
    try {
      await drawWorkoutCard(finishedCanvas.value, buildCardModel(s, sessionRankUps.value, tier.value, topRankUp.value));
      const blob = await canvasToBlob(finishedCanvas.value);
      if (blob) await shareOrDownloadBlob(blob, "liftr-workout.png", "Mein Liftr-Workout");
    } finally {
      sharingFinished.value = false;
    }
  }

  /** "In Zwischenablage kopieren" — the share flow never had a copy option before this. Returns
   *  whether the copy actually succeeded so the caller can show the right toast. */
  async function copyFinished(): Promise<boolean> {
    const s = finishedSummary.value;
    if (!s || !finishedCanvas.value) return false;
    copyingFinished.value = true;
    try {
      await drawWorkoutCard(finishedCanvas.value, buildCardModel(s, sessionRankUps.value, tier.value, topRankUp.value));
      const blob = await canvasToBlob(finishedCanvas.value);
      return blob ? await copyBlobToClipboard(blob) : false;
    } finally {
      copyingFinished.value = false;
    }
  }

  return { finishedCanvas, sharingFinished, shareFinished, copyingFinished, copyFinished };
}
