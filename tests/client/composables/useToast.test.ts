// useToast.ts keeps its queue as module-level reactive state (not a Pinia store — see the
// file's own header comment) shared by every caller. That means state leaks across tests unless
// each test gets a fresh module instance, so every test here resets modules and re-imports
// rather than sharing one top-level import.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useToast", () => {
  it("starts with an empty queue", async () => {
    const { useToast } = await import("~client/composables/useToast");
    const { toasts } = useToast();
    expect(toasts).toEqual([]);
  });

  it("pushes a message with an incrementing id", async () => {
    const { useToast } = await import("~client/composables/useToast");
    const { toast, toasts } = useToast();

    toast("Gespeichert");
    toast("Aktualisiert");

    expect(toasts).toEqual([
      { id: 0, text: "Gespeichert" },
      { id: 1, text: "Aktualisiert" },
    ]);
  });

  it("shares one queue across every useToast() call (module-level singleton)", async () => {
    const { useToast } = await import("~client/composables/useToast");
    const first = useToast();
    const second = useToast();

    first.toast("from first");

    expect(second.toasts).toEqual([{ id: 0, text: "from first" }]);
    expect(first.toasts).toBe(second.toasts);
  });

  it("auto-dismisses a toast after 2500ms", async () => {
    const { useToast } = await import("~client/composables/useToast");
    const { toast, toasts } = useToast();

    toast("bye soon");
    expect(toasts).toHaveLength(1);

    vi.advanceTimersByTime(2499);
    expect(toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(toasts).toHaveLength(0);
  });

  it("dismisses each toast independently by its own id, not by queue position", async () => {
    const { useToast } = await import("~client/composables/useToast");
    const { toast, toasts } = useToast();

    toast("first"); // id 0, scheduled to leave at t=2500
    vi.advanceTimersByTime(1000);
    toast("second"); // id 1, scheduled to leave at t=3500
    expect(toasts.map((t) => t.text)).toEqual(["first", "second"]);

    vi.advanceTimersByTime(1500); // t=2500: only "first" should be gone
    expect(toasts.map((t) => t.text)).toEqual(["second"]);

    vi.advanceTimersByTime(1000); // t=3500: "second" leaves too
    expect(toasts).toHaveLength(0);
  });
});
