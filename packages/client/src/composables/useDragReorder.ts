import { ref } from "vue";

/**
 * Minimal drag-to-reorder for one vertical list, built on native Pointer Events — no external
 * dependency for a single, scoped interaction (the routine wizard's exercise cards). Not a
 * general-purpose drag library: one list, vertical only, no cross-list drop.
 *
 * Model: while dragging, the dragged card gets `transform: translateY()` following the pointer
 * 1:1 (no jumps), and any cards between its original slot and the live target slot shift by one
 * card-height to visually "make room" (the standard reorder-preview pattern). The underlying
 * array is only actually mutated once, in `onPointerUp`, via the caller's `onReorder(from, to)`
 * — never mid-drag — so there's nothing to keep in sync between a live array splice and a
 * still-animating pointer position.
 *
 * Card height is measured from the dragged card itself at drag-start and used as the shift
 * unit for every other card. This is an approximation when list items have very different
 * heights (e.g. a 1-set vs. a 5-set exercise card) — the target-index math can be slightly off
 * near a boundary in that case. Accepted trade-off: correct in the common case (similar-height
 * cards), and the final drop position is still whatever the user visually lands on, since the
 * target index is continuously recomputed from live pointer position, not committed early.
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const draggingIndex = ref<number | null>(null);
  const targetIndex = ref<number | null>(null);
  const dragOffsetY = ref(0);

  let startY = 0;
  let itemHeight = 0;
  let count = 0;
  let pointerId: number | null = null;

  function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
  }

  function onPointerDown(e: PointerEvent, index: number, listLength: number, cardEl: HTMLElement) {
    draggingIndex.value = index;
    targetIndex.value = index;
    dragOffsetY.value = 0;
    startY = e.clientY;
    itemHeight = cardEl.getBoundingClientRect().height + 8; // + the list's row gap
    count = listLength;
    pointerId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (draggingIndex.value === null || e.pointerId !== pointerId) return;
    dragOffsetY.value = e.clientY - startY;
    const raw = draggingIndex.value + Math.round(dragOffsetY.value / itemHeight);
    targetIndex.value = clamp(raw, 0, count - 1);
  }

  function onPointerUp() {
    if (draggingIndex.value !== null && targetIndex.value !== null && targetIndex.value !== draggingIndex.value) {
      onReorder(draggingIndex.value, targetIndex.value);
    }
    draggingIndex.value = null;
    targetIndex.value = null;
    dragOffsetY.value = 0;
    pointerId = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  /** Per-card inline style: the dragged card follows the pointer; cards it's currently
   *  crossing over shift out of the way by one card-height. */
  function styleFor(index: number): Record<string, string> {
    if (draggingIndex.value === null || targetIndex.value === null) return {};
    if (index === draggingIndex.value) {
      return { transform: `translateY(${dragOffsetY.value}px)`, zIndex: "5", transition: "none" };
    }
    const from = draggingIndex.value;
    const to = targetIndex.value;
    if (from < to && index > from && index <= to) return { transform: `translateY(${-itemHeight}px)` };
    if (from > to && index >= to && index < from) return { transform: `translateY(${itemHeight}px)` };
    return {};
  }

  return { draggingIndex, onPointerDown, styleFor };
}
