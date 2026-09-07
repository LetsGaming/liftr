// useWorkoutChrome.ts is a one-line module-level reactive singleton (`showingFinishRecap`) that
// hides the top-hud level/streak chips during the finish-sequence recap (see the file's own
// audit-fix comment). Nothing to mount — it's a bare `ref`, same pattern as useToast.ts's
// module-level `toasts` array.
import { describe, expect, it } from "vitest";

describe("showingFinishRecap", () => {
  it("defaults to false", async () => {
    // Fresh module instance so this test isn't order-dependent on whatever another test file
    // (or an earlier test in this file) already flipped it to.
    const { showingFinishRecap } = await import("~client/composables/useWorkoutChrome");
    expect(showingFinishRecap.value).toBe(false);
  });

  it("is a shared, writable ref every importer sees the same instance of", async () => {
    const a = await import("~client/composables/useWorkoutChrome");
    const b = await import("~client/composables/useWorkoutChrome");

    a.showingFinishRecap.value = true;

    expect(b.showingFinishRecap.value).toBe(true);
    expect(a.showingFinishRecap).toBe(b.showingFinishRecap);
  });
});
