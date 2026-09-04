import { describe, expect, it } from "vitest";
import { validateManualEntry } from "./runValidation";

describe("validateManualEntry", () => {
  it("accepts a valid entry", () => {
    expect(validateManualEntry("5", "30", "2026-09-04")).toBeNull();
  });

  it("accepts comma-decimal distance and duration", () => {
    expect(validateManualEntry("5,2", "31,5", "2026-09-04")).toBeNull();
  });

  it("rejects a blank distance", () => {
    expect(validateManualEntry("", "30", "2026-09-04")).toBe("Bitte eine Distanz in km angeben.");
  });

  it("rejects a zero distance", () => {
    expect(validateManualEntry("0", "30", "2026-09-04")).toBe("Bitte eine Distanz in km angeben.");
  });

  it("rejects a negative distance", () => {
    expect(validateManualEntry("-3", "30", "2026-09-04")).toBe("Bitte eine Distanz in km angeben.");
  });

  it("rejects a non-numeric distance", () => {
    expect(validateManualEntry("abc", "30", "2026-09-04")).toBe("Bitte eine Distanz in km angeben.");
  });

  it("rejects a blank duration", () => {
    expect(validateManualEntry("5", "", "2026-09-04")).toBe("Bitte eine Dauer in Minuten angeben.");
  });

  it("rejects a zero duration", () => {
    expect(validateManualEntry("5", "0", "2026-09-04")).toBe("Bitte eine Dauer in Minuten angeben.");
  });

  it("rejects a non-numeric duration", () => {
    expect(validateManualEntry("5", "xyz", "2026-09-04")).toBe("Bitte eine Dauer in Minuten angeben.");
  });

  it("rejects a blank date without throwing", () => {
    expect(validateManualEntry("5", "30", "")).toBe("Bitte ein gültiges Datum angeben.");
  });

  it("rejects a malformed date without throwing a raw RangeError", () => {
    expect(() => validateManualEntry("5", "30", "not-a-date")).not.toThrow();
    expect(validateManualEntry("5", "30", "not-a-date")).toBe("Bitte ein gültiges Datum angeben.");
  });

  it("checks distance before duration before date, first error wins", () => {
    expect(validateManualEntry("", "", "")).toBe("Bitte eine Distanz in km angeben.");
    expect(validateManualEntry("5", "", "")).toBe("Bitte eine Dauer in Minuten angeben.");
  });
});
