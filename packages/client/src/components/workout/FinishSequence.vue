<script setup lang="ts">
/**
 * Post-workout reward sequence (engagement rework W4). Replaces the old single flat summary
 * card — duration/volume/sets were shown, but the session's actual *earned* signals (rank-ups,
 * streak, XP/level) were computed and then silently discarded (see WorkoutPage.vue's old
 * finishWorkout(): prCount hardcoded to 0, rankUps hardcoded to []). Three timed beats, each
 * skippable by a tap, each optional if there's nothing to show — never manufacture a reward.
 * No new currencies: rank/streak/XP all already existed, this only makes them felt at the one
 * moment they were being thrown away.
 */
import { computed, onMounted, ref, watch } from "vue";
import { TIERS, type Tier } from "@liftr/shared";
import { useCelebrate } from "../../composables/useCelebrate";
import { useCountUp } from "../../composables/useCountUp";
import { haptics } from "../../lib/haptics";
import { DIVISION_LABEL, TIER_BADGE_PATH, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";

export interface RankUpSummary {
  exerciseName: string;
  tier: string;
  division: number;
  isPr: boolean;
  lp: number;
  prevLp: number;
  /** Rank engine v2 gap fix (workstream B task 2): set when this exercise's rank-up came from a
   *  plausibility-flagged session — never states exact numbers (same PLAUSIBILITY_NOTE_DE copy
   *  useWorkoutFinish.ts's sessionCaptions already uses). Global constraint: a flagged rank-up
   *  must never render identically to a genuine one — see the template below. */
  plausibilityNote: string | null;
}
export interface StreakDay {
  label: string;
  active: boolean;
}

const props = defineProps<{
  rankUps: RankUpSummary[];
  streak: number;
  streakDays: StreakDay[];
  tokensRemaining: number;
  sessionXp: number;
  levelBefore: number;
  levelAfter: number;
  /** 0-100, the level bar's fill *before* this session's XP was added. */
  progressBefore: number;
  /** 0-100, the level bar's fill *after* — if levelAfter > levelBefore this is progress into
   *  the new level, not a continuation of the old bar (the bar resets at a level-up). */
  progressAfter: number;
}>();
const emit = defineEmits<{ done: [] }>();

const celebrate = useCelebrate();
const leveledUp = computed(() => props.levelAfter > props.levelBefore);

/** Rework Phase 4 (critique finding: .finish-seq had no background, no color, no shadow — the
 *  emotional climax of the app rendered as centered text on plain --bg). Highest tier among this
 *  session's *genuine* rank-ups stages the whole sequence's background; a discounted-only session
 *  (workstream B task 2 — Global Constraint: a discounted session must never look genuine) falls
 *  back to the same neutral surface ramp as a session with no rank-ups at all. */
const topTierClass = computed(() => {
  const genuine = props.rankUps.filter((r) => !r.plausibilityNote);
  if (genuine.length === 0) return "";
  const top = genuine.reduce((best, r) => (TIERS.indexOf(r.tier as Tier) > TIERS.indexOf(best.tier as Tier) ? r : best));
  return `t-${top.tier}`;
});

// Both roll-ups are driven by plain refs (not computeds derived straight from props): a
// computed target that already equals its final value at mount never fires useCountUp's
// `watch(target, ...)` (nothing changes), so it would render the final number instantly with
// no animation at all. Instead both start at 0/before and only get retargeted to their real
// value once beat 3 actually activates — that retarget is what triggers the roll-up.
const xpRollTarget = ref(0);
const { value: xpDisplay } = useCountUp(xpRollTarget, 700);
const barPercentTarget = ref(0);
const { value: barPercent } = useCountUp(barPercentTarget, 700);
watch(
  () => celebrate.activeIndex.value,
  (i) => {
    if (i === 2) {
      xpDisplay.value = 0;
      barPercent.value = leveledUp.value ? 0 : props.progressBefore;
      requestAnimationFrame(() => {
        xpRollTarget.value = props.sessionXp;
        barPercentTarget.value = props.progressAfter;
      });
      if (leveledUp.value) void haptics.success();
    }
  },
);

onMounted(() => {
  void celebrate.run([
    { show: props.rankUps.length > 0, holdMs: 1800 },
    { show: true, holdMs: 1600 },
    { show: true, holdMs: 1800 },
  ]);
});

watch(
  () => celebrate.running.value,
  (running, wasRunning) => {
    if (wasRunning && !running) emit("done");
  },
);
</script>

<template>
  <!-- celebrate.skip() only short-circuits the wait for the CURRENTLY active beat (see
       useCelebrate.ts's run() loop) — a tap advances exactly one beat, it does not skip the
       whole sequence. aria-label reflects that; do not rename this back to "Überspringen"
       without re-reading useCelebrate.ts, the two read very differently to a screen reader. -->
  <div
    class="finish-seq"
    :class="topTierClass"
    role="button"
    tabindex="0"
    aria-label="Nächster Schritt"
    @click="celebrate.skip()"
    @keydown.enter="celebrate.skip()"
    @keydown.space.prevent="celebrate.skip()"
  >
    <!-- Beat 1: Rangaufstiege — omitted entirely when the session had none. -->
    <div v-if="celebrate.activeIndex.value === 0" class="beat pop-in">
      <div class="eyebrow beat-eyebrow">Rangaufstiege</div>
      <div class="rankup-list">
        <div
          v-for="(r, i) in rankUps"
          :key="i"
          class="rankup-row panel-reward pop-in"
          :class="[`t-${r.tier}`, { discounted: r.plausibilityNote }]"
          :style="{ animationDelay: i * 90 + 'ms' }"
        >
          <span :class="r.plausibilityNote ? 'badge-ring-muted' : 'badge-ring'">
            <span class="badge" :class="`t-${r.tier}`">
              <svg viewBox="0 0 24 24"><path :d="TIER_BADGE_PATH[r.tier as RankTier]" /></svg>
            </span>
          </span>
          <div class="rankup-meta">
            <b>{{ r.exerciseName }}</b>
            <span>{{ r.isPr ? "Neuer Rekord" : `${TIER_LABEL_DE[r.tier as RankTier]} ${DIVISION_LABEL[r.division]}` }}</span>
            <span v-if="r.plausibilityNote" class="plausibility-note">{{ r.plausibilityNote }}</span>
            <div class="rankbar">
              <i class="bar-fill" :style="{ transform: `scaleX(${Math.round(r.lp) / 100})` }" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Beat 2: Serie — the 7-day dot strip, plain days vs. active-with-flame. A day is marked
         "active" purely from that day's logged history, not a full re-derivation of the
         protection-token walk (streak.ts's own math already runs server-side for the number
         itself) — good enough to show the week's shape, not a claim of exact token attribution. -->
    <div v-else-if="celebrate.activeIndex.value === 1" class="beat pop-in">
      <div class="streak-num tnum">{{ streak }} 🔥</div>
      <div class="eyebrow beat-eyebrow">Trainingsserie</div>
      <div class="streak-strip">
        <div v-for="(d, i) in streakDays" :key="i" class="streak-day">
          <span class="dot" :class="{ active: d.active }">{{ d.active ? "🔥" : "" }}</span>
          <span class="dl">{{ d.label }}</span>
        </div>
      </div>
      <p v-if="tokensRemaining > 0" class="streak-note">Deine Serie übersteht noch {{ tokensRemaining }} Ruhetage.</p>
    </div>

    <!-- Beat 3: Fortschritt — session XP rolls up into the level bar; a level-up gets the
         shared stamp-in treatment (motion.css) instead of a plain number change. -->
    <div v-else-if="celebrate.activeIndex.value === 2" class="beat pop-in">
      <div class="eyebrow beat-eyebrow">Fortschritt</div>
      <div class="xp-line tnum">+{{ Math.round(xpDisplay) }} XP</div>
      <div v-if="leveledUp" class="level-up stamp-in">LEVEL {{ levelAfter }}!</div>
      <div v-else class="level-line tnum">Lv. {{ levelAfter }}</div>
      <div class="rankbar level-bar">
        <i class="bar-fill" :style="{ transform: `scaleX(${barPercent / 100})` }" />
      </div>
    </div>

    <!-- Was "Tippen zum Überspringen" (tap to skip) — a tap only advances the current beat
         (see the comment on the root element above), so "skip" overstated what happens on
         beats 1-2 and was simply wrong copy for a 3-beat sequence a user might want to slow
         down on, not escape. -->
    <p class="skip-hint">Weiter tippen →</p>
  </div>
</template>

<style scoped>
/* Was no background/color/shadow at all — the emotional climax of the app rendered as centered
   text on plain --bg (critique finding). Tier-gradient wash, scoped to the session's highest
   rank-up (topTierClass); falls back to the neutral surface ramp when there were none this
   session (e.g. a session with only XP, no rank-ups). */
.finish-seq {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp3);
  padding: var(--sp5) var(--sp4);
  border-radius: var(--r-xl);
  background: linear-gradient(180deg, var(--b1, var(--surface-2)) 0%, var(--bg) 85%);
}
.beat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--sp3);
  /* Motion audit (Phase 4 — 2026-09-02): each beat only ever mounts once per completed workout
   *  (<1x/session by a wide margin, 0c's Q2), unlike the generic .pop-in class it inherits
   *  duration from (motion.css, tuned for routine list entrances). This is the protected core
   *  the audit says to invest in, not cut from — override to the earned-moment token so the
   *  post-workout reveal gets the full --dur-cele budget instead of sharing --dur-base with
   *  ordinary UI. --ease-spring was already correct (inherited from .pop-in). */
  animation-duration: var(--dur-cele);
}
.beat-eyebrow {
  --eyebrow-color: var(--fire-hi);
}
.rankup-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
/* Background/border come from .panel-reward (tokens.css) — was the same flat --surface-2 recipe
   every other panel in the app used, on the one row that's actually showing you the reward. */
.rankup-row {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  border-radius: var(--r-md);
  padding: var(--sp3);
  text-align: left;
  /* Same reasoning as .beat above: a rank-up row is a rare, earned reveal (one per rank-up this
   *  session, at most a handful), so it earns --dur-cele over the generic .pop-in's --dur-base. */
  animation-duration: var(--dur-cele);
}
/* Was 32x36px — the most important reward in a rank-ladder product rendered as a 32px hexagon on
   a gray row (critique finding). --glow-blue (tokens.css) is a box-shadow value and gets clipped
   away by .badge's own clip-path if applied directly; drop-shadow follows the clipped hex shape
   correctly instead, at the same blue/intensity. */
.rankup-row .badge {
  width: 56px;
  height: 62px;
  flex: none;
  filter: drop-shadow(0 0 10px rgba(59, 140, 255, 0.55)) drop-shadow(0 0 3px rgba(59, 140, 255, 0.4));
}
/* Nebula ring (nebula-and-workplan-rework task 8) — this rank-up beat (Beat 1, activeIndex===0)
   is the one place in the app a rank-up is actually celebrated; the ring wraps only this
   render site's .badge instances, not RankProgress.vue's shared card (Ränge grid, in-session
   focus column, post-sequence plausibility/recovery captions) or TierLadder.vue's resting-state
   ladder. Structurally absent (not just hidden) outside this v-for — there is no boolean toggle
   guarding it that a plausibility-discounted or same-band-recovery session could also satisfy. */
.badge-ring {
  display: inline-block;
  flex: none;
  padding: 3px;
  border-radius: 2px;
  background: var(--nebula-grad);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}
/* Muted counterpart to .badge-ring (workstream B task 2 — Global Constraint: a plausibility-
   discounted session must never be visually indistinguishable from a genuine rank-up). Flat
   --surface-3 instead of the Nebula brand gradient — deliberately the one place in this beat
   that does NOT get the gradient treatment. */
.badge-ring-muted {
  display: inline-block;
  flex: none;
  padding: 3px;
  border-radius: 2px;
  background: var(--surface-3);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}
/* Discounted row: desaturated + slightly dimmed, so it reads as "happened, but muted" rather
   than a full celebration — paired with .badge-ring-muted above and the plausibility-note line
   below. */
.rankup-row.discounted {
  filter: grayscale(0.55);
  opacity: 0.85;
}
.plausibility-note {
  font-size: 11px;
  font-style: italic;
  color: var(--dim);
}
.rankup-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12.5px;
}
.rankup-meta span {
  color: var(--dim);
  font-size: 11.5px;
}
.rankup-meta .rankbar {
  height: 5px;
  margin-top: 2px;
}
.streak-num {
  font-size: 40px;
  font-weight: 800;
  font-family: var(--font-display);
}
.streak-strip {
  display: flex;
  gap: var(--sp2);
}
.streak-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  font-size: 14px;
}
.dot.active {
  background: linear-gradient(160deg, var(--fire-hi), var(--fire));
}
.dl {
  font-size: 11px;
  color: var(--faint);
}
.streak-note {
  font-size: 12px;
  color: var(--dim);
}
.xp-line {
  font-size: 34px;
  font-weight: 800;
  font-family: var(--font-display);
  color: var(--pr);
}
.level-line {
  font-size: 16px;
  color: var(--dim);
}
.level-up {
  font-size: 22px;
  font-weight: 800;
  font-family: var(--font-display);
  color: var(--blue-hi);
}
.level-bar {
  width: 200px;
  max-width: 80%;
  height: 9px;
}
.skip-hint {
  text-align: center;
  font-size: 11px;
  color: var(--faint);
}
</style>
