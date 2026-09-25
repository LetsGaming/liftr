<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ExperienceLevel } from "../../stores/settingsStore";
import ListRow from "../patterns/ListRow.vue";
import { useOnboardingDraft } from "./OnboardingDraft";

const { t } = useI18n();
const draft = useOnboardingDraft();

const options: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "beginner", label: t("profile.trainingProfile.experience.beginner"), hint: t("onboarding.experienceStep.beginnerHint") },
  { value: "intermediate", label: t("profile.trainingProfile.experience.intermediate"), hint: t("onboarding.experienceStep.intermediateHint") },
  { value: "advanced", label: t("profile.trainingProfile.experience.advanced"), hint: t("onboarding.experienceStep.advancedHint") },
];
</script>

<template>
  <div class="step">
    <h2>{{ t("profile.trainingProfile.experience.label") }}</h2>
    <p class="step-hint">{{ t("onboarding.experienceStep.hint") }}</p>

    <div class="option-list">
      <ListRow
        v-for="opt in options"
        :key="opt.value"
        as="button"
        class="option-row"
        :class="{ active: draft.experienceLevel === opt.value }"
        @click="draft.experienceLevel = opt.value"
      >
        <div class="option-meta">
          <b>{{ opt.label }}</b>
          <span>{{ opt.hint }}</span>
        </div>
      </ListRow>
    </div>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: var(--sp5);
}
.step h2 {
  font-size: 20px;
}
.step-hint {
  font-size: 12.5px;
  color: var(--faint);
  margin-top: -8px;
}
.option-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
/* ListRow (patterns/ListRow.vue) supplies the interactive-button reset; the specific element
   qualifier here (not just the class) keeps this recipe's background/color from losing to
   ListRow's own `.list-row-interactive` reset regardless of the two components' CSS load order. */
button.option-row {
  padding: var(--sp4);
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  /* A plain <button> has no inherited text color of its own — browsers paint unstyled button
     text with the UA "ButtonText" system color (near-black), which reads as near-invisible dark
     text on this dark surface without an explicit color here. --dim (not --text) is deliberate
     for the *unselected* rows: it reads as "available but not chosen" against the active row's
     full-brightness ink, same hierarchy EquipmentStep/AboutStep use for their inactive state. */
  color: var(--dim);
}
.option-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.option-row b {
  font-size: 15px;
  color: var(--text);
}
.option-row span {
  font-size: 12.5px;
  /* --dim, not --faint: --faint on --surface-2 measures ~4.8:1, technically AA but with almost no
     margin; --dim measures ~5.6:1 here, a real, comfortable pass. */
  color: var(--dim);
}
/* Selected state uses the same CTA gradient .btn-primary uses (tokens.css) instead of a flat
   --blue-lo fill, so the selected row ties visually to the app's gradient system.
   --nebula-ink-on-fill is already the app's proven AA-safe ink for this exact gradient (worst
   stop ~5:1, see tokens.css's .btn-primary comment). */
button.option-row.active {
  background: var(--nebula-grad-cta);
  border-color: transparent;
  color: var(--nebula-ink-on-fill);
}
.option-row.active b,
.option-row.active span {
  /* Full opacity, not a dimmed variant — the gradient's own hue range already gives the hint
     line lower apparent weight than the bold label without sacrificing contrast (an
     opacity-reduced dark ink over a bright gradient loses AA margin fast; measured full-strength
     instead of eyeballed, per the same standard applied to the unselected state above). */
  color: var(--nebula-ink-on-fill);
}
</style>
