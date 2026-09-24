<script setup lang="ts">
/**
 * One Läufe-grid card. Used to be a flat, non-flipping card (RankProgress's compact "card"
 * variant, a static name+medal header) while the Kraft grid's cards flipped to a muscles-trained
 * back face — two visibly different designs for what's supposed to read as one rank system. Now
 * built on the same RankFlipCard shell the Kraft grid uses: the same hero-variant front face, and
 * a back face (RankRunBack.vue) showing this category's personal best instead of muscles, the
 * closest running equivalent of "something extra worth flipping to." A category never raced
 * (`row` is null) renders with `flippable="false"` — there's nothing to flip to yet.
 */
import type { RunRankRow } from "../../stores/runRankStore";
import RankFlipCard from "./RankFlipCard.vue";
import RankProgress from "./RankProgress.vue";
import RankRunBack from "./RankRunBack.vue";
import EmptyNote from "../base/EmptyNote.vue";

withDefaults(
  defineProps<{
    name: string;
    row: RunRankRow | null;
    nextTargetLabel?: string | null;
    /** Trust shown when `row.trust` is null — categories default to "real" (a real running
     *  standards table), single-speed activities (Gehen/Wandern) default to "synthetic". */
    trustFallback?: "real" | "derived" | "synthetic";
    emptyNote?: string;
    flipped: boolean;
    /** Lazily true after the first flip — see RankLifterSection.vue's own comment on
     *  `activatedBacks` for why the back face isn't always mounted. */
    backActivated: boolean;
    /** This category's personal best, pre-formatted by the caller (RankRunnerSection.vue already
     *  has to pick the right source — a "time" PR for a distance category, a "speed" PR for a
     *  single-speed activity — and the right formatter for each; no reason to duplicate that
     *  choice here). Null when there's no PR yet for this category. */
    prLabel?: string | null;
    prDate?: string | null;
  }>(),
  { nextTargetLabel: null, trustFallback: "real", emptyNote: "", prLabel: null, prDate: null },
);
defineEmits<{ flip: [] }>();
</script>

<template>
  <RankFlipCard
    :name="name"
    :tier="row?.tier ?? null"
    :flipped="flipped"
    :back-activated="backActivated"
    :flippable="row != null"
    @flip="$emit('flip')"
  >
    <template #front>
      <RankProgress
        v-if="row"
        variant="hero"
        :tier="row.tier"
        :division="row.division"
        :lp="row.lp"
        :next-target-label="nextTargetLabel"
        :trust="row.trust ?? trustFallback"
        :peak-tier="row.peakTier"
        :peak-division="row.peakDivision"
      />
      <EmptyNote v-else class="run-rank-empty-note">{{ emptyNote }}</EmptyNote>
    </template>
    <template #back>
      <RankRunBack
        v-if="row"
        :tier="row.tier"
        :division="row.division"
        :lp="row.lp"
        :peak-tier="row.peakTier"
        :peak-division="row.peakDivision"
        :pr-label="prLabel"
        :pr-date="prDate"
      />
    </template>
  </RankFlipCard>
</template>

