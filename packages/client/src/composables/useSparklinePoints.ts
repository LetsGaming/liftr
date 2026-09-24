import { computed, type Ref } from "vue";

interface SparklineOptions {
  width?: number;
  height?: number;
  pad?: number;
}

/**
 * Min/max-normalized SVG polyline `points` string for an inline sparkline — no charting library,
 * same rationale ProgressChart.vue/BodyweightTrend.vue's own doc comments give (a full charting
 * dependency costs more bundle size than a few small sparklines are worth on a PWA). Was
 * implemented twice, byte-for-byte the same algorithm, differing only in which field of the
 * source data fed it and the width/height/pad constants.
 *
 * Returns "" for fewer than 2 points — a single point has no line to draw, and both call sites
 * already gate their `<svg>` on a length of at least 2, so this is a no-op guard, not a behavior
 * change.
 */
export function useSparklinePoints(values: Ref<number[]>, options: SparklineOptions = {}) {
  const { width = 200, height = 48, pad = 4 } = options;
  const points = computed(() => {
    const v = values.value;
    if (v.length < 2) return "";
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    const stepX = (width - pad * 2) / (v.length - 1);
    return v
      .map((value, i) => {
        const x = pad + i * stepX;
        const y = height - pad - ((value - min) / span) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });
  return { points };
}
