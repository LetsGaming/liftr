<script setup lang="ts">
/**
 * Generic two-sided flip-card shell: genuinely two full-size faces of ONE card, not a static
 * header with a rotating panel underneath. Earlier revisions kept the card's name in ListCard's
 * own header (always visible, never rotating) and only flipped an inner content div below it —
 * which meant the back face was squeezed into a container smaller than the card's actual
 * footprint, and the interaction read as "expand and swap content inside the card" rather than
 * "the card turns over." This drops ListCard entirely (it isn't used for anything ListCard's
 * drag-handle/menu/meta/footer slots provide) and makes the name part of EACH face, so the whole
 * card — identity included — is what rotates. Both faces get the exact same full box (`.flip-face`
 * fills `.rank-flip-card`'s own padded content area via `inset: 0`), so the back face uses exactly
 * as much space as the front, not a smaller nested container.
 *
 * Shared by both Ränge grids via the `front`/`back` slots — RankLifterSection.vue (Kraft) puts a
 * hero RankProgress in front and RankExerciseBack (trained muscles) behind; RankRunnerSection.vue
 * (Läufe) puts the same hero RankProgress in front and RankRunBack (personal-best readout) behind.
 * Used to be Kraft-only (RankFlipCard's own name is what's left of that), with the Läufe grid
 * hand-rolling a flat, non-flipping card instead (RankCategoryCard.vue) — this is the one shell
 * both use now, so the two grids read as the same design language, not two drifting ones.
 *
 * `.rank-flip-card` itself carries `.card`/`surface-hybrid` (list-card.css/tokens.css) so it still
 * matches every other card grid's entrance animation, hover shadow, and tier-accent outline
 * (`.card-grid > .card`) — the two inner faces are plain positioned panes, not `.card`s themselves,
 * so they don't double up on that styling or break the grid's direct-child selectors.
 */
withDefaults(
  defineProps<{
    name: string;
    /** Null for a card with no rank yet (e.g. a running category never raced) — renders with no
     *  tier-accent outline/wash, same as an untiered `.card` elsewhere in the app. */
    tier: string | null;
    flipped: boolean;
    /** Lazily true after the first flip — see RankLifterSection.vue's own comment on
     *  `activatedBacks` for why the back face isn't always mounted. */
    backActivated: boolean;
    /** False for a card with nothing to flip to (no rank yet) — renders the front face as a plain
     *  non-interactive pane instead of a tappable one, so a card that can never show a back face
     *  doesn't look tappable and silently do nothing when tapped. */
    flippable?: boolean;
  }>(),
  { flippable: true },
);
defineEmits<{ flip: [] }>();
</script>

<template>
  <div class="rank-flip-card card surface-hybrid" :class="[tier ? `t-${tier}` : '', { flipped }]">
    <!-- No aria-label: the accessible name comes from this button's own visible text content
         (name, tier, LP, target fields), same as ListCard's own role="button" pattern — an
         explicit label here would override that and silently drop the tier/LP/target context a
         screen reader user gets for free otherwise. -->
    <div
      class="flip-face flip-face-front"
      :role="flippable ? 'button' : undefined"
      :tabindex="flippable ? 0 : undefined"
      :class="{ 'flip-face-inert': !flippable }"
      @click="flippable && $emit('flip')"
      @keydown.enter="flippable && $emit('flip')"
    >
      <b class="rfc-name">{{ name }}</b>
      <div class="rfc-content">
        <slot name="front" />
      </div>
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
      <div class="rfc-content">
        <slot name="back" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rank-flip-card {
  position: relative;
  height: 380px;
  perspective: 1200px;
  /* `.card`'s own padding (list-card.css) never actually applies here: `.flip-face` below is
     `position: absolute; inset: 0`, and an absolutely-positioned child's containing block is its
     ancestor's PADDING box — so inset:0 fills flush with the padding's own outer edge, covering
     it entirely rather than sitting inside it. Zeroed here (not just dead weight) so it's not
     read as "the padding" by anyone editing this file — `.flip-face` carries the real one. */
  padding: 0;
}
.flip-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* flex-start, not center: both faces put the title first, but front/back content below it
     differs in height. Centering the whole stack would put the title at a different y on each
     face. Pinning it to a fixed top offset and letting `.rfc-content` (flex: 1) center only the
     part that varies keeps the title height identical on both faces — the two faces mirror each
     other (same title row, same content-centering rule), not just share a component. */
  justify-content: flex-start;
  /* Same padding `.card` would have given this box, had `.rank-flip-card`'s own padding not been
     neutralized by `inset: 0` above — the hero bar/back-face rank row were rendering flush
     against the card's rounded edge without this. */
  padding: var(--sp4);
  gap: var(--sp2);
  text-align: center;
  backface-visibility: hidden;
  transition: transform var(--dur-base) var(--ease-out);
}
@media (min-width: 900px) {
  .flip-face {
    padding: var(--sp6);
  }
}
.rfc-content {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp2);
}
.flip-face-front {
  transform: rotateY(0deg);
  cursor: pointer;
}
.flip-face-front.flip-face-inert {
  cursor: default;
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
