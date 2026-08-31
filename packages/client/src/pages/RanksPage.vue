<script setup lang="ts">
// Ränge (plan Phase 2 / mockup #p-raenge): tiered rank cards + next-target, powered by
// @liftr/shared's resolveRank/nextLoadTarget running server-side (see rankEngine.ts) and
// cached into the `ranks` table. Never gated/paywalled (audit §3's explicit anti-pattern).
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { onMounted } from "vue";
import ProgressChart from "../components/rank/ProgressChart.vue";
import RankDistributionDonut from "../components/rank/RankDistributionDonut.vue";
import RankProgress from "../components/rank/RankProgress.vue";
import RankUpCalendar from "../components/rank/RankUpCalendar.vue";
import { useExerciseHistoryCache } from "../composables/useExerciseHistoryCache";
import { useExerciseName } from "../composables/useExerciseName";
import { useRanksStore } from "../stores/ranksStore";

const ranksStore = useRanksStore();
onMounted(() => ranksStore.load());

const { exerciseName } = useExerciseName();
const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Ränge</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p style="color: var(--dim)">Pro Übung · echte Standards wo verfügbar, sonst abgeleitet — nichts gesperrt</p>

      <p v-if="ranksStore.loaded && ranksStore.ranks.length === 0" style="color: var(--dim); margin-top: var(--sp4)">
        Noch keine Ränge — logge ein paar Sätze, um deinen ersten Rang zu sehen.
      </p>

      <div v-else class="rank-analytics">
        <RankDistributionDonut />
        <RankUpCalendar />
      </div>

      <div v-if="!(ranksStore.loaded && ranksStore.ranks.length === 0)" class="rank-grid">
        <div v-for="r in ranksStore.ranks" :key="r.exerciseId" class="rank-card-wrap">
          <button class="rank-card" :class="`t-${r.tier}`" @click="toggleExpand(r.exerciseId)">
            <div class="en">{{ exerciseName(r.slug) }}</div>
            <RankProgress
              variant="card"
              :tier="r.tier"
              :division="r.division"
              :lp="r.lp"
              :next-target-weight-kg="r.nextTargetWeightKg"
              :next-target-reps="r.nextTargetReps"
              :trust="r.trust"
              :peak-tier="r.peakTier"
              :peak-division="r.peakDivision"
            />
          </button>
          <div v-if="expanded.has(r.exerciseId)" class="chart-slot pop-in">
            <ProgressChart v-if="historyCache.has(r.exerciseId)" :sets="historyCache.get(r.exerciseId)!" :is-bodyweight="r.isBodyweight" />
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.rank-analytics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp4);
  margin: var(--sp4) auto 0;
  max-width: var(--content-w-wide);
}
.rank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--sp4);
  margin: var(--sp4) auto 0;
  max-width: var(--content-w-wide);
  align-items: start;
}
.rank-card-wrap {
  display: flex;
  flex-direction: column;
  /* Entrance stagger (matches the dashboard's — feedback: the rest of the app was still
     missing that liveliness). nth-child on the wrapper, not the button, so the chart slot
     that appears on expand doesn't itself replay this. --ease-out, not --ease-spring — this
     is routine page-load motion, not an earned moment (motion.css's own convention: reserve
     the overshoot easing for things the user actually earned, or it cheapens rank-up/PR
     celebrations that use the same curve). */
  animation: pop-in var(--dur-base) var(--ease-out) both;
}
.rank-grid > .rank-card-wrap:nth-child(1) {
  animation-delay: 0ms;
}
.rank-grid > .rank-card-wrap:nth-child(2) {
  animation-delay: 40ms;
}
.rank-grid > .rank-card-wrap:nth-child(3) {
  animation-delay: 80ms;
}
.rank-grid > .rank-card-wrap:nth-child(n + 4) {
  animation-delay: 120ms;
}
.rank-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  width: 100%;
  padding: var(--sp4);
  border-radius: var(--r-lg);
  border: 1px solid rgba(255, 255, 255, 0.14);
  text-align: left;
  position: relative;
  overflow: hidden;
  /* A native <button> has its own opaque default background — without overriding it
     explicitly, that default paints over the ::after gradient below even at z-index:-1.
     Same root cause as the exercise-rail white-card bug (P0-A): always set a background
     explicitly on interactive elements, never rely on the pseudo-element alone. */
  background: transparent;
  transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
.rank-card:active {
  transform: scale(0.98);
}
@media (hover: hover) {
  .rank-card:hover {
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.6);
  }
}
/* Full-card vivid tier gradient (UI/UX rework audit P0-C) — the reward screen should be the
   most colourful surface in the app, not a dark card with a faint tint at the top. Fallbacks
   only matter if .t-<tier> somehow isn't also applied; in practice it always is. */
.rank-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(155deg, var(--b3, var(--surface-3)), var(--b2, var(--surface-2)) 55%, var(--b1, var(--surface)));
  z-index: -1;
}
.en {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  overflow-wrap: break-word;
}
.chart-slot {
  padding: var(--sp3) var(--sp4);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r-lg) var(--r-lg);
  margin-top: -1px;
}
</style>
