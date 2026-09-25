<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Chip from "../base/Chip.vue";
import ExerciseIcon from "../exercise/ExerciseIcon.vue";
import { equipmentLabel, EQUIPMENT_SLUGS, supportEquipmentLabel, SUPPORT_EQUIPMENT_SLUGS } from "../../lib/equipmentIcons";
import { useOnboardingDraft } from "./OnboardingDraft";

const { t } = useI18n();
const draft = useOnboardingDraft();

// "plates" isn't a pickable chip here — owning a barbell already implies plate ownership for
// the accuracy check (requirements.ts's withImpliedPlates); the plate *inventory* detail (which
// sizes, how many) is its own dedicated step, not this coarse ownership picker.
const supportSlugs = SUPPORT_EQUIPMENT_SLUGS.filter((s) => s !== "plates");

// Bodyweight training isn't optional equipment the way a barbell or dumbbell is — every user can
// do bodyweight exercises regardless of what else they own, so it starts pre-selected
// (createOnboardingDraft) and must stay that way; deselecting it would leave a user with zero
// equipment able to see zero exercise suggestions. Locked instead of just "always re-added on
// toggle" so the chip visibly communicates why the click did nothing.
function toggle(slug: string) {
  if (slug === "bodyweight") return;
  if (draft.equipment.has(slug)) draft.equipment.delete(slug);
  else draft.equipment.add(slug);
}
</script>

<template>
  <div class="step">
    <h2>{{ t("onboarding.equipmentStep.title") }}</h2>
    <p class="step-hint">{{ t("onboarding.equipmentStep.hint") }}</p>

    <div class="eyebrow group-label">{{ t("profile.equipment.gearLabel") }}</div>
    <div class="chip-grid">
      <Chip
        v-for="slug in EQUIPMENT_SLUGS"
        :key="slug"
        as="button"
        variant="accent"
        class="equip-chip"
        :class="{ locked: slug === 'bodyweight' }"
        :active="draft.equipment.has(slug)"
        :aria-pressed="draft.equipment.has(slug)"
        :aria-disabled="slug === 'bodyweight' ? 'true' : undefined"
        @click="toggle(slug)"
      >
        <template #leading><ExerciseIcon :equipment="slug" :size="22" /></template>
        <span class="equip-chip-label">{{ equipmentLabel(slug) }}</span>
        <span v-if="slug === 'bodyweight'" class="lock-hint">{{ t("onboarding.equipmentStep.alwaysActiveHint") }}</span>
      </Chip>
    </div>

    <div class="eyebrow group-label">{{ t("profile.equipment.supportLabel") }}</div>
    <div class="chip-grid">
      <Chip
        v-for="slug in supportSlugs"
        :key="slug"
        as="button"
        variant="accent"
        class="equip-chip"
        :active="draft.equipment.has(slug)"
        @click="toggle(slug)"
      >
        <template #leading><ExerciseIcon :equipment="slug" :size="22" /></template>
        {{ supportEquipmentLabel(slug) }}
      </Chip>
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
/* Chip's own recipe (base/Chip.vue) supplies shape/color/active-state; this only adds the
   grid-item layout (icon + growing label, left-aligned, full column width) Chip's default pill
   shape doesn't assume. */
.equip-chip {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}
.equip-chip-label {
  flex: 1;
}
/* Bodyweight is always-on, not optional equipment — a lock cue plus a non-interactive cursor
   communicates why the click did nothing, rather than the chip silently ignoring taps like a
   broken toggle would. Stays on the active state (never grayed out): it's not disabled
   functionality, it's a permanently-true fact about the user. */
button.equip-chip.locked {
  cursor: default;
}
.lock-hint {
  /* Full-strength ink, not a dimmed opacity — measured, not eyeballed: opacity on this small
     (10px) uppercase label dropped its contrast against the gradient to ~3.5:1, below AA even
     for large text. Font-size/tracking alone (not opacity) carries the "secondary" hierarchy. */
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
</style>
