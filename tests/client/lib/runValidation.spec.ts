// @vitest-environment jsdom
//
// runValidation.ts now calls i18n.ts's t(), which reads localStorage at module load (needs a
// DOM) — jsdom's navigator.language always reports "en-US", so i18n.ts's getStoredLocale() would
// otherwise default the shared i18n singleton to "en" for the rest of the test process —
// mountWithProviders.ts resets this for component tests, but this file imports the lib function
// directly, bypassing that helper.
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import { validateManualEntry } from "~client/lib/runValidation";

beforeEach(() => {
  i18n.global.locale.value = "de";
});

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
