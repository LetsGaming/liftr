<script setup lang="ts">
/**
 * "Erholungszone" — a reason to open the app on a rest day (engagement rework W5). A muscle-
 * recovery heat map plus a one-line verdict naming what's actually ready, styled after
 * Liftoff's own recovery-zone screen (examples/Screenshot_20260824-175320.png). A training-
 * decision aid, not a score — deliberately adds no new currency, per the project audit's "don't
 * stack badges/streaks/points into noise" rule; this is the one genuinely new surface, and it's
 * a suggestion, not something to chase.
 */
import { computed } from "vue";
import { MUSCLE_LABEL_DE } from "../../lib/muscles";
import MuscleFigure from "./MuscleFigure.vue";

const props = defineProps<{ heat: Record<string, number>; recoveredSlugs: string[]; loaded: boolean }>();
const emit = defineEmits<{ start: [] }>();

const topRecovered = computed(() => props.recoveredSlugs.slice(0, 3).map((s) => MUSCLE_LABEL_DE[s] ?? s));

const verdict = computed(() => {
  if (topRecovered.value.length === 0) return "Keine Muskelgruppe ist gerade eindeutig erholt — leg trotzdem los, wo du willst.";
  const names = topRecovered.value.length === 1
    ? topRecovered.value[0]
    : `${topRecovered.value.slice(0, -1).join(", ")} und ${topRecovered.value[topRecovered.value.length - 1]}`;
  return `${names} ${topRecovered.value.length === 1 ? "ist" : "sind"} vollständig erholt.`;
});
</script>

<template>
  <section v-if="loaded" class="erholungszone">
    <div class="eyebrow ez-eyebrow">Erholungszone</div>
    <MuscleFigure :heat="heat" />
    <div class="ez-status">
      <span class="ez-pill">DEIN STATUS</span>
      <p>{{ verdict }}</p>
      <button class="btn-primary btn-block" @click="emit('start')">Jetzt trainieren →</button>
    </div>
  </section>
  <!-- Reserves this card's rough footprint while /api/readiness is still loading (feedback: fix
       layout shift) — this is the first section on the dashboard, so without a placeholder here
       every section below it jumps down the moment the request resolves. Shaped roughly like
       the real content instead of one flat rectangle, per the same shimmer technique
       WorkoutPage.vue's rank skeleton uses. -->
  <div v-else class="erholungszone ez-skeleton" aria-hidden="true">
    <div class="shimmer ez-skel-eyebrow" />
    <div class="ez-skel-figure shimmer" />
    <div class="ez-status">
      <div class="shimmer ez-skel-pill" />
      <div class="shimmer ez-skel-line" />
      <div class="shimmer ez-skel-line short" />
      <div class="shimmer ez-skel-btn" />
    </div>
  </div>
</template>

<style scoped>
.erholungszone {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.ez-eyebrow {
  --eyebrow-color: var(--fire-hi);
}
.ez-status {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.ez-pill {
  align-self: flex-start;
  background: linear-gradient(135deg, var(--fire-hi), var(--fire));
  color: var(--k-warmup-text);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 5px 12px;
  border-radius: 999px;
}
.ez-status p {
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.5;
}

/* Skeleton pieces — .shimmer (styles/motion.css) supplies the sweep, these just give each
   piece the real content's approximate size/shape/background. */
.ez-skeleton .shimmer {
  background-color: var(--surface-2);
  border-radius: var(--r-sm);
}
.ez-skel-eyebrow {
  width: 110px;
  height: 12px;
}
.ez-skel-figure {
  align-self: center;
  width: 200px;
  height: 174px;
  border-radius: var(--r-md);
}
.ez-skel-pill {
  width: 140px;
  height: 22px;
  border-radius: 999px;
}
.ez-skel-line {
  width: 100%;
  height: 14px;
}
.ez-skel-line.short {
  width: 60%;
}
.ez-skel-btn {
  height: 44px;
  border-radius: var(--r-md);
}
</style>
