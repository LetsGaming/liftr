// useGymSetup.ts's bar-weight stepper used to hardcode a flat 1-50kg clamp, independent of
// onboarding's per-type MIN_BAR_WEIGHT_KG/MAX_BAR_WEIGHT_KG (which mirrors the server's
// barWeightsInput schema exactly — see settings.ts). That let a dumbbell handle be set above its
// 10kg server-side cap, silently failing to save. This regression-tests both the barbell-family
// floor (lowered to 1kg — some aluminum barbells weigh under 5kg) and the dumbbell ceiling.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/settingsService", () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  getOwnedEquipment: vi.fn().mockResolvedValue(null),
  getGymSetup: vi.fn().mockResolvedValue(null),
  saveProfile: vi.fn(),
  saveOwnedEquipment: vi.fn(),
  saveGymSetup: vi.fn(),
}));

import { useGymSetup } from "~client/composables/useGymSetup";
import { useSettingsStore } from "~client/stores/settingsStore";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("useGymSetup bar-weight clamp", () => {
  it("lets a barbell go down to 1kg, not just 5kg", () => {
    const store = useSettingsStore();
    const { barWeight, adjustBarWeight } = useGymSetup(store);

    for (let i = 0; i < 25; i++) adjustBarWeight("barbell", -1); // default 20kg, way past any floor

    expect(barWeight("barbell")).toBe(1);
  });

  it("caps a dumbbell handle at 10kg, not the barbell-family 50kg max", () => {
    const store = useSettingsStore();
    const { barWeight, adjustBarWeight } = useGymSetup(store);

    for (let i = 0; i < 20; i++) adjustBarWeight("dumbbell", 1); // default 2.5kg

    expect(barWeight("dumbbell")).toBe(10);
  });
});
