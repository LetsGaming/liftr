/**
 * Onboarding profile ("gender, age, weight, prior experience... workouts per week") + owned
 * equipment (feature: filter exercises to what a home-gym user actually has). Both are
 * single-user settings, mirroring @liftr/db's plain k/v `settings` table server-side — see
 * server's routes/settings.ts. `profileLoaded` distinguishes "haven't fetched yet" from
 * "fetched, and there's genuinely no profile" (App.vue's onboarding-prompt trigger needs that
 * distinction; a flat `null` alone can't tell the two apart while the very first load is still
 * in flight).
 */
import { defineStore } from "pinia";
import { withLoadState } from "../lib/loadState";
import {
  getGymSetup,
  getOwnedEquipment,
  getProfile,
  saveGymSetup as saveGymSetupOnServer,
  saveOwnedEquipment,
  saveProfile as saveProfileOnServer,
  type GymSetup,
  type Profile,
  type ProfileInput,
} from "../services/settingsService";

export type { BarWeights, ExperienceLevel, GymSetup, PlateInventoryEntry, Profile, ProfileInput } from "../services/settingsService";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    profile: null as Profile | null,
    profileLoaded: false,
    ownedEquipment: null as string[] | null,
    equipmentLoaded: false,
    gymSetup: null as GymSetup | null,
    gymLoaded: false,
  }),
  getters: {
    /** Onboarding hasn't been completed yet — App.vue shows the setup guide once for this. */
    needsOnboarding: (state) => state.profileLoaded && state.profile === null,
  },
  actions: {
    async load() {
      // No `error` flag on any of these three — a failed fetch just leaves its `xLoaded` flag
      // false (offline with nothing cached: don't prompt onboarding blind, equipment filtering
      // stays unavailable, plate calculator falls back to the unlimited standard set).
      await withLoadState(getProfile, {
        apply: (profile) => (this.profile = profile),
        setLoaded: (v) => (this.profileLoaded = v),
      });
      await withLoadState(getOwnedEquipment, {
        apply: (equipment) => (this.ownedEquipment = equipment),
        setLoaded: (v) => (this.equipmentLoaded = v),
      });
      await withLoadState(getGymSetup, {
        apply: (gymSetup) => (this.gymSetup = gymSetup),
        setLoaded: (v) => (this.gymLoaded = v),
      });
    },

    async saveProfile(input: ProfileInput) {
      this.profile = await saveProfileOnServer(input);
      this.profileLoaded = true;
    },

    async saveEquipment(equipment: string[]) {
      await saveOwnedEquipment(equipment);
      this.ownedEquipment = equipment;
      this.equipmentLoaded = true;
    },

    async saveGymSetup(input: GymSetup) {
      this.gymSetup = await saveGymSetupOnServer(input);
      this.gymLoaded = true;
    },
  },
});
