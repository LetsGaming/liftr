// @vitest-environment jsdom
//
// useExerciseName calls vue-i18n's useI18n(), which needs an active component instance with the
// i18n plugin installed — mounting a tiny host component (via withSetup) needs a real DOM.
import { describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import { useExerciseName } from "~client/composables/useExerciseName";
import { withSetup } from "../helpers/withSetup";

function setup() {
  return withSetup(() => useExerciseName(), { global: { plugins: [i18n] } });
}

describe("useExerciseName", () => {
  describe("exerciseName", () => {
    it("resolves a catalog exercise's name via its real German i18n translation", () => {
      const { result } = setup();

      expect(result.exerciseName("back-squat")).toBe("Langhantel-Kniebeuge");
    });

    it("prefers a stored literal name (custom exercises) over the i18n lookup", () => {
      const { result } = setup();

      expect(result.exerciseName("back-squat", "My Custom Squat")).toBe("My Custom Squat");
    });

    it("falls through to the i18n lookup when name is null", () => {
      const { result } = setup();

      expect(result.exerciseName("back-squat", null)).toBe("Langhantel-Kniebeuge");
    });

    it("falls back to the raw slug when neither a name nor a translation exists", () => {
      const { result } = setup();

      expect(result.exerciseName("totally-unknown-slug")).toBe("totally-unknown-slug");
    });
  });

  describe("exerciseHowTo", () => {
    it("resolves a catalog exercise's how-to text", () => {
      const { result } = setup();

      expect(result.exerciseHowTo("back-squat")).toBe(
        "Rücken gerade halten, Knie in Fußrichtung, kontrolliert absenken — spürbar in den vorderen Oberschenkel.",
      );
    });

    it("returns null when no how-to translation exists for the slug", () => {
      const { result } = setup();

      expect(result.exerciseHowTo("totally-unknown-slug")).toBeNull();
    });
  });
});
