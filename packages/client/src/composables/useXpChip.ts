/**
 * Floating "+N XP" chip shown right on the log-set button (engagement rework W3) — extracted
 * out of WorkoutPage.vue (QUAL-03). Purely a feel-good echo of the same number the server will
 * independently add to the real total; never authoritative.
 */
import { ref } from "vue";

/** Matches the .xp-chip animation's 1600ms duration (WorkoutPage.vue's <style>) so the chip
 *  stays mounted for the whole float-and-fade instead of getting yanked mid-animation. */
const CHIP_LIFETIME_MS = 1600;

export function useXpChip() {
  const xpChip = ref<{ key: number; amount: number } | null>(null);
  let seq = 0;

  function trigger(amount: number) {
    seq += 1;
    const key = seq;
    xpChip.value = { key, amount };
    setTimeout(() => {
      if (xpChip.value?.key === key) xpChip.value = null;
    }, CHIP_LIFETIME_MS);
  }

  return { xpChip, trigger };
}
