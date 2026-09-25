<script setup lang="ts">
/** Step 1: a short intent-framing hero rather than launching straight into a form field — the
 *  wizard's nav bar already carries the primary CTA, so this step is pure copy. */
import { useI18n } from "vue-i18n";
import AppIcon from "../base/AppIcon.vue";

const { t } = useI18n();
</script>

<template>
  <div class="welcome">
    <div class="hero-badge"><AppIcon name="dumbbell" :size="40" /></div>
    <h2>{{ t("onboarding.welcomeStep.title") }}</h2>
    <p>{{ t("onboarding.welcomeStep.body") }}</p>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--sp3);
  padding: var(--sp6) var(--sp2) var(--sp4);
}
.hero-badge {
  font-size: 44px;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--icon-fill-blue);
  box-shadow: var(--glow-blue);
  margin-bottom: var(--sp2);
  color: #fff;
}
.welcome h2 {
  font-size: 24px;
}
.welcome p {
  font-size: 14px;
  color: var(--dim);
  line-height: 1.55;
  max-width: 42ch;
}
</style>
