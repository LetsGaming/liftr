<script setup lang="ts">
// Ränge: tiered rank cards + next-target, powered by @liftr/shared's resolveRank/nextLoadTarget
// running server-side (see rankEngine.ts) and cached into the `ranks` table. Never
// gated/paywalled.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { ordinal, type Tier } from "@liftr/shared";
import { computed, onMounted } from "vue";
import { LP_EXPLAINER } from "../copy/rankCopy";
import ProgressChart from "../components/rank/ProgressChart.vue";
import RankDistributionDonut from "../components/rank/RankDistributionDonut.vue";
import RankProgress from "../components/rank/RankProgress.vue";
import RankUpCalendar from "../components/rank/RankUpCalendar.vue";
import TierLadder from "../components/rank/TierLadder.vue";
import AppIcon from "../components/ui/AppIcon.vue";
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

/** Sorted by LP descending so the exercise closest to a rank-up surfaces first, rather than
 *  falling wherever it lands alphabetically or by load-date. LP already *is* "how close to the
 *  next rank-up" (0-100 within the current band, see rankService.ts), so this turns the grid
 *  from a wall of cards into "what to train next" using the existing signal as reading order.
 *  Higher tier/division breaks ties so two exercises at the same LP don't shuffle on reload. */
const sortedRanks = computed(() =>
  ranksStore.ranks
    .slice()
    .sort((a, b) => b.lp - a.lp || ordinal(b.tier as Tier, b.division) - ordinal(a.tier as Tier, a.division)),
);

/** "LP" and the ≈ trust marker need an explanation reachable on touch — a `title` attribute
 *  (the ≈'s only prior explanation) doesn't exist on touch, the app's entire platform.
 *  RankProgress's card variant already sits inside RanksPage's own `.rank-card` <button>, so a
 *  second interactive element inside RankProgress itself would be a nested <button> (invalid
 *  HTML/ARIA) — this disclosure lives once, here, at the top of the one page every rank card is
 *  reached from, instead of duplicated per-card. Shares InfoToggle.vue with OverviewPage's own
 *  jargon explainer. */
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Ränge</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <!-- Hero: shows the user's position on the whole 9-tier ladder, not just an isolated
           per-exercise band. Renders even with zero ranks yet — overallRank.current is null
           pre-first-workout, and TierLadder's own fallback lights Initiate in that case. -->
      <TierLadder
        :current-tier="overallRank.current?.tier ?? null"
        :current-division="overallRank.current?.division ?? null"
        :peak-tier="overallRank.peak?.tier ?? null"
        :peak-division="overallRank.peak?.division ?? null"
      />

      <router-link to="/records" class="btn-secondary" style="display: inline-flex; margin-top: var(--sp3)">
        <AppIcon name="trophy" /> Rekorde ansehen
      </router-link>

      <InfoToggle label="Pro Übung · echte Standards wo verfügbar, sonst abgeleitet — nichts gesperrt">
        <b class="tnum">LP</b> {{ LP_EXPLAINER }}. Ein
        <b>≈</b> markiert einen abgeleiteten oder geschätzten Standard statt eines echten Maximaltests —
        dein Rang bleibt trotzdem gültig, nur die Grundlage ist weniger exakt.
      </InfoToggle>

      <!-- Skeleton for the gap between mount and the /api/ranks response, so this section never
           reads as empty space with no indication of loading/empty/broken. Same shimmer
           technique as ErholungszoneCard.vue's skeleton, sized to this section's real
           analytics-row + card-grid shape instead of one flat placeholder. -->
      <template v-if="!ranksStore.loaded && !ranksStore.error">
        <div class="rank-analytics" aria-hidden="true">
          <div class="rank-skel-tile surface-hybrid"><div class="shimmer rank-skel-block" /></div>
          <div class="rank-skel-tile surface-hybrid"><div class="shimmer rank-skel-block" /></div>
        </div>
        <div class="rank-grid">
          <div v-for="i in 4" :key="i" class="shimmer rank-skel-card surface-hybrid" aria-hidden="true" />
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
/* Skeleton pieces — .shimmer (styles/motion.css) supplies the sweep; `.surface-hybrid`
   (tokens.css) puts a loading Ränge screen on the same translucent/hairline system as the loaded
   content it stands in for, rather than reverting to flat --surface-2 while data is in flight.
   `.surface-hybrid` supplies background/blur/shadow + the ::after hairline; border-radius/sizing
   stay local since the utility deliberately doesn't set border-radius (it needs to work on
   differently-shaped hosts). */
.rank-skel-tile {
  padding: var(--sp4);
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
}
.load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp3);
  /* Unlike OverviewPage's equivalent banner (bounded by .dashboard's own max-width), this sits
     outside any width-constrained container — unbounded, a wide viewport stretches this to
     hundreds of characters per line. Capped to the same 60ch measure as InfoToggle.vue's
     .info-body. */
  max-width: 60ch;
}
.load-error .btn-secondary {
  padding: 8px 14px;
}
.rank-card-wrap {
  display: flex;
  flex-direction: column;
  /* No entrance stagger here, same as OverviewPage.vue's .dashboard: mount-driven on every visit
     to Ränge rather than event-driven, and a static grid already conveys everything the
     animation would. */
}
.rank-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  width: 100%;
  padding: var(--sp4);
  border-radius: var(--r-lg);
  /* Tier-accent rim, not a generic neutral hairline: the flat var(--line) every other utility
     surface uses would barely register against a saturated tier-gradient fill and would read as
     a generic default rather than the medal's own edge. Same border source as tokens.css's
     .panel-reward (var(--b3, ...)) — the reward surface's rim is tier-colored everywhere else in
     the app, and this card matches that. */
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
/* tokens.css's .panel-reward drops box-shadow on reward surfaces (their own saturation already
   separates them from the page), and the app's hover language for a colored fill is a
   brightness lift (.btn-primary:hover uses the same filter) — matching that here instead of
   inventing a bespoke elevation shadow. */
@media (hover: hover) {
  .rank-card:hover {
    filter: brightness(1.08);
  }
}
/* Full-card vivid tier gradient — the reward screen should be the most colourful surface in the
   app, not a dark card with a faint tint at the top. Fallbacks only matter if .t-<tier> somehow
   isn't also applied; in practice it always is. This is the tier-badge/reward system, not a
   generic panel, so it deliberately does not use .surface-hybrid/the gradient-hairline recipe —
   tier cards keep their existing metal/medal-derived fill as-is: rank reads as earned status,
   never brand decoration. `.rank-card`'s own `background: transparent` above (the documented
   <button>-opaque-default gotcha this ::after's comment already names) is required for the tier
   gradient to paint correctly through this ::after in both themes, even with the sibling
   .chart-slot below using backdrop-filter: blur. */
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
/* This panel visually fuses with .rank-card's own bottom border above it via `margin-top: -1px`
   (the seam disappears where the two flat 1px lines overlap). The generic .surface-hybrid/.panel
   hairline (mask-composite gradient via ::after, see tokens.css's .surface-hybrid) would draw a
   ring on all four edges uniformly, sitting right on top of that seam and showing as a visible
   parting line — so this element gets its own ::after with asymmetric mask padding instead: 0 at
   the top, 1px on the other three sides. The mask-composite technique subtracts a content-box
   inset from the border-box; a 0px inset on one side makes content-box and border-box coincide
   there, so the ring's width degenerates to zero exactly on that edge while staying a normal 1px
   hairline on the rest. The card above still supplies the seam's only visible line (its own
   bottom border), so the fusion still works. (`.rank-card-wrap` carries the tier class so this
   panel could be tinted toward the card's own tier color instead of the neutral surface-hybrid
   fill, but the neutral fill stays — the asymmetric-mask hairline above already solves the seam
   problem on its own.) */
.chart-slot {
  position: relative;
  padding: var(--sp3) var(--sp4);
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  box-shadow: var(--surface-hybrid-shadow);
  border-radius: 0 0 var(--r-lg) var(--r-lg);
  margin-top: -1px;
}
.chart-slot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  /* Asymmetric mask padding: 0 top / 1px right,bottom,left — see comment above. Shorthand order
     is top, horizontal, bottom (3-value form) so this reads as "no ring at top, 1px elsewhere". */
  padding: 0 1px 1px;
  background: var(--surface-hybrid-edge-grad);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
</style>
