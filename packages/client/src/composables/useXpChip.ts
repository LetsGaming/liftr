/**
 * Floating "+N XP" chip shown right on the log-set button (engagement rework W3) — extracted
 * out of WorkoutPage.vue (QUAL-03). Purely a feel-good echo of the same number the server will
 * independently add to the real total; never authoritative.
 */
import { ref } from "vue";

/** Matches the .xp-chip animation's 1600ms duration (WorkoutPage.vue's <style>) so the chip
 *  stays mounted for the whole float-and-fade instead of getting yanked mid-animation. */
const CHIP_LIFETIME_MS = 1600;

/** Motion audit fix (Phase 4): the 1600ms literal above bypasses motion.css's token collapse
 *  (it isn't a --dur-* var), which is exactly why WorkoutPage.vue's own
 *  `@media (prefers-reduced-motion: reduce)` block has to override `.xp-chip` explicitly —
 *  under that override the chip renders statically at full opacity instead of floating. This
 *  JS-side timer had no matching branch, so a reduced-motion user still sat looking at a static
 *  "+N XP" chip for the full float-and-fade duration meant for the animated version. Shorter,
 *  fixed lifetime for the static case — still long enough to read the number. */
const CHIP_LIFETIME_MS_REDUCED = 900;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useXpChip() {
  const xpChip = ref<{ key: number; amount: number } | null>(null);
  let seq = 0;

  function trigger(amount: number) {
    seq += 1;
    const key = seq;
    xpChip.value = { key, amount };
    const lifetime = prefersReducedMotion() ? CHIP_LIFETIME_MS_REDUCED : CHIP_LIFETIME_MS;
    setTimeout(() => {
      if (xpChip.value?.key === key) xpChip.value = null;
    }, lifetime);
  }

  return { xpChip, trigger };
}
