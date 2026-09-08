<script setup lang="ts">
/**
 * A small persistent (non-modal) pendingCount/flushing indicator, animating
 * queued -> syncing-pulse -> settle — gives offline confidence rather than blocking.
 *
 * Reads syncStore.ts directly (pendingCount/flushing are already tracked reactively there,
 * no store changes needed) — same self-contained "mount it, it reads its own store" shape as
 * ToastHost.vue. Deliberately a tiny corner dot/badge, not a banner or toast: it must never
 * block or cover tappable content.
 *
 * Three states:
 *  - idle:    pendingCount === 0 && !flushing -> a small, quickly-fading checkmark dot.
 *  - queued:  pendingCount > 0 && !flushing   -> a small count badge (no animation — nothing
 *             is happening right now, just "N queued").
 *  - syncing: flushing === true                -> pulsing via the existing .shimmer utility
 *             (styles/motion.css), reusing the same technique as WorkoutPage.vue's
 *             .rank-skeleton.shimmer instead of adding a new keyframe.
 */
import { computed } from "vue";
import { useSyncStore } from "../../stores/syncStore";

const sync = useSyncStore();

const state = computed<"idle" | "queued" | "syncing">(() => {
  if (sync.flushing) return "syncing";
  if (sync.pendingCount > 0) return "queued";
  return "idle";
});
</script>

<template>
  <div class="sync-indicator" :class="`is-${state}`" :data-sync-state="state" aria-hidden="true">
    <span v-if="state === 'syncing'" class="sync-dot sync-dot-syncing shimmer" />
    <span v-else-if="state === 'queued'" class="sync-badge">{{ sync.pendingCount }}</span>
    <span v-else class="sync-dot sync-dot-idle" />
  </div>
</template>

<style scoped>
/* Deliberately tiny — a corner dot/badge, never a banner. pointer-events: none so it can never
   intercept a tap even if a future layout tweak overlaps it with something tappable.
   In normal flow (not absolutely positioned) so it can never be laid on top of a sibling by
   construction: it was originally `position: absolute; top/right: var(--sp2)` anchored to
   `.rail-col`, but `.rail-col` has no padding, so that claimed corner was the exact same corner
   WorkoutClock.vue's own pause/resume `.icon-btn` occupies, and the indicator visually covered a
   real, frequently-used tappable control. Rendering it as its own full-width row above
   WorkoutClock, right-aligned via `justify-content: flex-end`, keeps it small/unobtrusive/
   corner-aligned while guaranteeing its box never overlaps a sibling's box. */
.sync-indicator {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: var(--sp2);
  pointer-events: none;
}
.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
/* Idle: a subtle "synced" presence, not an alert — low-contrast, no motion. */
.sync-dot-idle {
  background: var(--dim);
  opacity: 0.35;
}
/* Syncing: the shared shimmer sweep (motion.css) stands in for a pulse instead of a new
   keyframe. Sized/colored here; .shimmer only supplies the animated gradient. */
.sync-dot-syncing {
  width: 10px;
  height: 10px;
  background-color: var(--blue-hi, var(--dim));
}
.sync-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 10px;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
}
</style>
