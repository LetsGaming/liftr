/**
 * rAF number roll-up (engagement rework W1). Used by every stat that appears as a reward
 * (session XP, level bar, streak count) so the number visibly climbs instead of snapping —
 * a snap reads as "just a label," a roll-up reads as "you earned this." Under
 * prefers-reduced-motion, jumps straight to the target value.
 */
import { onBeforeUnmount, ref, watch, type Ref } from "vue";

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCountUp(target: Ref<number>, durationMs = 600) {
  const value = ref(target.value);
  let frame: number | null = null;

  function cancel() {
    if (frame != null) cancelAnimationFrame(frame);
    frame = null;
  }

  function animateTo(to: number) {
    cancel();
    const from = value.value;
    if (prefersReducedMotion() || from === to) {
      value.value = to;
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — fast start, settles gently, matches --ease-out's intent in JS form
      const eased = 1 - Math.pow(1 - t, 3);
      value.value = from + (to - from) * eased;
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        value.value = to;
        frame = null;
      }
    };
    frame = requestAnimationFrame(step);
  }

  watch(target, (to) => animateTo(to));
  onBeforeUnmount(cancel);

  return { value };
}
