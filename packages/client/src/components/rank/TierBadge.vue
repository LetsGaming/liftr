<script setup lang="ts">
/**
 * The rank medal — "Orbit": a segmented ring + Liftr's own logomark, escalating wings from Stufe 4.
 * Geometry lives in lib/tierEmblem.ts (shared with shareCard.ts's canvas port and the raw badge
 * markup in WorkoutPage.vue/OverviewPage.vue — this component is the only place that shape list
 * actually gets turned into SVG elements). Pulled out of RankProgress.vue so the Ränge grid cards
 * (RankLifterSection.vue/RankRunnerSection.vue) can put it in ListCard's own #badge slot instead of
 * nesting the whole RankProgress readout there.
 *
 * `small` hides the sub-2px tier-progress tick under the mark for badges under ~36px (the rank
 * ladder, list rows) — it does NOT hide wings. Wings render at every size now; callers with tight
 * horizontal room (TierLadder.vue's rung-row) are responsible for giving them space, not this
 * component.
 */
import { computed, useId } from "vue";
import { buildTierEmblem, EMBLEM_VIEWBOX, type EmblemShape } from "../../lib/tierEmblem";
import { tierLabel, type RankTier } from "../../lib/tierIcons";

const props = withDefaults(defineProps<{ tier: string; small?: boolean }>(), { small: false });

const idPrefix = `te-${useId()}-`;
const emblem = computed(() => buildTierEmblem(props.tier as RankTier, { small: props.small, idPrefix }));

const linearGradients = computed(() => emblem.value.gradients.filter((g) => g.kind === "linear"));
const radialGradients = computed(() => emblem.value.gradients.filter((g) => g.kind === "radial"));

/** Maps a shape record to the exact attributes its SVG tag needs — deliberately explicit rather
 *  than a generic v-bind spread, because SVG multi-word attributes are kebab-case
 *  (`stroke-width`, not `strokeWidth`) and `shape.kind` itself must never land on the DOM. */
function shapeAttrs(shape: EmblemShape): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if ("fill" in shape && shape.fill !== undefined) attrs.fill = shape.fill;
  if ("stroke" in shape && shape.stroke !== undefined) attrs.stroke = shape.stroke;
  if ("strokeWidth" in shape && shape.strokeWidth !== undefined) attrs["stroke-width"] = shape.strokeWidth;
  if ("opacity" in shape && shape.opacity !== undefined) attrs.opacity = shape.opacity;
  switch (shape.kind) {
    case "polygon":
      attrs.points = shape.points;
      break;
    case "path":
      attrs.d = shape.d;
      break;
    case "circle":
      attrs.cx = shape.cx;
      attrs.cy = shape.cy;
      attrs.r = shape.r;
      break;
    case "ellipse":
      attrs.cx = shape.cx;
      attrs.cy = shape.cy;
      attrs.rx = shape.rx;
      attrs.ry = shape.ry;
      if (shape.transform) attrs.transform = shape.transform;
      break;
    case "line":
      attrs.x1 = shape.x1;
      attrs.y1 = shape.y1;
      attrs.x2 = shape.x2;
      attrs.y2 = shape.y2;
      break;
    case "rect":
      attrs.x = shape.x;
      attrs.y = shape.y;
      attrs.width = shape.width;
      attrs.height = shape.height;
      if (shape.rx !== undefined) attrs.rx = shape.rx;
      break;
  }
  return attrs;
}
</script>

<template>
  <svg class="tier-emblem" :class="`t-${tier}`" :viewBox="EMBLEM_VIEWBOX" role="img" style="overflow: visible">
    <title>{{ tierLabel(tier as RankTier) }}</title>
    <defs>
      <linearGradient
        v-for="g in linearGradients"
        :id="g.id"
        :key="g.id"
        gradientUnits="userSpaceOnUse"
        x1="18"
        y1="2"
        x2="110"
        y2="126"
      >
        <stop offset="0" :stop-color="g.kind === 'linear' ? g.from : ''" />
        <stop offset="1" :stop-color="g.kind === 'linear' ? g.to : ''" />
      </linearGradient>
      <radialGradient v-for="g in radialGradients" :id="g.id" :key="g.id">
        <stop offset="0" :stop-color="g.kind === 'radial' ? g.color : ''" :stop-opacity="g.kind === 'radial' ? g.fromOpacity : 0" />
        <stop offset="1" :stop-color="g.kind === 'radial' ? g.color : ''" stop-opacity="0" />
      </radialGradient>
    </defs>
    <!-- Explicit per-tag branches, not <component :is="tagName">: a dynamic :is for a NATIVE SVG
         element name bypasses the SFC compiler's own SVG-namespace detection (it only recognizes
         literal tags like <polygon>/<path> at compile time), which can render the wrong element
         type in some environments and corrupt Vue's patch algorithm on the next re-render —
         reproduced in tests as an intermittent "Cannot read properties of null (reading
         'nextSibling')" crash the moment `tier`/`small` changed after first mount. Literal tags
         per kind, keyed and typed per-shape, side-step the whole class of bug. -->
    <template v-for="(shape, i) in emblem.shapes" :key="i">
      <polygon v-if="shape.kind === 'polygon'" v-bind="shapeAttrs(shape)" shape-rendering="geometricPrecision" />
      <path v-else-if="shape.kind === 'path'" v-bind="shapeAttrs(shape)" shape-rendering="geometricPrecision" />
      <circle v-else-if="shape.kind === 'circle'" v-bind="shapeAttrs(shape)" shape-rendering="geometricPrecision" />
      <ellipse v-else-if="shape.kind === 'ellipse'" v-bind="shapeAttrs(shape)" shape-rendering="geometricPrecision" />
      <line v-else-if="shape.kind === 'line'" v-bind="shapeAttrs(shape)" shape-rendering="geometricPrecision" />
      <rect v-else-if="shape.kind === 'rect'" v-bind="shapeAttrs(shape)" shape-rendering="geometricPrecision" />
    </template>
  </svg>
</template>

<style scoped>
/* The emblem is a single self-contained SVG now — no wrapper span for pseudo-element wings, no
   --badge-size calc plumbing. Host contexts size it exactly like an <img>: set width/height (or
   font-size-relative em/rem) on .tier-emblem directly. overflow:visible on the root <svg> (set
   inline above, since a scoped style can't reliably win against host sizing) lets wings extend
   past the 128 viewBox at every size, matching how the old CSS wings lived outside .badge-wrap. */
.tier-emblem {
  display: block;
  flex: none;
  width: var(--badge-size, 26px);
  height: var(--badge-size, 26px);
}
</style>
