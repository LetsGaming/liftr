<script setup lang="ts">
// Ränge (plan Phase 2 / mockup #p-raenge): tiered rank cards + next-target, powered by
// @liftr/shared's resolveRank/nextLoadTarget running server-side (see rankEngine.ts) and
// cached into the `ranks` table. Never gated/paywalled (audit §3's explicit anti-pattern).
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { ordinal, type Tier } from "@liftr/shared";
import { computed, onMounted } from "vue";
import { LP_EXPLAINER } from "../copy/rankCopy";
import ProgressChart from "../components/rank/ProgressChart.vue";
import RankDistributionDonut from "../components/rank/RankDistributionDonut.vue";
import RankProgress from "../components/rank/RankProgress.vue";
import RankUpCalendar from "../components/rank/RankUpCalendar.vue";
import TierLadder from "../components/rank/TierLadder.vue";
import InfoToggle from "../components/ui/InfoToggle.vue";
import TruncatingLabel from "../components/ui/TruncatingLabel.vue";
import { useExerciseHistoryCache } from "../composables/useExerciseHistoryCache";
import { useExerciseName } from "../composables/useExerciseName";
import { useOverallRankStore } from "../stores/overallRankStore";
import { useRanksStore } from "../stores/ranksStore";

const ranksStore = useRanksStore();
const overallRank = useOverallRankStore();
onMounted(() => {
  void ranksStore.load();
  void overallRank.load();
});

const { exerciseName } = useExerciseName();
const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();

/** Critique finding (layout, P3): a flat auto-fill grid with no sort left the exercise closest
 *  to a rank-up buried wherever it happened to fall alphabetically/by-load-date. LP already *is*
 *  "how close to the next rank-up" (0-100 within the current band, see rankService.ts), so
 *  surfacing it as the default sort turns the grid from a wall of cards into "what to train
 *  next" — no new UI chrome, no filter control, just the existing signal used as reading order.
 *  Higher tier/division breaks ties so two exercises at the same LP don't shuffle on reload. */
const sortedRanks = computed(() =>
  ranksStore.ranks
    .slice()
    .sort((a, b) => b.lp - a.lp || ordinal(b.tier as Tier, b.division) - ordinal(a.tier as Tier, a.division)),
);

/** "LP" and the ≈ trust marker were never explained anywhere reachable on touch — the ≈'s only
 *  explanation was a `title` attribute, which doesn't exist on touch, the app's entire platform
 *  (critique finding). RankProgress's card variant already sits inside RanksPage's own
 *  `.rank-card` <button>, so a second interactive element inside RankProgress itself would be a
 *  nested <button> (invalid HTML/ARIA) — this disclosure lives once, here, at the top of the one
 *  page every rank card is reached from, instead of duplicated per-card. Mechanics now shared
 *  via InfoToggle.vue with OverviewPage's own jargon explainer (same critique, different screen). */
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Ränge</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <!-- Hero (rework Phase 3, critique finding: 36 tier tokens exist and reach exactly one
           screen; nowhere could a user see their position on the whole 9-tier ladder, only an
           isolated per-exercise band). Renders even with zero ranks yet — overallRank.current is
           null pre-first-workout, and TierLadder's own fallback lights Initiate in that case. -->
      <TierLadder
        :current-tier="overallRank.current?.tier ?? null"
        :current-division="overallRank.current?.division ?? null"
        :peak-tier="overallRank.peak?.tier ?? null"
        :peak-division="overallRank.peak?.division ?? null"
      />

      <router-link to="/records" class="btn-secondary" style="display: inline-flex; margin-top: var(--sp3)">
        🏆 Rekorde ansehen
      </router-link>

      <InfoToggle label="Pro Übung · echte Standards wo verfügbar, sonst abgeleitet — nichts gesperrt">
        <b class="tnum">LP</b> {{ LP_EXPLAINER }}. Ein
        <b>≈</b> markiert einen abgeleiteten oder geschätzten Standard statt eines echten Maximaltests —
        dein Rang bleibt trotzdem gültig, nur die Grundlage ist weniger exakt.
      </InfoToggle>

      <!-- Critique finding (harden, P1): all four data sources loaded with no skeleton/spinner —
           between mount and the /api/ranks response, this section was just empty space with
           nothing telling a user whether it was loading, genuinely empty, or broken. Same
           shimmer technique as ErholungszoneCard.vue's skeleton, sized to this section's real
           analytics-row + card-grid shape instead of one flat placeholder. -->
      <template v-if="!ranksStore.loaded && !ranksStore.error">
        <div class="rank-analytics" aria-hidden="true">
          <div class="rank-skel-tile"><div class="shimmer rank-skel-block" /></div>
          <div class="rank-skel-tile"><div class="shimmer rank-skel-block" /></div>
        </div>
        <div class="rank-grid">
          <div v-for="i in 4" :key="i" class="shimmer rank-skel-card" aria-hidden="true" />
        </div>
      </template>

      <p v-else-if="ranksStore.error" class="page-note load-error" style="margin-top: var(--sp4)">
        Ränge konnten nicht geladen werden. Was du geloggt hast, ist lokal gespeichert.
        <button type="button" class="btn-secondary" @click="ranksStore.load()">Erneut versuchen</button>
      </p>

      <template v-else>
        <p v-if="ranksStore.ranks.length === 0" class="page-note" style="margin-top: var(--sp4)">
          Dein erster Rang entsteht, sobald du eine Übung geloggt hast.
        </p>

        <div v-else class="rank-analytics">
          <RankDistributionDonut />
          <RankUpCalendar />
        </div>

        <div v-if="ranksStore.ranks.length > 0" class="rank-grid">
        <div v-for="r in sortedRanks" :key="r.exerciseId" class="rank-card-wrap" :class="`t-${r.tier}`">
          <button class="rank-card" :class="`t-${r.tier}`" @click="toggleExpand(r.exerciseId)">
            <TruncatingLabel class="en">{{ exerciseName(r.slug, r.name) }}</TruncatingLabel>
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
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-note {
  color: var(--dim);
}
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
/* Skeleton pieces — .shimmer (styles/motion.css) supplies the sweep, these give each piece the
   real content's approximate size/shape/background (same technique as ErholungszoneCard.vue). */
.rank-skel-tile {
  padding: var(--sp4);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  min-height: 140px;
  display: flex;
  align-items: center;
}
.rank-skel-block {
  width: 100%;
  height: 90px;
  border-radius: var(--r-md);
  background-color: var(--surface-3);
}
.rank-skel-card {
  height: 128px;
  border-radius: var(--r-lg);
  background-color: var(--surface-2);
  border: 1px solid var(--line);
}
.load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp3);
  /* Audit finding: unlike OverviewPage's equivalent banner (bounded by .dashboard's own
     max-width), this sits outside any width-constrained container — live-measured at 288
     chars/line on a wide viewport. Capped to the same 60ch craft-floor measure as
     InfoToggle.vue's .info-body, which had the identical bug. */
  max-width: 60ch;
}
.load-error .btn-secondary {
  padding: 8px 14px;
}
.rank-card-wrap {
  display: flex;
  flex-direction: column;
  /* Entrance stagger removed (motion audit, Phase 4 — 2026-09-02): matched the dashboard's, so
     it inherited the same fate — mount-driven on every visit to Ränge, not event-driven (0c's
     Q1), and a before/after screenshot shows nothing the static grid doesn't already convey
     (Q3). See OverviewPage.vue's .dashboard for the fuller rationale; engagement-audit-v3.md
     Phase 4. */
}
.rank-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  width: 100%;
  padding: var(--sp4);
  border-radius: var(--r-lg);
  /* Tier-accent rim, not a generic neutral hairline (visual-design fix: this border used to be
     the flat var(--line) every other utility surface uses, which barely registers against a
     saturated tier-gradient fill and reads as a leftover default rather than the medal's own
     edge). Same border source as tokens.css's .panel-reward (var(--b3, ...)) — the reward
     surface's rim is tier-colored everywhere else in the app; this card was the one holdout. */
  border: 1px solid var(--b3, var(--line));
  text-align: left;
  position: relative;
  overflow: hidden;
  /* A native <button> has its own opaque default background — without overriding it
     explicitly, that default paints over the ::after gradient below even at z-index:-1.
     Same root cause as the exercise-rail white-card bug (P0-A): always set a background
     explicitly on interactive elements, never rely on the pseudo-element alone. */
  background: transparent;
  transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out);
}
/* Always-dark fill regardless of theme (tier colors are always dark, by design — see
   tokens.css's `:root[data-theme="light"]` comment) — text inside must stay light-on-dark even
   when the page itself is in light mode. Overriding these three custom properties locally means
   every descendant that reads var(--text)/var(--dim)/var(--faint) inherits the right value
   automatically. Same pattern as tokens.css's .panel-reward. */
.rank-card {
  --text: #eef2fb;
  --dim: #b8c2e0;
  --faint: #98a2c0;
}
.rank-card:active {
  transform: scale(0.98);
}
/* Was a bespoke flat-black box-shadow found nowhere else in the app — tokens.css's own
   .panel-reward explicitly drops box-shadow on reward surfaces ("the reward surface doesn't
   need the fake elevation cue... its own saturation already separates it from the page") and
   the app's real hover language for a colored fill is a brightness lift (.btn-primary:hover
   uses the same filter). Matching that instead of inventing a new elevation value here. */
@media (hover: hover) {
  .rank-card:hover {
    filter: brightness(1.08);
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
  color: var(--text);
}
/* Live-verification finding (click-to-expand division chart): this used the app's generic flat
   --surface-2 utility panel color, which reads as an unrelated grey/blue box bolted under a
   saturated tier-gradient card — the single most jarring thing on the page, worse the higher the
   tier's saturation (most visible on gold/apprentice tiers). Fixed by tinting --surface-2 with a
   fraction of the card's own --b1 (its darkest fill stop) and giving the border the same --b3
   accent the card uses, so the panel reads as the same card tapering off rather than a foreign
   element. A flat 22% mix, not a full-strength gradient to --b1: this panel's own content
   (ProgressChart.vue) sets its text in --dim/--faint, contrast-checked against plain --surface-2
   — a full-strength --b1 fill (near-black on most tiers) would darken the panel enough to break
   that contrast, which a first pass of this fix did before catching it live in the browser. Still
   the tier system, not Nebula — no gradient hue introduced that isn't already part of the 9-tier
   metal palette this row's card is using. */
.chart-slot {
  padding: var(--sp3) var(--sp4);
  background: color-mix(in srgb, var(--b1, var(--surface-3)) 22%, var(--surface-2));
  border: 1px solid var(--b3, var(--line));
  border-top: none;
  border-radius: 0 0 var(--r-lg) var(--r-lg);
  margin-top: -1px;
}
</style>
