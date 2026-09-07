// @vitest-environment jsdom
//
// useRoutineManagement.ts registers real document click/keydown listeners and cleans them up in
// onUnmounted, so it needs a real component instance (withSetup) and a real DOM (jsdom) — see
// tests/README.md's Environment section and tests/client/helpers/withSetup.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withSetup } from "../helpers/withSetup";
import { useRoutineManagement } from "~client/composables/useRoutineManagement";
import type { useRoutineStore, Routine } from "~client/stores/routineStore";

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    name: "Push Day",
    orderIndex: 0,
    routineExercises: [],
    mesocycle: null,
    ...overrides,
  };
}

function makeStore() {
  return {
    remove: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useRoutineStore>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRoutineManagement", () => {
  it("starts with no open menu, no editing routine, and the builder closed", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));

    expect(result.openMenuId.value).toBeNull();
    expect(result.editingRoutine.value).toBeNull();
    expect(result.showBuilder.value).toBe(false);

    unmount();
  });

  it("toggleMenu opens a routine's menu, and toggling the same id again closes it", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));

    result.toggleMenu("routine-1");
    expect(result.openMenuId.value).toBe("routine-1");

    result.toggleMenu("routine-1");
    expect(result.openMenuId.value).toBeNull();

    unmount();
  });

  it("toggleMenu switches directly to a different routine's menu", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));

    result.toggleMenu("routine-1");
    result.toggleMenu("routine-2");
    expect(result.openMenuId.value).toBe("routine-2");

    unmount();
  });

  it("closes the open menu on an outside document click", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(result.openMenuId.value).toBeNull();

    document.body.removeChild(outside);
    unmount();
  });

  it("leaves the menu open when the click lands inside a .rc-menu-wrap", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");

    const wrap = document.createElement("div");
    wrap.className = "rc-menu-wrap";
    const button = document.createElement("button");
    wrap.appendChild(button);
    document.body.appendChild(wrap);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(result.openMenuId.value).toBe("routine-1");

    document.body.removeChild(wrap);
    unmount();
  });

  it("closes the open menu on Escape", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(result.openMenuId.value).toBeNull();
    unmount();
  });

  it("ignores non-Escape keys", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(result.openMenuId.value).toBe("routine-1");
    unmount();
  });

  it("removes its document listeners on unmount, both the call and the observable effect", () => {
    const store = makeStore();
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("click", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    // A click after unmount must not reach the (now-detached) handler, so the menu stays "open"
    // in the composable's own (now-orphaned) state instead of being closed by a dead listener.
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(result.openMenuId.value).toBe("routine-1");

    removeSpy.mockRestore();
  });

  it("editRoutine closes the menu, sets the routine to edit, and opens the builder", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");
    const routine = makeRoutine();

    result.editRoutine(routine);

    expect(result.openMenuId.value).toBeNull();
    // Not toBe: a ref() assigned a plain object auto-wraps it in a reactive Proxy, so the
    // stored value is a different object identity from the original `routine` even though it
    // holds the same data.
    expect(result.editingRoutine.value).toEqual(routine);
    expect(result.showBuilder.value).toBe(true);

    unmount();
  });

  it("duplicateRoutine closes the menu and delegates to the store", async () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.toggleMenu("routine-1");
    const routine = makeRoutine();

    await result.duplicateRoutine(routine);

    expect(result.openMenuId.value).toBeNull();
    expect(store.duplicate).toHaveBeenCalledWith(routine);

    unmount();
  });

  it("onRoutineCreated closes the builder and clears the editing routine", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));
    result.editRoutine(makeRoutine());

    result.onRoutineCreated();

    expect(result.showBuilder.value).toBe(false);
    expect(result.editingRoutine.value).toBeNull();

    unmount();
  });

  it("deleteConfirm is a tap-twice confirm that calls store.remove on the second tap", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));

    result.deleteConfirm.trigger("routine-1");
    expect(store.remove).not.toHaveBeenCalled();
    expect(result.deleteConfirm.isArmed("routine-1")).toBe(true);

    result.deleteConfirm.trigger("routine-1");
    expect(store.remove).toHaveBeenCalledWith("routine-1");
    expect(result.deleteConfirm.isArmed("routine-1")).toBe(false);

    unmount();
  });

  it("deleteConfirm disarms itself after its timeout without calling store.remove", () => {
    const store = makeStore();
    const { result, unmount } = withSetup(() => useRoutineManagement(store));

    result.deleteConfirm.trigger("routine-1");
    vi.advanceTimersByTime(3000);

    expect(result.deleteConfirm.isArmed("routine-1")).toBe(false);
    expect(store.remove).not.toHaveBeenCalled();

    unmount();
  });
});
