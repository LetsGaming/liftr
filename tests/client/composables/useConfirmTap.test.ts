// @vitest-environment jsdom
//
// useConfirmTap calls onUnmounted(), which needs an active component instance — mounted via
// withSetup so the disarm-timer's cleanup can actually be exercised on unmount.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConfirmTap } from "~client/composables/useConfirmTap";
import { withSetup } from "../helpers/withSetup";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useConfirmTap", () => {
  it("starts disarmed", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm));

    expect(result.armedKey.value).toBeNull();
    expect(result.isArmed()).toBe(false);
  });

  it("a first tap arms it without calling onConfirm", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm));

    result.trigger();

    expect(result.isArmed()).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a second tap within the window confirms and disarms", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm));

    result.trigger();
    result.trigger();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.isArmed()).toBe(false);
    expect(result.armedKey.value).toBeNull();
  });

  it("calls onConfirm with undefined for the default (keyless) target", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm));

    result.trigger();
    result.trigger();

    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("calls onConfirm with the key for a keyed target (e.g. one card in a list)", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm));

    result.trigger("routine-42");
    result.trigger("routine-42");

    expect(onConfirm).toHaveBeenCalledWith("routine-42");
  });

  it("tapping a different key re-arms for that key instead of confirming the first one", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm));

    result.trigger("routine-1");
    result.trigger("routine-2");

    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.isArmed("routine-1")).toBe(false);
    expect(result.isArmed("routine-2")).toBe(true);
  });

  it("auto-disarms after the timeout without a second tap", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm, 3000));

    result.trigger();
    vi.advanceTimersByTime(2999);
    expect(result.isArmed()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(result.isArmed()).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("respects a custom ms window", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm, 500));

    result.trigger();
    vi.advanceTimersByTime(500);

    expect(result.isArmed()).toBe(false);
  });

  it("a tap after auto-disarm re-arms rather than confirming", () => {
    const onConfirm = vi.fn();
    const { result } = withSetup(() => useConfirmTap(onConfirm, 1000));

    result.trigger();
    vi.advanceTimersByTime(1000); // auto-disarms
    result.trigger(); // fresh arm, not a confirm

    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.isArmed()).toBe(true);
  });

  it("clears its pending timer on unmount, so it doesn't fire after the component is gone", () => {
    const onConfirm = vi.fn();
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const { result, unmount } = withSetup(() => useConfirmTap(onConfirm, 1000));

    result.trigger();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
