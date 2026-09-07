// useWorkoutShareCard.ts wraps ~client/lib/shareCard (canvas drawing + native share/clipboard),
// which already has its own dedicated tests (tests/client/lib/shareCard.test.ts) — mocked here so
// these tests exercise only this composable's own orchestration: building the card model from
// the finish flow's refs, the busy-flag bookkeeping, and each method's early-return guards. No
// lifecycle hooks/injections here, so no component host or jsdom is needed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { WorkoutCardTier, WorkoutCardTopRankUp } from "@liftr/shared";
import type { RankUpSummary } from "~client/components/workout/FinishSequence.vue";
import type { FinishedSummary } from "~client/composables/useWorkoutFinish";

// vi.hoisted() (not a plain `const xMock = vi.fn()`) so these are initialized before the
// vi.mock() factory below runs — see the comment in useStartRoutine.test.ts for why a factory
// that reads a variable as a direct property value needs this.
const { drawWorkoutCardMock, canvasToBlobMock, copyBlobToClipboardMock, shareOrDownloadBlobMock } = vi.hoisted(() => ({
  drawWorkoutCardMock: vi.fn().mockResolvedValue(undefined),
  canvasToBlobMock: vi.fn(),
  copyBlobToClipboardMock: vi.fn(),
  shareOrDownloadBlobMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~client/lib/shareCard", () => ({
  drawWorkoutCard: drawWorkoutCardMock,
  canvasToBlob: canvasToBlobMock,
  copyBlobToClipboard: copyBlobToClipboardMock,
  shareOrDownloadBlob: shareOrDownloadBlobMock,
}));

import { useWorkoutShareCard } from "~client/composables/useWorkoutShareCard";

const summary: FinishedSummary = {
  routineName: "Push Day",
  durationLabel: "45 min",
  volumeKg: 3200,
  setCount: 12,
  muscles: { primary: ["chest"], secondary: ["triceps"] },
  exercises: [{ name: "Bench Press", sets: [{ weightKg: 100, reps: 5, isWarmup: false }] }],
};

const rankUps: RankUpSummary[] = [
  { exerciseName: "Bench Press", tier: "gold", division: 2, isPr: true, lp: 120, prevLp: 100, plausibilityNote: null },
  { exerciseName: "Squat", tier: "silver", division: 1, isPr: false, lp: 80, prevLp: 70, plausibilityNote: null },
];

// drawWorkoutCard/canvasToBlob are both mocked above, so the composable never actually touches
// this as a real canvas — a bare object stands in fine and keeps this file off jsdom.
function makeCanvas(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

beforeEach(() => {
  drawWorkoutCardMock.mockClear().mockResolvedValue(undefined);
  canvasToBlobMock.mockReset();
  copyBlobToClipboardMock.mockReset();
  shareOrDownloadBlobMock.mockClear().mockResolvedValue(undefined);
});

describe("shareFinished", () => {
  it("does nothing when there's no finished summary yet", async () => {
    const finishedSummary = ref<FinishedSummary | null>(null);
    const { finishedCanvas, sharingFinished, shareFinished } = useWorkoutShareCard(
      finishedSummary,
      ref(rankUps),
      ref(null),
      ref(null),
    );
    finishedCanvas.value = makeCanvas();

    await shareFinished();

    expect(drawWorkoutCardMock).not.toHaveBeenCalled();
    expect(sharingFinished.value).toBe(false);
  });

  it("does nothing when the canvas ref isn't mounted yet", async () => {
    const { sharingFinished, shareFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));

    await shareFinished();

    expect(drawWorkoutCardMock).not.toHaveBeenCalled();
    expect(sharingFinished.value).toBe(false);
  });

  it("draws the card, converts it to a blob, and hands it to shareOrDownloadBlob", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    canvasToBlobMock.mockResolvedValue(blob);
    const tier: WorkoutCardTier = { tier: "gold", division: 2, level: 14 };
    const topRankUp: WorkoutCardTopRankUp = { exerciseName: "Bench Press", tier: "gold", division: 2, isPr: true };
    const canvas = makeCanvas();

    const { finishedCanvas, shareFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(tier), ref(topRankUp));
    finishedCanvas.value = canvas;

    await shareFinished();

    expect(drawWorkoutCardMock).toHaveBeenCalledWith(canvas, {
      kind: "workout",
      routineName: "Push Day",
      dateLabel: expect.any(String),
      durationLabel: "45 min",
      volumeKg: 3200,
      setCount: 12,
      prCount: 1, // only the isPr: true entry counts
      exercises: summary.exercises,
      muscles: summary.muscles,
      tier,
      topRankUp,
    });
    expect(canvasToBlobMock).toHaveBeenCalledWith(canvas);
    expect(shareOrDownloadBlobMock).toHaveBeenCalledWith(blob, "liftr-workout.png", "Mein Liftr-Workout");
  });

  it("skips shareOrDownloadBlob when the canvas can't produce a blob", async () => {
    canvasToBlobMock.mockResolvedValue(null);
    const { finishedCanvas, shareFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));
    finishedCanvas.value = makeCanvas();

    await shareFinished();

    expect(shareOrDownloadBlobMock).not.toHaveBeenCalled();
  });

  it("toggles sharingFinished true for the duration of the call and resets it even on failure", async () => {
    let rejectDraw!: (e: unknown) => void;
    drawWorkoutCardMock.mockReturnValue(new Promise((_resolve, reject) => (rejectDraw = reject)));
    const { finishedCanvas, sharingFinished, shareFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));
    finishedCanvas.value = makeCanvas();

    const p = shareFinished();
    expect(sharingFinished.value).toBe(true);

    rejectDraw(new Error("canvas boom"));
    await expect(p).rejects.toThrow("canvas boom");
    expect(sharingFinished.value).toBe(false);
  });
});

describe("copyFinished", () => {
  it("returns false without drawing anything when there's no finished summary", async () => {
    const { finishedCanvas, copyFinished } = useWorkoutShareCard(ref(null), ref(rankUps), ref(null), ref(null));
    finishedCanvas.value = makeCanvas();

    await expect(copyFinished()).resolves.toBe(false);
    expect(drawWorkoutCardMock).not.toHaveBeenCalled();
  });

  it("returns false without drawing anything when the canvas ref isn't mounted", async () => {
    const { copyFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));

    await expect(copyFinished()).resolves.toBe(false);
    expect(drawWorkoutCardMock).not.toHaveBeenCalled();
  });

  it("draws the card and forwards the resulting blob to copyBlobToClipboard, returning its result", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    canvasToBlobMock.mockResolvedValue(blob);
    copyBlobToClipboardMock.mockResolvedValue(true);
    const canvas = makeCanvas();
    const { finishedCanvas, copyFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));
    finishedCanvas.value = canvas;

    await expect(copyFinished()).resolves.toBe(true);

    expect(drawWorkoutCardMock).toHaveBeenCalledWith(canvas, expect.objectContaining({ routineName: "Push Day" }));
    expect(copyBlobToClipboardMock).toHaveBeenCalledWith(blob);
  });

  it("returns false without calling copyBlobToClipboard when the canvas can't produce a blob", async () => {
    canvasToBlobMock.mockResolvedValue(null);
    const { finishedCanvas, copyFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));
    finishedCanvas.value = makeCanvas();

    await expect(copyFinished()).resolves.toBe(false);
    expect(copyBlobToClipboardMock).not.toHaveBeenCalled();
  });

  it("toggles copyingFinished true for the duration of the call and resets it even on failure", async () => {
    let rejectDraw!: (e: unknown) => void;
    drawWorkoutCardMock.mockReturnValue(new Promise((_resolve, reject) => (rejectDraw = reject)));
    const { finishedCanvas, copyingFinished, copyFinished } = useWorkoutShareCard(ref(summary), ref(rankUps), ref(null), ref(null));
    finishedCanvas.value = makeCanvas();

    const p = copyFinished();
    expect(copyingFinished.value).toBe(true);

    rejectDraw(new Error("canvas boom"));
    await expect(p).rejects.toThrow("canvas boom");
    expect(copyingFinished.value).toBe(false);
  });
});
