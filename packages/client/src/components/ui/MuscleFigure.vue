<script setup lang="ts">
/**
 * Anatomical front+back muscle figure (plan Phase 3.1), rebuilt on wger's own real anatomical
 * assets (mirrored once by `pnpm ingest --muscles` into /images/muscles/, never hotlinked at
 * runtime). This replaced an earlier hand-drawn 9-region-per-side blob version: that approach
 * couldn't express which specific muscle (e.g. "Pectoralis major" vs. a generic "chest" blob)
 * was trained, and its region-to-class mapping had already drifted from what it was meant to
 * represent. wger's assets are a base body outline (Wikimedia Commons, CC-BY-SA 3.0) plus 15
 * individually-shaped, individually-named muscle overlays — exactly the "clear visible
 * distinction, wger-style" bar this was rebuilt to meet. See AttributionsPage.vue for credit.
 *
 * Rendering is plain layered <img> tags, not inlined/recolored SVG-in-DOM: the mirrored files
 * are pre-recolored once at ingest time (see packages/ingest/src/ingestMuscleAssets.ts), so no
 * runtime SVG manipulation is needed — simpler and cheaper than fetching+inlining+restyling.
 */
import { computed } from "vue";
import { apiBase } from "../../lib/api";
import { MUSCLE_META } from "../../lib/muscles";

const props = withDefaults(
  defineProps<{
    primary?: string[];
    secondary?: string[];
    /** slug -> 0..1 readiness (engagement rework W5, readinessStore.heat). When set, this
     *  overrides the primary/secondary trained-muscle rendering entirely and instead paints
     *  every known muscle warm (fatigued) or cool (recovered) — the Erholungszone hero's mode,
     *  not the "what did this session train" mode every other call site uses. */
    heat?: Record<string, number>;
    /** Width in px of each front/back figure (default 96, matching the original hardcoded
     *  size) — routine-card / launchpad previews use a smaller size so the figure fits
     *  alongside an exercise-name list instead of dominating the card. */
    size?: number;
  }>(),
  { primary: () => [], secondary: () => [], size: 96 },
);

interface Overlay {
  id: number;
  variant: "main" | "secondary" | "fatigue";
  opacity?: number;
}

function trainedOverlaysFor(side: "front" | "back"): Overlay[] {
  const wantFront = side === "front";
  const out: Overlay[] = [];
  for (const slug of props.primary) {
    const meta = MUSCLE_META[slug];
    if (meta && meta.front === wantFront) out.push({ id: meta.id, variant: "main" });
  }
  for (const slug of props.secondary) {
    if (props.primary.includes(slug)) continue; // primary wins if both lists somehow disagree
    const meta = MUSCLE_META[slug];
    if (meta && meta.front === wantFront) out.push({ id: meta.id, variant: "secondary" });
  }
  return out;
}

/** heat mode: every muscle renders, warm (fatigue asset) below the halfway readiness point,
 *  cool (main/blue asset) above it — opacity scales with how far into that half the value sits,
 *  so a just-trained muscle reads as strongly warm and a nearly-recovered one as faintly warm,
 *  rather than a hard flip at exactly 0.5. */
function heatOverlaysFor(side: "front" | "back"): Overlay[] {
  const wantFront = side === "front";
  const out: Overlay[] = [];
  for (const [slug, readiness] of Object.entries(props.heat ?? {})) {
    const meta = MUSCLE_META[slug];
    if (!meta || meta.front !== wantFront) continue;
    if (readiness < 0.5) {
      out.push({ id: meta.id, variant: "fatigue", opacity: 0.45 + 0.55 * (1 - readiness * 2) });
    } else {
      out.push({ id: meta.id, variant: "main", opacity: 0.35 + 0.55 * ((readiness - 0.5) * 2) });
    }
  }
  return out;
}

const frontOverlays = computed(() => (props.heat ? heatOverlaysFor("front") : trainedOverlaysFor("front")));
const backOverlays = computed(() => (props.heat ? heatOverlaysFor("back") : trainedOverlaysFor("back")));
</script>

<template>
  <div class="muscle-figure" :style="{ '--fig-w': size + 'px' }">
    <div class="fig">
      <img class="body" :src="`${apiBase()}/images/muscles/front-body.svg`" alt="Vorderansicht" />
      <img
        v-for="o in frontOverlays"
        :key="`f-${o.variant}-${o.id}`"
        class="overlay"
        :style="o.opacity != null ? { opacity: o.opacity } : undefined"
        :src="`${apiBase()}/images/muscles/${o.variant}/muscle-${o.id}.svg`"
        alt=""
      />
    </div>
    <div class="fig">
      <img class="body" :src="`${apiBase()}/images/muscles/back-body.svg`" alt="Rückansicht" />
      <img
        v-for="o in backOverlays"
        :key="`b-${o.variant}-${o.id}`"
        class="overlay"
        :style="o.opacity != null ? { opacity: o.opacity } : undefined"
        :src="`${apiBase()}/images/muscles/${o.variant}/muscle-${o.id}.svg`"
        alt=""
      />
    </div>
  </div>
</template>

<style scoped>
.muscle-figure {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.fig {
  position: relative;
  width: var(--fig-w, 96px);
  aspect-ratio: 200 / 362;
}
.fig img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.fig .overlay {
  pointer-events: none;
  transition: opacity var(--dur-slow) var(--ease-out);
}
</style>
