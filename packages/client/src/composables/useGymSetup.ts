/**
 * Equipment toggling + "Scheiben & Stange" (plates/bar) card: lets the user specify which weight
 * plates they have, so the app can show how to load the barbell. Onboarding-only settings that
 * can't be edited again would be a trap, so this mirrors the wizard's EquipmentStep/PlatesStep
 * here on the settings page instead. Extracted out of ProfilePage.vue — that file mixed six+
 * unrelated settings concerns together.
 */
import { computed, ref, watch } from "vue";
import { t } from "../i18n";
import { useToast } from "./useToast";
// DEFAULT_BAR_WEIGHTS_KG/MIN_BAR_WEIGHT_KG/MAX_BAR_WEIGHT_KG were previously duplicated here with
// a different (looser, dumbbell-max-ignoring) clamp than onboarding's copy — reusing onboarding's
// as the single source of truth instead, since it's the one that already mirrors the server's
// barWeightsInput schema (settings.ts) exactly.
import { DEFAULT_BAR_WEIGHTS_KG, MAX_BAR_WEIGHT_KG, MIN_BAR_WEIGHT_KG, type BarType } from "../components/onboarding/OnboardingDraft";
import { SUPPORT_EQUIPMENT_SLUGS } from "../lib/equipmentIcons";
import type { useSettingsStore } from "../stores/settingsStore";

export type { BarType };
export const BAR_TYPES: BarType[] = ["barbell", "ez-bar", "trap-bar", "dumbbell"];
// Same names as onboarding's PlatesStep.vue (which has its own copy of this table, scoped to its
// own wizard step) — reuses that i18n key rather than duplicating the label set a second time.
const BAR_LABEL_KEY: Record<BarType, string> = {
  barbell: "onboarding.platesStep.barLabel.barbell",
  "ez-bar": "onboarding.platesStep.barLabel.ezBar",
  "trap-bar": "onboarding.platesStep.barLabel.trapBar",
  dumbbell: "onboarding.platesStep.barLabel.dumbbell",
};
export const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 1];

// "plates" is implied by owning a barbell/ez-bar/trap-bar (requirements.ts's withImpliedPlates)
// — never a pickable chip here, same as onboarding's EquipmentStep.
export const supportEquipmentSlugs = SUPPORT_EQUIPMENT_SLUGS.filter((s) => s !== "plates");

export function useGymSetup(settingsStore: ReturnType<typeof useSettingsStore>) {
  const { toast } = useToast();
  const barLabel = (type: BarType) => t(BAR_LABEL_KEY[type]);

  // Defaults to bodyweight-owned even before the store loads (same default as onboarding's
  // OnboardingDraft.ts) — a profile with no saved equipment yet (server returns null, e.g. a
  // brand-new account) must never render as "nothing owned, not even your own body".
  const equipment = ref<Set<string>>(new Set(["bodyweight"]));
  const equipmentSaving = ref(false);

  watch(
    () => settingsStore.ownedEquipment,
    (owned) => {
      // Bodyweight is always available (everyone has a body) — force it into the set regardless
      // of what the server has on record, same guarantee as onboarding's OnboardingDraft.ts
      // default, so a stored profile that predates this fix (or one saved without it, see the
      // toggle guard below) still shows it as owned instead of silently reverting to "not
      // selected".
      if (owned) equipment.value = new Set([...owned, "bodyweight"]);
    },
    { immediate: true },
  );

  // Bodyweight can never be deselected — every user has a body, so unchecking it would just
  // break exercise suggestions for no real-world reason (same fix as onboarding's equipment step
  // is meant to have). Guard here rather than disabling the chip outright so it still reads as
  // "on" rather than as a dead control.
  function toggleEquipment(slug: string) {
    if (slug === "bodyweight") return;
    if (equipment.value.has(slug)) equipment.value.delete(slug);
    else equipment.value.add(slug);
  }

  async function saveEquipmentCard() {
    equipmentSaving.value = true;
    try {
      await settingsStore.saveEquipment([...equipment.value]);
      toast(t("profile.equipment.equipmentSaved"));
    } catch {
      toast(t("profile.equipment.saveFailed"));
    } finally {
      equipmentSaving.value = false;
    }
  }

  const ownedBarTypes = computed(() => BAR_TYPES.filter((barType) => equipment.value.has(barType)));

  const barWeightsKg = ref<Map<BarType, number>>(new Map());
  const plateCounts = ref<Map<number, number>>(new Map());
  const gymSaving = ref(false);

  watch(
    () => settingsStore.gymSetup,
    (gym) => {
      if (!gym) return;
      barWeightsKg.value = new Map(Object.entries(gym.barWeights) as [BarType, number][]);
      plateCounts.value = new Map(gym.plates.map((p) => [p.weightKg, p.count]));
    },
    { immediate: true },
  );

  function plateCount(weightKg: number): number {
    return plateCounts.value.get(weightKg) ?? 0;
  }
  function adjustPlateCount(weightKg: number, delta: number) {
    const next = Math.max(0, plateCount(weightKg) + delta);
    if (next === 0) plateCounts.value.delete(weightKg);
    else plateCounts.value.set(weightKg, next);
  }
  function barWeight(type: BarType): number {
    return barWeightsKg.value.get(type) ?? DEFAULT_BAR_WEIGHTS_KG[type];
  }
  function adjustBarWeight(type: BarType, delta: number) {
    barWeightsKg.value.set(type, Math.min(MAX_BAR_WEIGHT_KG[type], Math.max(MIN_BAR_WEIGHT_KG[type], barWeight(type) + delta)));
  }
  async function saveGymCard() {
    gymSaving.value = true;
    try {
      const plates = [...plateCounts.value.entries()].filter(([, count]) => count > 0).map(([weightKg, count]) => ({ weightKg, count }));
      const barWeights = Object.fromEntries([...barWeightsKg.value.entries()].filter(([type]) => ownedBarTypes.value.includes(type)));
      await settingsStore.saveGymSetup({ barWeights, plates });
      toast(t("profile.equipment.gymSaved"));
    } catch {
      // Previously unhandled — a rejection here (e.g. the server's per-type max, still enforced
      // server-side even after the client clamp fix above) left the card looking saved with no
      // indication anything failed.
      toast(t("profile.equipment.saveFailed"));
    } finally {
      gymSaving.value = false;
    }
  }

  /** ProfilePage.vue's merged Equipment+Scheiben card has one save button for what used to be two
   *  cards/two requests (PUT /api/settings/equipment and PUT /api/settings/gym) — this fires both
   *  and shows one combined toast instead of the two cards' separate ones stacking. */
  async function saveEquipmentAndGymCard() {
    equipmentSaving.value = true;
    gymSaving.value = true;
    try {
      const plates = [...plateCounts.value.entries()].filter(([, count]) => count > 0).map(([weightKg, count]) => ({ weightKg, count }));
      const barWeights = Object.fromEntries([...barWeightsKg.value.entries()].filter(([type]) => ownedBarTypes.value.includes(type)));
      await Promise.all([settingsStore.saveEquipment([...equipment.value]), settingsStore.saveGymSetup({ barWeights, plates })]);
      toast(t("profile.equipment.equipmentSaved"));
    } catch {
      toast(t("profile.equipment.saveFailed"));
    } finally {
      equipmentSaving.value = false;
      gymSaving.value = false;
    }
  }

  return {
    equipment,
    equipmentSaving,
    toggleEquipment,
    saveEquipmentCard,
    barLabel,
    ownedBarTypes,
    barWeightsKg,
    plateCounts,
    gymSaving,
    plateCount,
    adjustPlateCount,
    barWeight,
    adjustBarWeight,
    saveGymCard,
    saveEquipmentAndGymCard,
  };
}
