<script setup lang="ts">
/**
 * Übersicht — both a launchpad (what do I do today) and a progress board (am I getting
 * stronger), stacked, reusing the same stores every other page already has:
 *
 *   1. Launchpad card — resume an in-progress workout, or open the Routine Overview screen for
 *      the most recently used routine. All three start call sites (here, RoutineList.vue's
 *      routine card, ErholungszoneCard) route through there rather than calling
 *      useStartRoutine() directly, so a lifter always sees what they're about to do first.
 *   2. Status strip — streak / level / this-week's workout count.
 *   3. Progress tiles — weekly volume (from already-loaded history), top ranks, bodyweight
 *      trend.
 *   4. Recent activity — a feed of past workouts and runs; rows open the past-item detail modal.
 */
import { IonContent, IonHeader, IonPage, IonRefresher, IonRefresherContent, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "../components/ui/AppIcon.vue";
import BodyweightTrend from "../components/ui/BodyweightTrend.vue";
import ErholungszoneCard from "../components/ui/ErholungszoneCard.vue";
import MuscleFigure from "../components/ui/MuscleFigure.vue";
import InfoToggle from "../components/ui/InfoToggle.vue";
import StatTile from "../components/ui/StatTile.vue";
import RunDetail from "../components/run/RunDetail.vue";
import TierLadder from "../components/rank/TierLadder.vue";
import WorkoutClock from "../components/workout/WorkoutClock.vue";
import WorkoutDetail from "../components/workout/WorkoutDetail.vue";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../lib/tierIcons";
import { aggregateMuscles } from "../lib/muscles";
import { LP_EXPLAINER } from "../copy/rankCopy";
import { useExerciseName } from "../composables/useExerciseName";
import { useActiveWorkoutStore } from "../stores/activeWorkoutStore";
import { useBodyweightStore } from "../stores/bodyweightStore";
import { useCatalogStore } from "../stores/catalogStore";
import { useHistoryStore } from "../stores/historyStore";
import { useOverallRankStore } from "../stores/overallRankStore";
import { useRanksStore } from "../stores/ranksStore";
import { useReadinessStore } from "../stores/readinessStore";
import { useRoutineStore } from "../stores/routineStore";
import { useStreakStore } from "../stores/streakStore";
import { useXpStore } from "../stores/xpStore";

const history = useHistoryStore();
const xp = useXpStore();
const streak = useStreakStore();
const routineStore = useRoutineStore();
const activeWorkout = useActiveWorkoutStore();
const ranksStore = useRanksStore();
const overallRank = useOverallRankStore();
const bodyweight = useBodyweightStore();
const catalog = useCatalogStore();
const readiness = useReadinessStore();
const { exerciseName } = useExerciseName();
const router = useRouter();

const openWorkoutId = ref<string | null>(null);
const openWorkoutTitle = ref<string | undefined>(undefined);
/** "Letzte Aktivität" run rows are tappable, opening RunDetail.vue as a sheet — the same
 *  treatment workout rows get via WorkoutDetail.vue — so every row in the feed is a real
 *  interactive element rather than an inert one. Reuses runsStore.loadDetail()/RunReplay.vue,
 *  which RunsPage.vue also relies on for the same detail view. */
const openRunId = ref<string | null>(null);

onMounted(() => {
  void history.load();
  void routineStore.load();
  void activeWorkout.restore();
  void ranksStore.load();
  void bodyweight.load();
  void catalog.load();
  void readiness.load();
  void overallRank.load();
});

const overallRankLabel = computed(() => {
  // The division ("SILBER III") is real information (RankProgress.vue shows it everywhere
  // else), so this shows the full label rather than dropping it to fit the tile — .status-strip
  // below (2x2 grid + wrapping value text) handles the width instead.
  if (!overallRank.loaded || !overallRank.current) return "—";
  const { tier, division } = overallRank.current;
  const label = TIER_LABEL_DE[tier as RankTier];
  const div = DIVISION_LABEL[division];
  return div ? `${label} ${div}` : label;
});

/** Erholungszone's CTA routes through the Routine Overview screen instead of starting the
 *  workout directly, the same as the other two start sites (launchpad card,
 *  RoutineList.vue's routine card). A smarter "start the routine that trains these specific
 *  recovered muscles" match would need routine-to-muscle cross-referencing this component
 *  doesn't have; scoped honestly to "get the user into the workout flow", not that precision. */
function startFromReadiness() {
  if (suggestedRoutine.value) void router.push(`/routines/${suggestedRoutine.value.id}`);
}

async function onRefresh(ev: CustomEvent) {
  await Promise.all([history.load(), routineStore.load(), ranksStore.load()]);
  (ev.target as HTMLIonRefresherElement).complete();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function xpLabel(item: { kind: string; meta: Record<string, unknown> }) {
  if (item.kind !== "workout" || !xp.showXp) return "";
  const v = item.meta.xp as number | undefined;
  return v != null && v > 0 ? `+${v} XP` : "";
}
function volumeLabel(item: { kind: string; meta: Record<string, unknown> }) {
  if (item.kind !== "workout") return "";
  const v = item.meta.volumeKg as number | undefined;
  return v != null ? `${Math.round(v).toLocaleString("de-DE")} kg` : "";
}
function runLabel(item: { kind: string; meta: Record<string, unknown> }) {
  if (item.kind !== "run") return "";
  const km = (item.meta.distanceM as number | undefined) ?? 0;
  return `${(km / 1000).toFixed(2)} km`;
}

function openWorkout(itemId: string, title: string | null) {
  openWorkoutId.value = itemId;
  openWorkoutTitle.value = title ?? undefined;
}

function openRun(itemId: string) {
  openRunId.value = itemId;
}

/** "Last touched" isn't tracked per routine today (would need a lastUsedAt column) — the
 *  first saved routine is a reasonable stand-in for "the one you'd tap anyway" without adding
 *  a migration for this dashboard alone. */
const suggestedRoutine = computed(() => routineStore.routines[0] ?? null);

/** Same aggregation as WorkoutPage.vue's routine-card preview (lib/muscles.ts's shared
 *  helper) — the launchpad card should answer "what does this train" too, not just name+count. */
const suggestedRoutineMuscles = computed(() =>
  aggregateMuscles((suggestedRoutine.value?.routineExercises ?? []).map((re) => catalog.byId(re.exerciseId)?.muscles ?? [])),
);

/** Workouts finished in the last 7 days, from whatever history is already loaded (no extra
 *  fetch) — good enough for "are you keeping up this week", not a precise calendar-week stat. */
const thisWeek = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const items = history.items.filter((i) => i.kind === "workout" && new Date(i.at).getTime() >= cutoff);
  const volumeKg = items.reduce((sum, i) => sum + ((i.meta.volumeKg as number | undefined) ?? 0), 0);
  return { count: items.length, volumeKg };
});

/** Per-week volume bars from currently loaded history — a real trend once >20 workouts exist
 *  would need paginated fetch; this reads what's already on screen, which is enough to answer
 *  "is this week better or worse than the last few", not a precise multi-month chart. */
const weeklyVolume = computed(() => {
  const buckets = new Map<number, number>();
  const now = Date.now();
  for (const i of history.items) {
    if (i.kind !== "workout") continue;
    const weeksAgo = Math.floor((now - new Date(i.at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAgo < 0 || weeksAgo > 7) continue;
    buckets.set(weeksAgo, (buckets.get(weeksAgo) ?? 0) + ((i.meta.volumeKg as number | undefined) ?? 0));
  }
  // oldest -> newest, 8 buckets (this week + previous 7)
  return Array.from({ length: 8 }, (_, i) => buckets.get(7 - i) ?? 0);
});
const maxWeeklyVolume = computed(() => Math.max(1, ...weeklyVolume.value));

/** The bar chart had no way to tell what a given bar meant beyond "taller = more" — no
 *  labels, nothing happened on tap or hover. Tapping (or hovering, on desktop) a bar now
 *  shows its week + kg value in a caption underneath; defaults to the current week. */
const selectedWeekIndex = ref(7);
function weekLabel(i: number) {
  const weeksAgo = 7 - i;
  return weeksAgo === 0 ? "Diese Woche" : weeksAgo === 1 ? "Letzte Woche" : `Vor ${weeksAgo} Wochen`;
}

/** Without this, first launch renders six simultaneous empty states — four dashes, two "noch
 *  nicht genug Daten" — a wall of dashes as the first thing a gamified product shows. Once
 *  there's real history, the loaded dashboard (status strip, progress tiles, activity feed) is
 *  unchanged; before that, one first-run surface replaces all three: the Erholungszone card and
 *  launchpad CTA (already the app's best material) plus the full tier ladder as a single promise
 *  instead of eight negatives. */
const isFirstRun = computed(() => history.loaded && history.items.length === 0);

const topRanks = computed(() =>
  ranksStore.ranks
    .slice()
    .sort((a, b) => b.lp - a.lp)
    .slice(0, 3),
);

/** A failed store load would otherwise leave its tile showing "—" forever, indistinguishable
 *  from "still fetching" — on a flaky connection, any subset of the status strip could go
 *  silently blank with zero indication anything was wrong. Each store tracks its own `error`
 *  (see xpStore.ts's load()); this surfaces it as one page-level banner instead of restyling
 *  every individual tile into a three-state (loading/empty/failed) widget. */
const hasLoadError = computed(
  () =>
    streak.error ||
    xp.error ||
    overallRank.error ||
    ranksStore.error ||
    bodyweight.error ||
    readiness.error ||
    routineStore.error ||
    history.error,
);

function retryFailed() {
  if (streak.error) void streak.load();
  if (xp.error) void xp.load();
  if (overallRank.error) void overallRank.load();
  if (ranksStore.error) void ranksStore.load();
  if (bodyweight.error) void bodyweight.load();
  if (readiness.error) void readiness.load();
  if (routineStore.error) void routineStore.load();
  if (history.error) void history.load();
}

</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Übersicht</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <IonRefresher slot="fixed" @ion-refresh="onRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <div class="dashboard">
        <div v-if="hasLoadError" class="load-error-banner">
          <span>Einige Daten konnten nicht geladen werden. Was du geloggt hast, ist lokal gespeichert.</span>
          <button type="button" class="btn-secondary" @click="retryFailed">Erneut versuchen</button>
        </div>

        <!-- Erholungszone -->
        <ErholungszoneCard class="tile--priority" :heat="readiness.heat" :recovered-slugs="readiness.recoveredSlugs" :loaded="readiness.loaded" :can-start="!!suggestedRoutine" @start="startFromReadiness" />

        <!-- Launchpad -->
        <section class="launchpad tile--priority surface-hybrid">
          <template v-if="activeWorkout.isActive">
            <div class="eyebrow lp-eyebrow">Weiter machen</div>
            <div class="lp-row">
              <div class="lp-info">
                <b>{{ activeWorkout.routineName || "Workout" }}</b>
                <span>{{ activeWorkout.progressLabel }}</span>
              </div>
              <WorkoutClock />
            </div>
            <router-link to="/workout" class="btn-primary btn-block">Zum Workout →</router-link>
          </template>
          <template v-else-if="suggestedRoutine">
            <div class="eyebrow lp-eyebrow">Bereit für heute?</div>
            <div class="lp-row">
              <div class="lp-info">
                <b>{{ suggestedRoutine.name }}</b>
                <span>{{ suggestedRoutine.routineExercises.length }} {{ suggestedRoutine.routineExercises.length === 1 ? "Übung" : "Übungen" }}</span>
              </div>
              <MuscleFigure class="lp-muscles" :size="36" v-bind="suggestedRoutineMuscles" />
            </div>
            <button class="btn-primary btn-block" @click="router.push(`/routines/${suggestedRoutine.id}`)">
              <AppIcon name="play" /> Starten
            </button>
            <!-- suggestedRoutine is a stand-in for "last used" (no lastUsedAt tracking exists
                 yet); shown only when there's actually something else to switch to. -->
            <router-link v-if="routineStore.routines.length > 1" to="/workout" class="lp-swap">Andere Routine wählen →</router-link>
          </template>
          <template v-else>
            <div class="eyebrow lp-eyebrow">Noch keine Routine</div>
            <p class="lp-hint">Ohne Routine kein Rang — eine Routine legt fest, welche Übungen du wiederholt trainierst.</p>
            <router-link to="/workout" class="btn-secondary btn-block">Erste Routine anlegen →</router-link>
          </template>
        </section>

        <!-- First-run: one promise (the whole ladder, Initiate lit) instead of the loaded
             dashboard's four stat dashes + two "noch nicht genug Daten" tiles at once. -->
        <section v-if="isFirstRun" class="first-run-ladder panel">
          <div class="eyebrow tile-head">Deine Rangleiter</div>
          <TierLadder :current-tier="null" :current-division="null" />
        </section>

        <template v-else>
          <!-- Status strip -->
          <section class="status-strip">
            <StatTile accent="fire" :value="streak.loaded ? streak.streak : '—'">
              <template #label><AppIcon name="flame" /> Tage Serie</template>
            </StatTile>
            <StatTile accent="blue" :value="xp.loaded ? `Lv. ${xp.level}` : '—'" label="Level" />
            <StatTile :value="thisWeek.count" label="Workouts diese Woche" />
            <StatTile reward :value="overallRankLabel" label="Gesamt&shy;rang" />
          </section>

          <div class="rank-terms">
            <InfoToggle label="Was bedeutet mein Rang?">
              <b>Gesamtrang</b> fasst deine Ränge über alle trainierten Übungen zu einem einzigen Wert
              zusammen. Jede Stufe hat mehrere Divisionen (z.&nbsp;B. „III“ bis „I“), die bis zur
              nächsten Beförderung runterzählen; <b class="tnum">LP</b> {{ LP_EXPLAINER }}.
            </InfoToggle>
          </div>

          <!-- Progress tiles -->
          <section class="progress-tiles">
            <div class="tile surface-hybrid">
              <div class="eyebrow tile-head">Volumen (8 Wochen)</div>
              <template v-if="weeklyVolume.some((v) => v > 0)">
                <div class="volume-bars">
                  <button
                    v-for="(v, i) in weeklyVolume"
                    :key="i"
                    type="button"
                    class="volume-bar"
                    :class="{ current: i === 7, selected: i === selectedWeekIndex }"
                    :style="{ height: `${Math.max(4, (v / maxWeeklyVolume) * 100)}%` }"
                    :title="`${weekLabel(i)}: ${Math.round(v).toLocaleString('de-DE')} kg`"
                    :aria-label="`${weekLabel(i)}: ${Math.round(v).toLocaleString('de-DE')} kg`"
                    @click="selectedWeekIndex = i"
                    @mouseenter="selectedWeekIndex = i"
                  />
                </div>
                <div class="volume-caption">
                  <span>{{ weekLabel(selectedWeekIndex) }}</span>
                  <b class="tnum">{{ Math.round(weeklyVolume[selectedWeekIndex] ?? 0).toLocaleString("de-DE") }} kg</b>
                </div>
              </template>
              <p v-else class="tile-empty">Ab dem zweiten Trainingstag zeichnet sich hier deine Volumenkurve ab.</p>
            </div>

            <div class="tile surface-hybrid">
              <div class="eyebrow tile-head">Nächster Rang</div>
              <p v-if="topRanks.length > 0" class="tile-empty">
                <b class="tnum">{{ Math.round(100 - topRanks[0]!.lp) }} LP</b> bis zum nächsten Rang in
                <b>{{ exerciseName(topRanks[0]!.slug) }}</b>
              </p>
              <p v-else class="tile-empty">Dein erster Rang entsteht, sobald du eine Übung geloggt hast.</p>
            </div>

            <div class="tile surface-hybrid">
              <div class="eyebrow tile-head">Körpergewicht</div>
              <BodyweightTrend v-if="bodyweight.entries.length >= 2" :entries="bodyweight.entries" />
              <p v-else class="tile-empty">
                Trag dein Körpergewicht in Profil ein — nach zwei Einträgen siehst du hier den
                Verlauf.
              </p>
            </div>
          </section>
        </template>

        <!-- Entdecken: surfaces existing-but-buried features, reusing the .progress-tiles/.tile
             grid above. A plate calculator also exists as an inline reveal in SetEntry.vue, but
             has no standalone page/modal to link to, so it's left out of this grid. -->
        <section class="discover">
          <div class="eyebrow tile-head">Entdecken</div>
          <div class="progress-tiles">
            <router-link to="/ranks" class="tile discover-tile surface-hybrid">
              <div class="discover-icon"><AppIcon name="trophy" /></div>
              <b>Rang-Analyse</b>
              <p class="tile-empty">Rangverteilung &amp; Rangaufstiege über alle Übungen im Überblick</p>
            </router-link>
          </div>
        </section>

        <!-- Recent activity -->
        <section v-if="!isFirstRun" class="activity">
          <div class="eyebrow tile-head">Letzte Aktivität</div>

          <p v-if="history.error" class="tile-empty">Keine Verbindung zum Server. Was du geloggt hast, ist lokal gespeichert.</p>
          <p v-else-if="history.loaded && history.items.length === 0" class="tile-empty">
            Hier landet ab dem ersten beendeten Workout alles, was du gemacht hast.
          </p>

          <ul v-else class="feed">
            <li v-for="item in history.items" :key="item.id" class="feed-row">
              <button
                class="feed-btn surface-hybrid"
                @click="item.kind === 'workout' ? openWorkout(item.id, item.title) : openRun(item.id)"
              >
                <span class="icon" :class="item.kind"><AppIcon :name="item.kind === 'run' ? 'running' : 'dumbbell'" /></span>
                <div class="meta">
                  <b>{{ item.title ?? (item.kind === "run" ? "Lauf" : "Workout") }}</b>
                  <span>{{ formatDate(item.at) }}</span>
                </div>
                <div class="value tnum">
                  {{ item.kind === "workout" ? volumeLabel(item) : runLabel(item) }}
                  <span v-if="xpLabel(item)" class="xp-sub">{{ xpLabel(item) }}</span>
                </div>
              </button>
            </li>
          </ul>

          <button v-if="history.nextCursor" class="btn-secondary btn-block" :disabled="history.loadingMore" @click="history.loadMore()">
            {{ history.loadingMore ? "Lädt…" : "Mehr laden" }}
          </button>
        </section>
      </div>

      <WorkoutDetail v-if="openWorkoutId" :workout-id="openWorkoutId" :title="openWorkoutTitle" @close="openWorkoutId = null" />
      <RunDetail v-if="openRunId" :run-id="openRunId" @close="openRunId = null" />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--sp5);
  max-width: var(--content-w-standard);
  margin: var(--sp4) auto 0;
}
/* No entrance animation here deliberately: this fires on every mount, i.e. every navigation to
   this tab — an ambient tab revisited many times a session, not a rare earned moment, so motion
   here would be decoration rather than communicating a state change. */
@media (min-width: 900px) {
  .dashboard {
    max-width: var(--content-w-wide);
  }
  .progress-tiles {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Uses .surface-hybrid (see template) for the background. The "priority" highlight (this card +
   ErholungszoneCard) layers as an outline on top of the hybrid surface via the shared
   .tile--priority rule below, rather than overriding the hybrid background with a flat one. */
.launchpad {
  padding: var(--sp4);
  border-radius: var(--r-xl);
}
.lp-eyebrow {
  --eyebrow-color: var(--blue-hi);
  margin-bottom: var(--sp2);
}
/* --blue-hi (#5ba0ff) measures ~2.66:1 against the light-mode hybrid surface's near-white
   background — under the 4.5:1 AA floor for this 11px/800-weight eyebrow text (too
   small/light-weight to qualify as "large text" at the lower 3:1 threshold). --nebula-ink is the
   token this codebase uses everywhere else for a light-on-light-mode accent (see
   .tile--priority's own light-mode override above) — 6.34:1 against white, comfortably AA. */
[data-theme="light"] .lp-eyebrow {
  --eyebrow-color: var(--nebula-ink);
}
.lp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  margin-bottom: var(--sp3);
}
.lp-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lp-info b {
  font-size: 18px;
}
.lp-info span {
  font-size: 12px;
  color: var(--dim);
}
.lp-muscles {
  flex: none;
}
.lp-hint {
  font-size: 13px;
  color: var(--dim);
  margin-bottom: var(--sp3);
}
/* Same "loud but not destructive" tone as RankProgress.vue's decay caption (--fire-hi) — a
   failed load is a real problem worth noticing, not a --red-level (delete-btn) emergency. */
.load-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
  padding: var(--sp3) var(--sp4);
  border-radius: var(--r-md);
  border: 1px solid var(--fire-hi);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
}
.load-error-banner .btn-secondary {
  flex: none;
  padding: 8px 14px;
}
.lp-swap {
  display: block;
  text-align: center;
  margin-top: var(--sp3);
  font-size: 12.5px;
  color: var(--dim);
}
/* .panel (tokens.css) supplies background/border/radius. */
.first-run-ladder {
  padding: var(--sp4);
}
/* 2x2 on mobile so each tile gets ~2x the width a 4-across row would give it — a 4-across row at
   ~90px per tile clips the longest tier label ("FORTGESCHRITTEN" via overallRankLabel,
   TIER_LABEL_DE's longest entry). Widens back to 4-across only once there's room (>=560px,
   comfortably past every phone width this app targets); the value also wraps onto a second line
   at a smaller, responsive size instead of forcing one line that either fits or clips. */
.status-strip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp2);
}
.status-strip :deep(.stat-tile) {
  text-align: center;
}
.status-strip :deep(.stat-tile b) {
  font-size: clamp(14px, 4.2vw, 20px);
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  line-height: 1.15;
}
@media (min-width: 560px) {
  .status-strip {
    grid-template-columns: repeat(4, 1fr);
  }
}

.progress-tiles {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sp3);
}
/* `.panel` (tokens.css) supplies the translucent hybrid background, blur, and gradient hairline
   — the same treatment every other panel on this page (StatTile, RankProgress, TierLadder,
   launchpad, etc.) uses; padding/layout below is local to this element. */
.tile {
  padding: var(--sp4);
  border-radius: var(--r-lg);
}
/* Shared "priority" accent (ErholungszoneCard's root + .launchpad above). An outline composes on
   top of .surface-hybrid's own background/shadow/hairline instead of competing with them for the
   same box-shadow/background property. */
.tile--priority {
  outline: 1px solid var(--nebula-1);
  outline-offset: -1px;
}
[data-theme="light"] .tile--priority {
  outline-color: var(--nebula-ink);
}
.tile-head {
  --eyebrow-color: var(--dim);
  margin-bottom: var(--sp3);
}
.tile-empty {
  color: var(--dim);
  font-size: 12.5px;
}
.volume-bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 64px;
}
.volume-bar {
  flex: 1;
  min-height: 4px;
  border-radius: 4px 4px 0 0;
  background: var(--surface-3);
  border: none;
  padding: 0;
}
.volume-bar.current {
  background: linear-gradient(180deg, var(--blue-hi), var(--blue));
}
.volume-bar.selected:not(.current) {
  background: var(--line-2);
}
.volume-caption {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: var(--sp2);
  padding-top: var(--sp2);
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--dim);
}
.volume-caption b {
  color: var(--text);
  font-size: 14px;
}
.top-ranks {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.top-rank {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.badge.small {
  width: 30px;
  height: 34px;
}
.tr-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tr-meta b {
  font-size: 13px;
}
.tr-meta span {
  font-size: 11px;
  color: var(--dim);
}

.discover-tile {
  color: inherit;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: transform var(--dur-fast) var(--ease-out);
}
.discover-tile:active {
  transform: scale(0.98);
}
.discover-icon {
  font-size: 22px;
  margin-bottom: var(--sp2);
}
.discover-tile b {
  font-size: 14px;
}

.activity {
  padding-bottom: var(--sp4);
}
.feed {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
/* Same .surface-hybrid treatment as .tile above. */
.feed-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-lg);
  color: var(--text);
  text-align: left;
}
.feed-btn:disabled {
  cursor: default;
}
.meta b {
  color: var(--text);
}
.icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface-3);
  flex: none;
}
.meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.meta span {
  font-size: 12px;
  color: var(--dim);
}
.value {
  font-weight: 700;
  font-size: 14px;
  text-align: right;
  flex: none;
}
.xp-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 700;
  color: var(--blue-hi);
}
/* Same --blue-hi-on-white contrast failure as .lp-eyebrow above (~2.66:1), same fix. */
[data-theme="light"] .xp-sub {
  color: var(--nebula-ink);
}
</style>
