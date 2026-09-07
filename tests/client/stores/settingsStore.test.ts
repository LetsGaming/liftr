import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileMock, getOwnedEquipmentMock, getGymSetupMock, saveProfileMock, saveOwnedEquipmentMock, saveGymSetupMock } = vi.hoisted(() => ({
  getProfileMock: vi.fn(),
  getOwnedEquipmentMock: vi.fn(),
  getGymSetupMock: vi.fn(),
  saveProfileMock: vi.fn(),
  saveOwnedEquipmentMock: vi.fn(),
  saveGymSetupMock: vi.fn(),
}));

vi.mock("~client/services/settingsService", () => ({
  getProfile: getProfileMock,
  getOwnedEquipment: getOwnedEquipmentMock,
  getGymSetup: getGymSetupMock,
  saveProfile: saveProfileMock,
  saveOwnedEquipment: saveOwnedEquipmentMock,
  saveGymSetup: saveGymSetupMock,
}));

import { useSettingsStore } from "~client/stores/settingsStore";
import type { GymSetup, Profile } from "~client/services/settingsService";

const profile: Profile = { sex: "male", birthYear: 1995, experienceLevel: "intermediate", workoutsPerWeek: 4 };
const gymSetup: GymSetup = { barWeights: { barbell: 20 }, plates: [{ weightKg: 20, count: 4 }] };

beforeEach(() => {
  setActivePinia(createPinia());
  getProfileMock.mockReset();
  getOwnedEquipmentMock.mockReset();
  getGymSetupMock.mockReset();
  saveProfileMock.mockReset();
  saveOwnedEquipmentMock.mockReset();
  saveGymSetupMock.mockReset();
});

describe("settingsStore", () => {
  it("starts with no profile/equipment/gym setup and nothing loaded", () => {
    const store = useSettingsStore();

    expect(store.profile).toBeNull();
    expect(store.profileLoaded).toBe(false);
    expect(store.ownedEquipment).toBeNull();
    expect(store.equipmentLoaded).toBe(false);
    expect(store.gymSetup).toBeNull();
    expect(store.gymLoaded).toBe(false);
    expect(store.needsOnboarding).toBe(false);
  });

  describe("load()", () => {
    it("populates profile, equipment, and gym setup independently on success", async () => {
      getProfileMock.mockResolvedValue(profile);
      getOwnedEquipmentMock.mockResolvedValue(["barbell", "dumbbell"]);
      getGymSetupMock.mockResolvedValue(gymSetup);
      const store = useSettingsStore();

      await store.load();

      expect(store.profile).toEqual(profile);
      expect(store.profileLoaded).toBe(true);
      expect(store.ownedEquipment).toEqual(["barbell", "dumbbell"]);
      expect(store.equipmentLoaded).toBe(true);
      expect(store.gymSetup).toEqual(gymSetup);
      expect(store.gymLoaded).toBe(true);
    });

    it("a failed profile fetch doesn't block equipment/gym from loading (independent try/catches)", async () => {
      getProfileMock.mockRejectedValue(new Error("offline"));
      getOwnedEquipmentMock.mockResolvedValue(["barbell"]);
      getGymSetupMock.mockResolvedValue(gymSetup);
      const store = useSettingsStore();

      await store.load();

      expect(store.profile).toBeNull();
      expect(store.profileLoaded).toBe(false);
      expect(store.ownedEquipment).toEqual(["barbell"]);
      expect(store.equipmentLoaded).toBe(true);
      expect(store.gymSetup).toEqual(gymSetup);
      expect(store.gymLoaded).toBe(true);
    });

    it("a failed equipment fetch doesn't block profile/gym from loading", async () => {
      getProfileMock.mockResolvedValue(profile);
      getOwnedEquipmentMock.mockRejectedValue(new Error("offline"));
      getGymSetupMock.mockResolvedValue(gymSetup);
      const store = useSettingsStore();

      await store.load();

      expect(store.profile).toEqual(profile);
      expect(store.profileLoaded).toBe(true);
      expect(store.ownedEquipment).toBeNull();
      expect(store.equipmentLoaded).toBe(false);
      expect(store.gymSetup).toEqual(gymSetup);
      expect(store.gymLoaded).toBe(true);
    });

    it("a failed gym-setup fetch doesn't block profile/equipment from loading", async () => {
      getProfileMock.mockResolvedValue(profile);
      getOwnedEquipmentMock.mockResolvedValue(["barbell"]);
      getGymSetupMock.mockRejectedValue(new Error("offline"));
      const store = useSettingsStore();

      await store.load();

      expect(store.profile).toEqual(profile);
      expect(store.profileLoaded).toBe(true);
      expect(store.ownedEquipment).toEqual(["barbell"]);
      expect(store.equipmentLoaded).toBe(true);
      expect(store.gymSetup).toBeNull();
      expect(store.gymLoaded).toBe(false);
    });
  });

  describe("needsOnboarding getter", () => {
    it("is false before the profile has loaded, even with no profile yet", () => {
      const store = useSettingsStore();
      expect(store.needsOnboarding).toBe(false);
    });

    it("is true once loaded and there's genuinely no profile", async () => {
      getProfileMock.mockResolvedValue(null);
      getOwnedEquipmentMock.mockResolvedValue(null);
      getGymSetupMock.mockResolvedValue(null);
      const store = useSettingsStore();

      await store.load();

      expect(store.needsOnboarding).toBe(true);
    });

    it("is false once loaded with an actual profile", async () => {
      getProfileMock.mockResolvedValue(profile);
      getOwnedEquipmentMock.mockResolvedValue(null);
      getGymSetupMock.mockResolvedValue(null);
      const store = useSettingsStore();

      await store.load();

      expect(store.needsOnboarding).toBe(false);
    });
  });

  describe("saveProfile()", () => {
    it("saves to the server and updates local state with the server's response", async () => {
      saveProfileMock.mockResolvedValue(profile);
      const store = useSettingsStore();

      await store.saveProfile({ ...profile, currentWeightKg: 82 });

      expect(saveProfileMock).toHaveBeenCalledWith({ ...profile, currentWeightKg: 82 });
      expect(store.profile).toEqual(profile);
      expect(store.profileLoaded).toBe(true);
    });
  });

  describe("saveEquipment()", () => {
    it("saves to the server and mirrors the given list locally", async () => {
      saveOwnedEquipmentMock.mockResolvedValue({ equipment: ["barbell"] });
      const store = useSettingsStore();

      await store.saveEquipment(["barbell"]);

      expect(saveOwnedEquipmentMock).toHaveBeenCalledWith(["barbell"]);
      expect(store.ownedEquipment).toEqual(["barbell"]);
      expect(store.equipmentLoaded).toBe(true);
    });
  });

  describe("saveGymSetup()", () => {
    it("saves to the server and updates local state with the server's response", async () => {
      saveGymSetupMock.mockResolvedValue(gymSetup);
      const store = useSettingsStore();

      await store.saveGymSetup(gymSetup);

      expect(saveGymSetupMock).toHaveBeenCalledWith(gymSetup);
      expect(store.gymSetup).toEqual(gymSetup);
      expect(store.gymLoaded).toBe(true);
    });
  });
});
