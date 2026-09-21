<script setup lang="ts">
/**
 * A Kraft-Ränge grid card that's genuinely two full-size faces of ONE card, not a static header
 * with a rotating panel underneath. Earlier revisions of this card kept the exercise name in
 * ListCard.vue's own header (always visible, never rotating) and only flipped an inner content
 * div below it — which meant the back face was squeezed into a container smaller than the card's
 * actual footprint, and the interaction read as "expand and swap content inside the card" rather
 * than "the card turns over." This component drops ListCard entirely for the Kraft grid (it isn't
 * used for anything ListCard's drag-handle/menu/meta/footer slots provide) and makes the name part
 * of EACH face, so the whole card — identity included — is what rotates. Both faces get the exact
 * same full box (`.flip-face` fills `.rank-flip-card`'s own padded content area via `inset: 0`),
 * so the back face uses exactly as much space as the front, not a smaller nested container.
 *
 * `.rank-flip-card` itself carries `.card`/`surface-hybrid` (list-card.css/tokens.css) so it still
 * matches every other card grid's entrance animation, hover shadow, and tier-accent outline
 * (`.card-grid > .card`) — the two inner faces are plain positioned panes, not `.card`s themselves,
 * so they don't double up on that styling or break the grid's direct-child selectors.
 */
import RankExerciseBack from "./RankExerciseBack.vue";
import RankProgress from "./RankProgress.vue";

defineProps<{
  tier: string;
  division: number;
  lp: number;
  nextTargetWeightKg?: number | null;
  nextTargetReps?: number | null;
  trust?: "real" | "derived" | "synthetic";
  peakTier?: string | null;
  peakDivision?: number | null;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  flipped: boolean;
  /** Lazily true after the first flip — see RankLifterSection.vue's own comment on
   *  `activatedBacks` for why the back face isn't always mounted. */
  backActivated: boolean;
}>();
defineEmits<{ flip: []; stats: [] }>();
</script>

<template>
  <div class="rank-flip-card card surface-hybrid" :class="[`t-${tier}`, { flipped }]">
    <!-- No aria-label: the accessible name comes from this button's own visible text content
         (name, tier, LP, target fields), same as ListCard's own role="button" pattern — an
         explicit label here would override that and silently drop the tier/LP/target context a
         screen reader user gets for free otherwise. -->
    <div
      class="flip-face flip-face-front"
      role="button"
      tabindex="0"
      @click="$emit('flip')"
      @keydown.enter="$emit('flip')"
    >
      <b class="rfc-name">{{ name }}</b>
      <RankProgress
        variant="hero"
        :tier="tier"
        :division="division"
        :lp="lp"
        :next-target-weight-kg="nextTargetWeightKg"
        :next-target-reps="nextTargetReps"
        :trust="trust"
        :peak-tier="peakTier"
        :peak-division="peakDivision"
      />
    </div>
    <!-- Tappable to flip back, same as the front — there was no way back to the front except the
         explicit "Zurück" button before this; now the whole card is symmetric, tap it either way. -->
    <div
      v-if="backActivated"
      class="flip-face flip-face-back"
      role="button"
      tabindex="0"
      @click="$emit('flip')"
      @keydown.enter="$emit('flip')"
    >
      <b class="rfc-name">{{ name }}</b>
      <RankExerciseBack
        :tier="tier"
        :division="division"
        :lp="lp"
        :peak-tier="peakTier"
        :peak-division="peakDivision"
        :primary-muscles="primaryMuscles"
        :secondary-muscles="secondaryMuscles"
        @stats="$emit('stats')"
      />
    </div>
  </div>
</template>

<style scoped>
.rank-flip-card {
  position: relative;
  height: 380px;
  perspective: 1200px;
}
.flip-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp2);
  text-align: center;
  backface-visibility: hidden;
  transition: transform var(--dur-base) var(--ease-out);
}
.flip-face-front {
  transform: rotateY(0deg);
  cursor: pointer;
}
.flip-face-back {
  transform: rotateY(180deg);
  cursor: pointer;
}
.rank-flip-card.flipped .flip-face-front {
  transform: rotateY(180deg);
}
.rank-flip-card.flipped .flip-face-back {
  transform: rotateY(0deg);
}
.rfc-name {
  font-size: 15.5px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
@media (min-width: 900px) {
  .rfc-name {
    font-size: 18px;
  }
}
</style>
