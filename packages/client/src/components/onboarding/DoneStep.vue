<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "../ui/AppIcon.vue";
import { needsPlatesStep, useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();

const equipmentCount = computed(() => draft.equipment.size);
const hasPlates = computed(() => needsPlatesStep(draft) && [...draft.plates.values()].some((c) => c > 0));
</script>

<template>
  <div class="done">
    <div class="hero-badge"><AppIcon name="check" :size="40" /></div>
    <h2>Fertig!</h2>
    <p>Los geht's — hier ist, was das für dich freischaltet:</p>
    <ul class="unlocks">
      <li class="surface-hybrid"><AppIcon name="target" /> Gewichtsvorschläge passend zu deiner Erfahrung</li>
      <li class="surface-hybrid"><AppIcon name="dumbbell" /> Übungsvorschläge, die zu deinem Equipment ({{ equipmentCount }} ausgewählt) passen — mit Alternativen statt einfach nichts</li>
      <li v-if="hasPlates" class="surface-hybrid"><AppIcon name="scale" /> Exakte Scheiben-Anzeige beim Training, mit deinen eigenen Gewichten</li>
      <li class="surface-hybrid"><AppIcon name="trophy" /> Rang-Berechnung basierend auf Körpergewicht und Geschlecht</li>
    </ul>
  </div>
</template>

<style scoped>
.done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--sp3);
  padding: var(--sp6) var(--sp2) var(--sp4);
}
.hero-badge {
  font-size: 40px;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--green), #1fa85c);
  color: #04220f;
  font-weight: 900;
  margin-bottom: var(--sp2);
}
.done h2 {
  font-size: 24px;
}
.done p {
  font-size: 14px;
  color: var(--dim);
}
.unlocks {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  text-align: left;
  width: 100%;
  margin-top: var(--sp2);
}
/* Nebula N5 — .surface-hybrid (tokens.css) applied in the template alongside this class replaces
   the flat --surface-2 fill + --line border with the shared translucent panel treatment; this
   rule now only supplies layout (padding/radius/type), same split as ProfilePage.vue's .card. */
.unlocks li {
  padding: var(--sp3);
  border-radius: var(--r-md);
  font-size: 13px;
  line-height: 1.4;
}
</style>
