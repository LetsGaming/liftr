/**
 * Rank emblem geometry — "Orbit": a 9-segment ring (lit segments = tier ordinal) around Liftr's own
 * logomark, with wings escalating from Stufe 4 through Apex. Framework-agnostic: this module does
 * pure geometry/color math and returns a typed shape list, not markup — TierBadge.vue renders the
 * list as real SVG elements, and shareCard.ts's canvas port walks the same list to draw onto a
 * CanvasRenderingContext2D. Neither consumer duplicates the wing/facet/light-axis math itself.
 *
 * The single highest-leverage rule here (the thing that actually fixes the "5-minute SVG" look):
 * every gradient in every facet is defined against the SAME fixed light-axis coordinates
 * (EMBLEM_LIGHT_AXIS), so the whole emblem is lit from one shared direction instead of each shape
 * getting its own private `objectBoundingBox` gradient. Hard value breaks at facet edges, not
 * smooth ramps; one small specular highlight, not several; a faked radial glow instead of an SVG
 * blur filter (filters are expensive on mobile and avoided here entirely).
 *
 * Escalation rule (confirmed design, see docs/design/nebula-design-system.md's rank emblem note):
 *   Stufe 1-3  ring + mark only, nothing else
 *   Stufe 4    first wing blade (small)
 *   Stufe 5    blade widens
 *   Stufe 6    second blade pair
 *   Stufe 7    laurel joins
 *   Stufe 8    third blade, crown
 *   Stufe 9    fourth blade, emission ring, unique
 * Wings render at EVERY badge size, including the 26-30px rank ladder — there is no size-based
 * suppression. Callers that need extra horizontal room for wings (TierLadder.vue's rung-row) must
 * provide it; this module does not clip or shrink wings to fit a host layout.
 */
import { TIERS, type Tier } from "@liftr/shared";
import { mixHex, TIER_PALETTE } from "./tierPalette";

export const EMBLEM_VIEWBOX = "0 0 128 128";
export const EMBLEM_LIGHT_AXIS = { x1: 18, y1: 2, x2: 110, y2: 126 } as const;
/** Incoming light direction as an angle, derived from the axis above — used to shade facets by
 *  their outward-normal angle relative to the light. */
const LIGHT_ANGLE = Math.atan2(
  EMBLEM_LIGHT_AXIS.y2 - EMBLEM_LIGHT_AXIS.y1,
  EMBLEM_LIGHT_AXIS.x2 - EMBLEM_LIGHT_AXIS.x1,
) - Math.PI;

export type EmblemGradientDef =
  | { kind: "linear"; id: string; from: string; to: string }
  | { kind: "radial"; id: string; color: string; fromOpacity: number };

export type EmblemShape =
  | { kind: "polygon"; points: string; fill: string; opacity?: number }
  | { kind: "path"; d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number; transform?: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; opacity?: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; rx?: number; fill: string; opacity?: number };

export interface TierEmblem {
  gradients: EmblemGradientDef[];
  shapes: EmblemShape[];
  /** German tier label — for <title>/aria-label at the call site. */
  title: string;
}

const TAU = Math.PI * 2;
const round = (n: number) => Math.round(n * 100) / 100;
const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [
  cx + r * Math.cos(a),
  cy + r * Math.sin(a),
];
const fmtPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

function ringSegPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = pt(cx, cy, r1, a0);
  const [x1, y1] = pt(cx, cy, r1, a1);
  const [x2, y2] = pt(cx, cy, r0, a1);
  const [x3, y3] = pt(cx, cy, r0, a0);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${round(x0)} ${round(y0)}A${r1} ${r1} 0 ${big} 1 ${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}A${r0} ${r0} 0 ${big} 0 ${round(x3)} ${round(y3)}Z`;
}

/** A small stateful builder so every emblem's gradient ids stay unique within one <svg> — SVG
 *  gradient ids are document-global, and two badges rendering side by side (the ladder, a card
 *  grid) would otherwise silently resolve the second badge's gradients to the first's. Each call
 *  to buildTierEmblem() gets its own counter, namespaced by the caller-supplied `idPrefix` (a
 *  Vue useId()-style per-instance id) so two badges rendered on the same page — the ladder, a card
 *  grid — never resolve to each other's gradients. */
class GradientBuilder {
  private n = 0;
  readonly defs: EmblemGradientDef[] = [];
  constructor(private readonly prefix: string) {}
  linear(from: string, to: string): string {
    const id = `${this.prefix}g${this.n++}`;
    this.defs.push({ kind: "linear", id, from, to });
    return `url(#${id})`;
  }
  radial(color: string, fromOpacity: number): string {
    const id = `${this.prefix}g${this.n++}`;
    this.defs.push({ kind: "radial", id, color, fromOpacity });
    return `url(#${id})`;
  }
}

function ordinalOf(tier: Tier): number {
  return TIERS.indexOf(tier) + 1;
}

function pushWings(grad: GradientBuilder, shapes: EmblemShape[], t: Tier, cx: number, cy: number, blades: number, span: number, anchor: number) {
  const p = TIER_PALETTE[t];
  for (const d of [-1, 1]) {
    for (let b = 0; b < blades; b++) {
      const w = span * (1 - b * 0.16);
      const y = cy - 11 + b * 8;
      const points: [number, number][] = [
        [cx + d * anchor, y],
        [cx + d * (anchor + w), y - 3 - b * 1.6],
        [cx + d * (anchor + w * 0.7), y + 7],
        [cx + d * anchor, y + 8],
      ];
      shapes.push({
        kind: "polygon",
        points: fmtPoints(points),
        fill: grad.linear(mixHex(p.base, p.hi, 0.62 - b * 0.11), p.sh),
      });
    }
  }
}

function pushCrown(grad: GradientBuilder, shapes: EmblemShape[], t: Tier, cx: number, y: number, s: number) {
  const p = TIER_PALETTE[t];
  const points: [number, number][] = [
    [cx - 15 * s, y], [cx - 9 * s, y - 11 * s], [cx - 3 * s, y - 3 * s], [cx, y - 14 * s],
    [cx + 3 * s, y - 3 * s], [cx + 9 * s, y - 11 * s], [cx + 15 * s, y], [cx + 13 * s, y + 5 * s], [cx - 13 * s, y + 5 * s],
  ];
  shapes.push({ kind: "polygon", points: fmtPoints(points), fill: grad.linear(p.tint, mixHex(p.base, p.hi, 0.5)) });
}

function pushLaurel(shapes: EmblemShape[], t: Tier, cx: number, cy: number, r: number, opacity: number) {
  const p = TIER_PALETTE[t];
  for (const d of [-1, 1]) {
    shapes.push({
      kind: "path",
      d: `M${round(cx + d * r * 0.34)} ${round(cy + r * 0.82)} Q${round(cx + d * r * 1.12)} ${round(cy + r * 0.34)} ${round(cx + d * r * 0.94)} ${round(cy - r * 0.46)}`,
      stroke: p.tint,
      strokeWidth: 2.6,
      opacity,
    });
  }
}

function pushRays(shapes: EmblemShape[], t: Tier, cx: number, cy: number, r0: number, r1: number, count: number) {
  const p = TIER_PALETTE[t];
  for (let k = 0; k < count; k++) {
    const a = -Math.PI / 2 + k * (TAU / count) + TAU / (count * 2);
    const [x1, y1] = pt(cx, cy, r0, a);
    const [x2, y2] = pt(cx, cy, r1, a);
    shapes.push({ kind: "line", x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), stroke: p.tint, strokeWidth: 1.6, opacity: 0.55 });
  }
}

/** Wings/laurel behind the ring. Opens at Stufe 4; nothing below that. */
function pushEscalationBack(grad: GradientBuilder, shapes: EmblemShape[], t: Tier, n: number, cx: number, cy: number, r: number) {
  if (n < 4) return;
  if (n >= 9) pushRays(shapes, t, cx, cy, r + 8, r + 21, 10);
  const blades = n >= 9 ? 4 : n >= 8 ? 3 : n >= 6 ? 2 : 1;
  const span = n >= 9 ? 40 : n >= 8 ? 32 : n >= 6 ? 22 : n >= 5 ? 15 : 10;
  pushWings(grad, shapes, t, cx, cy, blades, span, r + 1);
  if (n >= 7) pushLaurel(shapes, t, cx, cy, r - 2, n >= 8 ? 0.42 : 0.6);
}

/** Crown + outer hairline in front of the ring. */
function pushEscalationFront(grad: GradientBuilder, shapes: EmblemShape[], t: Tier, n: number, cx: number, cy: number, r: number) {
  if (n < 4) return;
  if (n >= 8) pushCrown(grad, shapes, t, cx, cy - r - 5, 0.8);
  if (n >= 9) {
    const p = TIER_PALETTE[t];
    shapes.push({ kind: "circle", cx, cy, r: r + 4, fill: "none", stroke: p.tint, strokeWidth: 1.5, opacity: 0.75 });
  }
}

/** Liftr's own logomark — the bent ascending stroke + terminus ball from
 *  packages/client/public/icons/icon-master.svg (M120,150 L120,362 L216,362 L320,258, round
 *  caps/joins, circle at 386,192 r34) — rescaled into whatever radius R the ring gives it and
 *  redrawn as a duotone shape on the emblem's own light axis, rather than reusing the flat Nebula-
 *  gradient stroke the standalone app icon uses. No seat plate behind it — it sits directly on the
 *  ring's floor, which is why the "shadow half" of the stroke is lifted one step above the tier's
 *  pure shadow color (a dead match with a dark ring floor would make that half disappear). */
function pushMark(grad: GradientBuilder, shapes: EmblemShape[], t: Tier, n: number, cx: number, cy: number, R: number, small: boolean) {
  const p = TIER_PALETTE[t];
  const path: [number, number][] = [[120, 150], [120, 362], [216, 362], [320, 258]];
  const ball: [number, number] = [386, 192];
  const strokeW = 54;
  const minX = 93, maxX = 420, minY = 116, maxY = 396;
  const scale = (R * 1.62) / Math.max(maxX - minX, maxY - minY);
  const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
  const tx = ([x, y]: [number, number]): [number, number] => [cx + (x - ox) * scale, cy + (y - oy) * scale];
  const p0 = path.map(tx);
  const [bx, by] = tx(ball);
  const sw = strokeW * scale;
  const d = `M${round(p0[0]![0])} ${round(p0[0]![1])}L${round(p0[1]![0])} ${round(p0[1]![1])}L${round(p0[2]![0])} ${round(p0[2]![1])}L${round(p0[3]![0])} ${round(p0[3]![1])}`;

  shapes.push({ kind: "path", d, fill: "none", stroke: mixHex(p.sh, p.base, 0.42), strokeWidth: round(sw) });
  shapes.push({
    kind: "path",
    d,
    fill: "none",
    stroke: grad.linear(mixHex(p.tint, p.hi, 0.25), mixHex(p.base, p.hi, 0.35)),
    strokeWidth: round(sw),
  });
  shapes.push({ kind: "circle", cx: round(bx), cy: round(by), r: round(sw * 0.56), fill: grad.linear(mixHex(p.tint, p.hi, 0.2), p.base) });
  shapes.push({
    kind: "ellipse",
    cx: round(bx - sw * 0.16),
    cy: round(by - sw * 0.16),
    rx: round(sw * 0.16),
    ry: round(sw * 0.1),
    fill: "#fff",
    opacity: 0.4,
    transform: `rotate(-30 ${round(bx)} ${round(by)})`,
  });

  if (!small) {
    const y = cy + R * 0.86, w = R * 1.1;
    shapes.push({ kind: "rect", x: round(cx - w / 2), y: round(y), width: round(w), height: 2.2, rx: 1.1, fill: "rgba(255,255,255,.12)" });
    shapes.push({ kind: "rect", x: round(cx - w / 2), y: round(y), width: round(w * (n / 9)), height: 2.2, rx: 1.1, fill: p.tint });
  }
}

export interface BuildEmblemOptions {
  /** Hides the sub-2px tier-progress tick under the mark — everything else (including wings)
   *  still renders. Set this for badges under ~36px (the rank ladder, list rows). */
  small?: boolean;
  /** Namespaces every gradient id this call produces. Required whenever more than one emblem may
   *  render on the same page at once (always, in practice) — pass a per-component-instance id,
   *  e.g. Vue's `useId()`. Defaults to "" for standalone/test use, where collisions don't matter. */
  idPrefix?: string;
}

/** Max distance from the emblem's own centre (in the 0-128 viewBox's own units) that a tier's
 *  wings reach — 64 (i.e. no overflow past the viewBox edge) for tiers below Stufe 4, where
 *  nothing renders outside the ring. Mirrors buildTierEmblem's own escalation span table exactly
 *  (not re-derived independently) so it can't drift out of sync with it. Exists for callers that
 *  need to reserve or shift layout space for the badge's overflow without re-deriving the
 *  escalation formula themselves — shareCard.ts's canvas corner-stamp positioning is the only
 *  current consumer, since the DOM/SVG path handles overflow for free via `overflow: visible`. */
export function wingReachUnits(tier: Tier): number {
  const n = ordinalOf(tier);
  if (n < 4) return 64;
  const r1 = 45; // matches the "open" (n>=4) branch in buildTierEmblem
  const span = n >= 9 ? 40 : n >= 8 ? 32 : n >= 6 ? 22 : n >= 5 ? 15 : 10;
  return r1 + 1 + span;
}

export function buildTierEmblem(tier: Tier, opts: BuildEmblemOptions = {}): TierEmblem {
  const n = ordinalOf(tier);
  const small = opts.small ?? false;
  const grad = new GradientBuilder(opts.idPrefix ?? "");
  const shapes: EmblemShape[] = [];
  const cx = 64;
  const open = n >= 4;
  const cy = open ? 64 : 63;
  // Ring/mark size no longer shrinks once wings open (Stufe 4+) — wings already render outside
  // the 128 viewBox via `overflow: visible` (see wingReachUnits, which reaches well past the
  // viewBox edge for every winged tier), so shrinking the ring to "make room" for them wasn't
  // actually necessary and just made every winged badge read smaller than a non-winged one at
  // the same --badge-size, which is the one thing a rank ladder can't afford to get backwards.
  const r0 = 47;
  const r1 = 55;
  const gr = 26;
  const p = TIER_PALETTE[tier];

  shapes.push({ kind: "ellipse", cx, cy: 122, rx: 28, ry: 3.8, fill: "#000", opacity: 0.34 });
  shapes.push({ kind: "circle", cx, cy, r: r1 + 9, fill: grad.radial(p.hi, 0.09 + n * 0.032) });

  pushEscalationBack(grad, shapes, tier, n, cx, cy, r1);

  for (let s = 0; s < 9; s++) {
    const a0 = -Math.PI / 2 + s * (TAU / 9) + 0.0425;
    const a1 = a0 + TAU / 9 - 0.085;
    let fill = "rgba(255,255,255,.055)";
    if (s < n) {
      const v = 0.5 + 0.5 * Math.cos((a0 + a1) / 2 - LIGHT_ANGLE);
      fill = grad.linear(mixHex(p.base, p.tint, Math.min(1, v * 0.9)), mixHex(p.sh, p.base, 0.55));
    }
    shapes.push({ kind: "path", d: ringSegPath(cx, cy, r0, r1, a0, a1), fill });
  }
  shapes.push({ kind: "path", d: ringSegPath(cx, cy, r1 - 1.5, r1, -Math.PI * 0.95, -Math.PI * 0.28), fill: p.tint, opacity: 0.5 });

  pushMark(grad, shapes, tier, n, cx, cy, gr, small);
  pushEscalationFront(grad, shapes, tier, n, cx, cy, r1);

  return { gradients: grad.defs, shapes, title: tier };
}
