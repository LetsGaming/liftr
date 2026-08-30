<script setup lang="ts">
import ExerciseIcon from "../exercise/ExerciseIcon.vue";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS, SUPPORT_EQUIPMENT_LABEL_DE, SUPPORT_EQUIPMENT_SLUGS } from "../../lib/equipmentIcons";
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();

// "plates" isn't a pickable chip here — owning a barbell already implies plate ownership for
// the accuracy check (requirements.ts's withImpliedPlates); the plate *inventory* detail (which
// sizes, how many) is its own dedicated step, not this coarse ownership picker.
const supportSlugs = SUPPORT_EQUIPMENT_SLUGS.filter((s) => s !== "plates");

function toggle(slug: string) {
  if (draft.equipment.has(slug)) draft.equipment.delete(slug);
  else draft.equipment.add(slug);
}
</script>

<template>
  <div class="step">
    <h2>Vorhandenes Equipment</h2>
    <p class="step-hint">
      Übungsvorschläge werden darauf beschränkt, was dir tatsächlich zur Verfügung steht — inklusive Dinge wie Bank
      oder Klimmzugstange, nicht nur das Trainingsgerät selbst.
    </p>

    <div class="eyebrow group-label">Trainingsgerät</div>
    <div class="chip-grid">
      <button
        v-for="slug in EQUIPMENT_SLUGS"
        :key="slug"
        class="equip-chip"
        :class="{ active: draft.equipment.has(slug) }"
        @click="toggle(slug)"
      >
        <ExerciseIcon :equipment="slug" :size="22" />
        {{ EQUIPMENT_LABEL_DE[slug] }}
      </button>
    </div>

    <div class="eyebrow group-label">Weiteres Equipment</div>
    <div class="chip-grid">
      <button
        v-for="slug in supportSlugs"
        :key="slug"
        class="equip-chip"
        :class="{ active: draft.equipment.has(slug) }"
        @click="toggle(slug)"
      >
        <ExerciseIcon :equipment="slug" :size="22" />
        {{ SUPPORT_EQUIPMENT_LABEL_DE[slug] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.step h2 {
  font-size: 20px;
}
.step-hint {
  font-size: 12.5px;
  color: var(--faint);
  line-height: 1.5;
}
.group-label {
  margin-top: var(--sp3);
}
.chip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp2);
}
.equip-chip {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}
.equip-chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
</style>
