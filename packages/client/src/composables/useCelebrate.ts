/**
 * Timed "beat" sequencer (engagement rework W1). Used by FinishSequence's three beats
 * (Rangaufstiege / Serie / Fortschritt). Deliberately a plain
 * async step-runner, not an animation library — each beat is just "show this, wait, allow an
 * early tap to skip." Respects prefers-reduced-motion by collapsing every wait to effectively
 * zero (the content still renders, in order, just without the held pause).
 */

/**
 * Haptic wiring is the CALLER's responsibility, not this composable's — this file stays
 * UI/feedback-agnostic. The existing pattern (components/workout/FinishSequence.vue: a `watch`
 * on `activeIndex` that fires `haptics.success()` only when `leveledUp` is true) is the reference
 * implementation later workstreams should copy: watch `activeIndex`, branch on which beat it is
 * and what that beat's data actually contains, call the matching lib/haptics.ts tier from there.
 */
import { ref } from "vue";

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Resolves after `ms`, or immediately if `skip` fires first — so a tap always short-circuits
 *  a beat instead of forcing the user to sit through it. */
function wait(ms: number, skip: { requested: boolean }): Promise<void> {
  const effectiveMs = prefersReducedMotion() ? 0 : ms;
  return new Promise((resolve) => {
    if (effectiveMs <= 0) {
      resolve();
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (skip.requested || Date.now() - start >= effectiveMs) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

export interface CelebrateBeat {
  /** Skips this beat entirely — used to omit e.g. "Rangaufstiege" when a session had none,
   *  rather than showing an empty beat (the plan explicitly says: don't manufacture a reward). */
  show?: boolean;
  holdMs?: number;
}

export function useCelebrate() {
  const activeIndex = ref(-1);
  const running = ref(false);
  const skipFlag = { requested: false };

  function skip() {
    skipFlag.requested = true;
  }

  async function run(beats: CelebrateBeat[]) {
    running.value = true;
    activeIndex.value = -1;
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i]!;
      if (beat.show === false) continue;
      skipFlag.requested = false;
      activeIndex.value = i;
      await wait(beat.holdMs ?? 1400, skipFlag);
    }
    activeIndex.value = -1;
    running.value = false;
  }

  return { activeIndex, running, run, skip };
}
