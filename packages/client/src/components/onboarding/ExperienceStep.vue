<script setup lang="ts">
import type { ExperienceLevel } from "../../stores/settingsStore";
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();

const options: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Anfänger", hint: "Noch nie oder erst seit kurzem trainiert" },
  { value: "intermediate", label: "Fortgeschritten", hint: "Trainiere seit einer Weile, ohne festen Plan" },
  { value: "advanced", label: "Erfahren", hint: "Folge bereits einem strukturierten Trainingsplan" },
];
</script>

<template>
  <div class="step">
    <h2>Trainingserfahrung</h2>
    <p class="step-hint">Legt fest, mit welchen Gewichten Liftr startet, solange du eine Übung noch nie gemacht hast.</p>

    <div class="option-list">
      <button
        v-for="opt in options"
        :key="opt.value"
        class="option-row"
        :class="{ active: draft.experienceLevel === opt.value }"
        @click="draft.experienceLevel = opt.value"
      >
        <b>{{ opt.label }}</b>
        <span>{{ opt.hint }}</span>
      </button>
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
.option-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: var(--sp4);
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  /* Audit finding: a plain <button> has no inherited text color of its own (browsers paint
     unstyled button text with the UA "ButtonText" system color, i.e. near-black) — this rule was
     missing entirely, so every unselected row's bold label rendered as near-invisible dark text
     on this dark surface. --dim (not --text) is deliberate for the *unselected* rows: it reads as
     "available but not chosen" against the active row's full-brightness ink, same hierarchy the
     other onboarding chip lists (EquipmentStep/AboutStep) already use for their inactive state. */
  color: var(--dim);
  text-align: left;
}
.option-row b {
  font-size: 15px;
  color: var(--text);
}
.option-row span {
  font-size: 12.5px;
  /* --dim, not --faint: --faint on --surface-2 measures ~4.8:1, technically AA but with almost no
     margin (audit: "very hard to read"); --dim measures ~5.6:1 here, a real, comfortable pass. */
  color: var(--dim);
}
/* Selected state: the same Nebula CTA gradient .btn-primary uses (tokens.css) instead of a flat
   --blue-lo fill (audit: "the selected option is a flat solid blue fill with no relationship to
   the app's Nebula gradient system"). --nebula-ink-on-fill is already the app's proven AA-safe
   ink for this exact gradient (worst stop ~5:1, see tokens.css's .btn-primary comment). */
.option-row.active {
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
