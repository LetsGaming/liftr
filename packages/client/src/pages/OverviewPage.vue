<script setup lang="ts">
/**
 * Übersicht (feedback: "dashboard is basically useless, no clear use case"). Was a flat,
 * non-interactive, reverse-chron feed of every row titled "Workout". Rebuilt per the decided
 * direction — launchpad (what do I do today) *and* progress board (am I getting stronger),
 * stacked — reusing the same stores every other page already has (no new backend beyond the
 * history-route title/duration fixes in historyStore.ts):
 *
 *   1. Launchpad card — resume an in-progress workout, or one-tap start the most recently
 *      used routine. Uses useStartRoutine(), the same composable WorkoutPage.vue uses, so
 *      there's exactly one implementation of "start a workout," not two that can drift.
 *   2. Status strip — streak / level / this-week's workout count.
 *   3. Progress tiles — weekly volume (from already-loaded history), top ranks, bodyweight
 *      trend (BodyweightTrend.vue existed and was only ever wired into Profil).
 *   4. Recent activity — the old feed, now with real routine names (server fix), and workout
 *      rows open the past-workout detail modal instead of going nowhere.
 */
import { IonContent, IonHeader, IonPage, IonRefresher, IonRefresherContent, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import BodyweightTrend from "../components/ui/BodyweightTrend.vue";
import ErholungszoneCard from "../components/ui/ErholungszoneCard.vue";
import MuscleFigure from "../components/ui/MuscleFigure.vue";
import InfoToggle from "../components/ui/InfoToggle.vue";
import StatTile from "../components/ui/StatTile.vue";
import TierLadder from "../components/rank/TierLadder.vue";
import WorkoutClock from "../components/workout/WorkoutClock.vue";
import WorkoutDetail from "../components/workout/WorkoutDetail.vue";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../lib/tierIcons";
import { aggregateMuscles } from "../lib/muscles";
import { useExerciseName } from "../composables/useExerciseName";
import { useStartRoutine } from "../composables/useStartRoutine";
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
const { starting, startRoutine } = useStartRoutine();
const { exerciseName } = useExerciseName();

const openWorkoutId = ref<string | null>(null);
const openWorkoutTitle = ref<string | undefined>(undefined);

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
  // Phase 2 fix (engagement-audit-v3): used to drop the division ("SILBER III" -> "SILBER")
  // because the full label didn't fit a quarter-width mobile stat tile. That was a truncation
  // workaround, not a real fix — the division is real information (RankProgress.vue shows it
  // everywhere else) and dropping it silently made this tile the one place in the app that lies
  // by omission about the user's actual rank. The real fix was structural (.status-strip below:
  // 2x2 grid + wrapping value text), so the full label can come back here.
  if (!overallRank.loaded || !overallRank.current) return "—";
  const { tier, division } = overallRank.current;
  const label = TIER_LABEL_DE[tier as RankTier];
  const div = DIVISION_LABEL[division];
  return div ? `${label} ${div}` : label;
});

/** Erholungszone's CTA reuses the exact same one-tap start the launchpad card already offers
 *  (useStartRoutine) — a smarter "start the routine that trains these specific recovered
 *  muscles" match would need routine-to-muscle cross-referencing this component doesn't have;
 *  scoped honestly to "get the user into the workout flow", not a claim of that precision. */
function startFromReadiness() {
  if (suggestedRoutine.value) void startRoutine(suggestedRoutine.value);
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

/** Rework Phase 3 (critique finding: first launch renders six simultaneous empty states — four
 *  dashes, two "noch nicht genug Daten" — the first thing a gamified product shows is a wall of
 *  dashes). Once there's real history, the loaded dashboard (status strip, progress tiles,
 *  activity feed) is unchanged; before that, one first-run surface replaces all three: the
 *  Erholungszone card and launchpad CTA (already the app's best material) plus the full tier
 *  ladder as a single promise instead of eight negatives. */
const isFirstRun = computed(() => history.loaded && history.items.length === 0);

const topRanks = computed(() =>
  ranksStore.ranks
    .slice()
    .sort((a, b) => b.lp - a.lp)
    .slice(0, 3),
);

/** Critique finding (harden, P0): a failed store load used to leave its tile showing "—"
 *  forever, indistinguishable from "still fetching" — on a flaky connection, any subset of the
 *  status strip could go silently blank with zero indication anything was wrong. Each store now
 *  tracks its own `error` (see xpStore.ts's load()); this surfaces it as one page-level banner
 *  instead of restyling every individual tile into a three-state (loading/empty/failed) widget. */
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

        <!-- 0. Erholungszone — a reason to open the app on a rest day (engagement rework W5) -->
        <ErholungszoneCard :heat="readiness.heat" :recovered-slugs="readiness.recoveredSlugs" :loaded="readiness.loaded" @start="startFromReadiness" />

        <!-- 1. Launchpad -->
        <section class="launchpad">
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
              <!-- Muscle preview (feedback: show what a routine trains before starting it) —
                   same aggregation WorkoutPage.vue's routine cards use, replacing the plain
                   equipment-icon row which said nothing about what the routine actually trains. -->
              <MuscleFigure class="lp-muscles" :size="36" v-bind="suggestedRoutineMuscles" />
            </div>
            <button class="btn-primary btn-block" :disabled="starting" @click="startRoutine(suggestedRoutine)">
              {{ starting ? "Wird gestartet…" : "▶ Starten" }}
            </button>
            <!-- Critique finding (clarify, P2): suggestedRoutine is a stand-in for "last used"
                 (no lastUsedAt tracking exists yet — real fix needs a migration, out of scope
                 here), and the primary CTA started it with zero way to override. This is the
                 escape hatch: only shown when there's actually something else to switch to. -->
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
          <!-- 2. Status strip -->
          <section class="status-strip">
            <StatTile accent="fire" :value="streak.loaded ? streak.streak : '—'" label="🔥 Tage Serie" />
            <StatTile accent="blue" :value="xp.loaded ? `Lv. ${xp.level}` : '—'" label="Level" />
            <StatTile :value="thisWeek.count" label="Workouts diese Woche" />
            <StatTile reward :value="overallRankLabel" label="Gesamt&shy;rang" />
          </section>

          <!-- Critique finding (clarify, P1): "LP", "Gesamtrang" and division labels ("SILBER
               III") appeared with no in-context explanation, and the only onboarding hook fires
               once at mount — once dismissed, a first-timer had no path back to "what do these
               numbers mean." Same always-reachable mechanism as RanksPage.vue's own LP/trust
               explainer (InfoToggle.vue), not a second one-off tooltip. -->
          <div class="rank-terms">
            <InfoToggle label="Was bedeutet mein Rang?">
              <b>Gesamtrang</b> fasst deine Ränge über alle trainierten Übungen zu einem einzigen Wert
              zusammen. Jede Stufe hat mehrere Divisionen (z.&nbsp;B. „III“ bis „I“), die bis zur
              nächsten Beförderung runterzählen; <b class="tnum">LP</b> misst deinen Fortschritt
              innerhalb der aktuellen Division (0–100).
            </InfoToggle>
          </div>

          <!-- 3. Progress tiles -->
          <section class="progress-tiles">
            <div class="tile">
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

            <div class="tile">
              <div class="eyebrow tile-head">Nächster Rang</div>
              <p v-if="topRanks.length > 0" class="tile-empty">
                <b class="tnum">{{ Math.round(100 - topRanks[0]!.lp) }} LP</b> bis zum nächsten Rang in
                <b>{{ exerciseName(topRanks[0]!.slug) }}</b>
              </p>
              <p v-else class="tile-empty">Dein erster Rang entsteht, sobald du eine Übung geloggt hast.</p>
            </div>

            <div class="tile">
              <div class="eyebrow tile-head">Körpergewicht</div>
              <BodyweightTrend v-if="bodyweight.entries.length >= 2" :entries="bodyweight.entries" />
              <!-- Audit fix (workplan-v1 §1.10b): stated a threshold ("two entries") but never
                   the action or where to take it — unlike the Läufe empty state's actionable
                   pattern this now matches. -->
              <p v-else class="tile-empty">
                Trag dein Körpergewicht in Profil ein — nach zwei Einträgen siehst du hier den
                Verlauf.
              </p>
            </div>
          </section>
        </template>

        <!-- 4.5 Entdecken (engagement rework W9) — surfaces existing-but-buried features
             instead of leaving them only discoverable by digging through Profil/Ränge.
             Reuses the exact .progress-tiles/.tile card grid above, no new card styling.
             Note: a plate calculator ("🏋 Scheiben anzeigen") also exists, but only as an
             inline reveal inside SetEntry.vue tied to an in-progress set on WorkoutPage.vue
             — there is no standalone page/modal for it to link to, so per this phase's own
             anti-pattern guard ("don't build it if it doesn't already exist as a reachable
             feature") it's intentionally left out of this grid rather than inventing a new
             entry point for it. -->
        <section class="discover">
          <div class="eyebrow tile-head">Entdecken</div>
          <div class="progress-tiles">
            <router-link to="/profile" class="tile discover-tile">
              <div class="discover-icon">📦</div>
              <b>Daten-Export</b>
              <p class="tile-empty">Workouts, Sätze, Läufe &amp; Körpergewicht als CSV in einer ZIP-Datei — lesbar auch ohne Liftr</p>
            </router-link>
            <router-link to="/ranks" class="tile discover-tile">
              <div class="discover-icon">🏆</div>
              <b>Rang-Analyse</b>
              <p class="tile-empty">Rangverteilung &amp; Rangaufstiege über alle Übungen im Überblick</p>
            </router-link>
          </div>
        </section>

        <!-- 5. Recent activity -->
        <section v-if="!isFirstRun" class="activity">
          <div class="eyebrow tile-head">Letzte Aktivität</div>

          <p v-if="history.error" class="tile-empty">Keine Verbindung zum Server. Was du geloggt hast, ist lokal gespeichert.</p>
          <p v-else-if="history.loaded && history.items.length === 0" class="tile-empty">
            Hier landet ab dem ersten beendeten Workout alles, was du gemacht hast.
          </p>

          <ul v-else class="feed">
            <li v-for="item in history.items" :key="item.id" class="feed-row">
              <button
                class="feed-btn"
                :disabled="item.kind !== 'workout'"
                @click="item.kind === 'workout' && openWorkout(item.id, item.title)"
              >
                <span class="icon" :class="item.kind">{{ item.kind === "run" ? "🏃" : "🏋" }}</span>
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
/* Staggered entrance removed (motion audit, Phase 4 — 2026-09-02). Fired on every mount, i.e.
   every navigation to this tab: fails the decision framework's Q1 (mount-driven, not
   event-driven) and Q2 (an ambient tab you can revisit many times a session, not a <1x/session
   earned moment). A before/after screenshot shows nothing the static layout doesn't already
   convey (Q3), so per 0c's checklist this was decoration — cut entirely (0c's stated alternative,
   opacity-only at --dur-fast, was passed over since even that residual motion has no state
   change to communicate here) rather than retuned. See engagement-audit-v3.md Phase 4. */
@media (min-width: 900px) {
  .dashboard {
    max-width: var(--content-w-wide);
  }
  .progress-tiles {
    grid-template-columns: repeat(3, 1fr);
  }
}

.launchpad {
  padding: var(--sp4);
  border-radius: var(--r-xl);
  background: linear-gradient(155deg, var(--surface-3), var(--surface-2));
  border: 1px solid var(--line-2);
}
.lp-eyebrow {
  --eyebrow-color: var(--blue-hi);
  margin-bottom: var(--sp2);
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
/* Phase 2 fix (engagement-audit-v3): was a single 4-across row (grid-template-columns:
   repeat(auto-fit, minmax(80px, 1fr))) with the value forced to font-size:20px + white-space:
   nowrap — at a quarter-width ~90px mobile tile that guaranteed overflow for any tier label
   longer than a couple of characters (measured live at 390px: "FORTGESCHRITTEN" via
   overallRankLabel, TIER_LABEL_DE's longest entry, clipped hard past the tile edge). The prior
   fix for this was to truncate the label itself (dropping the division number) — a workaround
   that only bought headroom for shorter tier names, not the long ones. Real fix is structural:
   2x2 on mobile (each tile gets ~2x the width a 4-across row gave it) widening back to 4-across
   only once there's room (>=560px, comfortably past every phone width this app targets), plus
   letting the value wrap onto a second line at a smaller, responsive size instead of forcing one
   line that either fits or clips. */
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
.tile {
  padding: var(--sp4);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
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
.feed-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
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
</style>
