/**
 * Trainingsprofil card: onboarding's answers, editable again later ("alles lässt sich später im
 * Profil ändern", per OnboardingGuide.vue's own hint text). Local drafts seeded from the store
 * once it's loaded, same pattern OnboardingGuide.vue itself uses. Extracted out of
 * ProfilePage.vue — that file mixed six+ unrelated settings concerns together.
 */
import { computed, ref, watch } from "vue";
import { useToast } from "./useToast";
import type { useSettingsStore, ExperienceLevel } from "../stores/settingsStore";

export function useProfileForm(settingsStore: ReturnType<typeof useSettingsStore>) {
  const { toast } = useToast();

  const sex = ref<"male" | "female" | null>(null);
  const birthYearInput = ref("");
  const experienceLevel = ref<ExperienceLevel | null>(null);
  const workoutsPerWeek = ref(3);
  const profileSaving = ref(false);

  watch(
    () => settingsStore.profile,
    (profile) => {
      if (!profile) return;
      sex.value = profile.sex ?? null;
      birthYearInput.value = profile.birthYear ? String(profile.birthYear) : "";
      experienceLevel.value = profile.experienceLevel ?? null;
      workoutsPerWeek.value = profile.workoutsPerWeek ?? 3;
    },
    { immediate: true },
  );

  const birthYear = computed(() => {
    const v = Number(birthYearInput.value);
    return Number.isInteger(v) && v >= 1900 && v <= new Date().getFullYear() ? v : undefined;
  });

  async function saveProfileCard() {
    profileSaving.value = true;
    try {
      await settingsStore.saveProfile({
        ...(sex.value ? { sex: sex.value } : {}),
        ...(birthYear.value ? { birthYear: birthYear.value } : {}),
        ...(experienceLevel.value ? { experienceLevel: experienceLevel.value } : {}),
        workoutsPerWeek: workoutsPerWeek.value,
      });
      toast("Trainingsprofil gespeichert.");
    } finally {
      profileSaving.value = false;
    }
  }

  return { sex, birthYearInput, experienceLevel, workoutsPerWeek, profileSaving, saveProfileCard };
}
