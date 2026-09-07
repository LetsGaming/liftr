// @vitest-environment jsdom
//
// shareCard.ts's `drawWorkoutCard` is canvas-drawing code (fonts, gradients, image loading) with
// no independent branching logic worth asserting on in isolation — jsdom doesn't implement a real
// 2D canvas context either (canvas.getContext("2d") returns null without the native `canvas`
// package), so exercising it would mean re-implementing pixel-level rendering, not testing real
// behavior. This file instead covers the module's actual conditional logic: the three-way
// share/save/download fallback chain and the clipboard feature detection, both genuine branching
// code. `document`/`navigator`/`URL`/`File` are true browser boundaries, so this runs under jsdom
// with those globals stubbed per test rather than under the default node environment.
import { afterEach, describe, expect, it, vi } from "vitest";
import { canCopyToClipboard, canvasToBlob, copyBlobToClipboard, shareOrDownloadBlob } from "~client/lib/shareCard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as unknown as { share?: unknown }).share;
  delete (navigator as unknown as { canShare?: unknown }).canShare;
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  delete (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem;
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe("canvasToBlob", () => {
  it("resolves with the blob canvas.toBlob() hands back, requesting image/png", async () => {
    const blob = new Blob(["fake-png"], { type: "image/png" });
    const toBlobMock = vi.fn((cb: (b: Blob | null) => void) => cb(blob));
    const canvas = { toBlob: toBlobMock } as unknown as HTMLCanvasElement;

    const result = await canvasToBlob(canvas);

    expect(result).toBe(blob);
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("resolves null when the canvas can't produce a blob", async () => {
    const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
    await expect(canvasToBlob(canvas)).resolves.toBeNull();
  });
});

describe("canCopyToClipboard", () => {
  it("is false when ClipboardItem is unsupported", () => {
    expect(canCopyToClipboard()).toBe(false);
  });

  it("is false when ClipboardItem exists but navigator.clipboard.write doesn't", () => {
    vi.stubGlobal("ClipboardItem", class {});
    expect(canCopyToClipboard()).toBe(false);
  });

  it("is true when both ClipboardItem and navigator.clipboard.write are available", () => {
    vi.stubGlobal("ClipboardItem", class {});
    Object.defineProperty(navigator, "clipboard", { value: { write: vi.fn() }, configurable: true });
    expect(canCopyToClipboard()).toBe(true);
  });
});

describe("copyBlobToClipboard", () => {
  it("returns false without touching the clipboard when unsupported", async () => {
    const result = await copyBlobToClipboard(new Blob(["x"]));
    expect(result).toBe(false);
  });

  it("writes a ClipboardItem and returns true when supported and the write succeeds", async () => {
    vi.stubGlobal("ClipboardItem", class {
      constructor(public items: Record<string, Blob>) {}
    });
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { write: writeMock }, configurable: true });

    const blob = new Blob(["x"], { type: "image/png" });
    const result = await copyBlobToClipboard(blob);

    expect(result).toBe(true);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("returns false rather than throwing when the clipboard write is denied", async () => {
    vi.stubGlobal("ClipboardItem", class {});
    const writeMock = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { write: writeMock }, configurable: true });

    await expect(copyBlobToClipboard(new Blob(["x"]))).resolves.toBe(false);
  });
});

describe("shareOrDownloadBlob", () => {
  const blob = new Blob(["png-bytes"], { type: "image/png" });

  it("uses navigator.share() when canShare/share are both available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true });

    await shareOrDownloadBlob(blob, "card.png", "Mein Workout");

    expect(shareMock).toHaveBeenCalledTimes(1);
    const call = shareMock.mock.calls[0]![0];
    expect(call.title).toBe("Mein Workout");
    expect(call.files[0].name).toBe("card.png");
  });

  it("falls through to the save picker when share() rejects (e.g. the user cancelled)", async () => {
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new Error("cancelled")), configurable: true });

    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const createWritable = vi.fn().mockResolvedValue(writable);
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    await shareOrDownloadBlob(blob, "card.png", "Mein Workout");

    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "card.png" }),
    );
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("uses showSaveFilePicker() directly when the Web Share API isn't available at all", async () => {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable: vi.fn().mockResolvedValue(writable) });
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    await shareOrDownloadBlob(blob, "card.png", "Mein Workout");

    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
  });

  it("does nothing further when the save picker is dismissed with AbortError (a real 'do nothing')", async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);
    const createElementSpy = vi.spyOn(document, "createElement");

    await shareOrDownloadBlob(blob, "card.png", "Mein Workout");

    expect(createElementSpy).not.toHaveBeenCalledWith("a");
  });

  it("falls back to a plain anchor download when the save picker fails for a reason other than AbortError", async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = vi.fn();
    // Stub the anchor's click() — jsdom doesn't implement real navigation, and a plain `.click()`
    // on an anchor with an href otherwise logs a noisy (harmless) "Not implemented" error.
    const anchor = document.createElement("a");
    vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    await shareOrDownloadBlob(blob, "card.png", "Mein Workout");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("falls back to a plain anchor download when neither Web Share nor File System Access is available", async () => {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = vi.fn();
    const anchor = document.createElement("a");
    const clickMock = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    await shareOrDownloadBlob(blob, "card.png", "Mein Workout");

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(anchor.href).toContain("blob:mock-url");
    expect(anchor.download).toBe("card.png");
  });
});
