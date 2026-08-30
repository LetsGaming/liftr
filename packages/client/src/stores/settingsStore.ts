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
      try {
        this.profile = await getProfile();
        this.profileLoaded = true;
      } catch {
        // offline with nothing cached — leave profileLoaded false, don't prompt onboarding blind
      }
      try {
        this.ownedEquipment = await getOwnedEquipment();
        this.equipmentLoaded = true;
      } catch {
        // offline — equipment filtering just stays unavailable (treated as "no restriction")
      }
      try {
        this.gymSetup = await getGymSetup();
        this.gymLoaded = true;
      } catch {
        // offline — plate calculator falls back to the unlimited standard set
      }
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
