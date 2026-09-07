// @vitest-environment jsdom
//
// useDragReorder is built directly on native Pointer Events / window listeners / element
// geometry — real DOM APIs, so this needs jsdom. jsdom doesn't implement
// Element.setPointerCapture (stubbed per element below) or a real layout engine (rect stubbed
// per element too). onPointerMove/onPointerUp are internal closures registered as window
// listeners rather than returned values, so they're exercised the same way the real browser
// would drive them: dispatching pointer events on window.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDragReorder } from "~client/composables/useDragReorder";

const CARD_HEIGHT = 92;
const ITEM_HEIGHT = CARD_HEIGHT + 8; // + the list's row gap, per useDragReorder.ts

function makeCard(): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ height: CARD_HEIGHT, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  (el as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
  return el;
}

function pointerDownEvent(cardEl: HTMLElement, clientY: number, pointerId = 1): PointerEvent {
  return { clientY, pointerId, currentTarget: cardEl } as unknown as PointerEvent;
}

function dispatchPointerMove(clientY: number, pointerId = 1) {
  const evt = new MouseEvent("pointermove") as unknown as { clientY: number; pointerId: number };
  Object.defineProperty(evt, "clientY", { value: clientY });
  Object.defineProperty(evt, "pointerId", { value: pointerId });
  window.dispatchEvent(evt as unknown as Event);
}

function dispatchPointerUp() {
  window.dispatchEvent(new MouseEvent("pointerup"));
}

afterEach(() => {
  // onPointerDown always registers window listeners; a test that doesn't reach onPointerUp
  // (e.g. asserts mid-drag) would otherwise leak them into the next test.
  dispatchPointerUp();
});

describe("useDragReorder", () => {
  it("starts with nothing being dragged and a no-op style for every card", () => {
    const { draggingIndex, styleFor } = useDragReorder(vi.fn());

    expect(draggingIndex.value).toBeNull();
    expect(styleFor(0)).toEqual({});
    expect(styleFor(3)).toEqual({});
  });

  it("onPointerDown arms the drag, capturing the pointer on the card element", () => {
    const { draggingIndex, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();

    onPointerDown(pointerDownEvent(card, 100), 1, 4, card);

    expect(draggingIndex.value).toBe(1);
    expect(card.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("styleFor the dragged card follows the pointer via translateY while it's below its start position", () => {
    const { styleFor, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 100), 1, 4, card);

    dispatchPointerMove(150); // +50px down

    expect(styleFor(1)).toMatchObject({ transform: "translateY(50px)", zIndex: "5", transition: "none" });
  });

  it("shifts cards between the drag's origin and its live target out of the way by one card-height", () => {
    const { styleFor, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 0), 0, 4, card); // start dragging card 0

    dispatchPointerMove(ITEM_HEIGHT * 2 + 10); // drag down past 2 full card-heights -> target index 2

    expect(styleFor(1)).toEqual({ transform: `translateY(${-ITEM_HEIGHT}px)` });
    expect(styleFor(2)).toEqual({ transform: `translateY(${-ITEM_HEIGHT}px)` });
    expect(styleFor(3)).toEqual({}); // beyond the target, not shifted
    expect(styleFor(0)).toMatchObject({ zIndex: "5" }); // the dragged card itself
  });

  it("shifts cards the other direction when dragging upward past the origin", () => {
    const { styleFor, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 0), 3, 4, card); // start dragging card 3

    dispatchPointerMove(-(ITEM_HEIGHT * 2 + 10)); // drag up past 2 full card-heights -> target index 1

    expect(styleFor(1)).toEqual({ transform: `translateY(${ITEM_HEIGHT}px)` });
    expect(styleFor(2)).toEqual({ transform: `translateY(${ITEM_HEIGHT}px)` });
    expect(styleFor(0)).toEqual({}); // beyond the target, not shifted
  });

  it("clamps the live target index to the list's bounds", () => {
    const { styleFor, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 0), 0, 3, card); // 3-item list

    dispatchPointerMove(ITEM_HEIGHT * 50); // wildly past the end of the list

    // clamped to the last index (2): everything from 1..2 shifts up, nothing beyond exists
    expect(styleFor(1)).toEqual({ transform: `translateY(${-ITEM_HEIGHT}px)` });
    expect(styleFor(2)).toEqual({ transform: `translateY(${-ITEM_HEIGHT}px)` });
  });

  it("ignores pointermove events from a different pointer than the one that started the drag", () => {
    const { styleFor, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 0, 1), 0, 4, card); // pointerId 1 starts the drag

    dispatchPointerMove(ITEM_HEIGHT * 2, 999); // a different pointer moving

    expect(styleFor(0)).toMatchObject({ transform: "translateY(0px)" }); // unaffected — still at origin
  });

  it("onPointerUp commits the reorder when the target slot differs from the origin", () => {
    const onReorder = vi.fn();
    const { onPointerDown } = useDragReorder(onReorder);
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 0), 1, 4, card);
    dispatchPointerMove(ITEM_HEIGHT * 2); // moves target from 1 to 3

    dispatchPointerUp();

    expect(onReorder).toHaveBeenCalledWith(1, 3);
  });

  it("onPointerUp does not call onReorder when the card was dropped back on its own slot", () => {
    const onReorder = vi.fn();
    const { onPointerDown } = useDragReorder(onReorder);
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 100), 1, 4, card);
    dispatchPointerMove(101); // negligible movement, rounds back to the same index

    dispatchPointerUp();

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("onPointerUp resets drag state so a subsequent styleFor call is a no-op again", () => {
    const { draggingIndex, styleFor, onPointerDown } = useDragReorder(vi.fn());
    const card = makeCard();
    onPointerDown(pointerDownEvent(card, 0), 1, 4, card);
    dispatchPointerMove(ITEM_HEIGHT);

    dispatchPointerUp();

    expect(draggingIndex.value).toBeNull();
    expect(styleFor(1)).toEqual({});
    expect(styleFor(2)).toEqual({});
  });

  it("a second, independent drag after finishing the first works normally (listeners were cleaned up)", () => {
    const onReorder = vi.fn();
    const { draggingIndex, onPointerDown } = useDragReorder(onReorder);
    const cardA = makeCard();
    onPointerDown(pointerDownEvent(cardA, 0), 0, 4, cardA);
    dispatchPointerMove(ITEM_HEIGHT);
    dispatchPointerUp();
    expect(onReorder).toHaveBeenCalledTimes(1);

    const cardB = makeCard();
    onPointerDown(pointerDownEvent(cardB, 0), 2, 4, cardB);
    expect(draggingIndex.value).toBe(2);
    dispatchPointerMove(ITEM_HEIGHT * 2); // clamps to last index (3)
    dispatchPointerUp();

    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(onReorder).toHaveBeenLastCalledWith(2, 3);
  });
});
