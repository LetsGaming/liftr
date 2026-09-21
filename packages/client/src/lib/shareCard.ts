/**
 * Draws a @liftr/shared WorkoutCardModel onto a <canvas> and shares/downloads it. The layout
 * math (CARD_DIMENSIONS, renderExerciseLines, wrapText, the >10-exercise compression rule, and
 * the sizing helpers below) lives in @liftr/shared, fully unit-tested; this module is the other
 * half: the actual drawing + navigator.share() call.
 *
 * Colors are hardcoded rather than read from tokens.css custom properties: canvas 2D drawing
 * happens off the DOM render path, and hardcoding a fixed small palette here is simpler and
 * more reliable than resolving CSS vars at draw time, at the cost of needing a manual update
 * if the brand palette in tokens.css ever changes materially.
 *
 * The background wash mirrors tokens.css's `--nebula-sweep-*` layer: the same diagonal-base +
 * three-wide-radial-wash recipe every live screen sits on, but at roughly 2x the live tokens'
 * wash opacities — a static share PNG has no "settling back" concept the live app's celebratory
 * glow does, so there's no reason to cap it at the same restrained baseline intensity. Canvas has
 * no `mix-blend-mode`, but `globalCompositeOperation = "screen"` is the same blend mode under a
 * different name, so the three washes below screen-composite onto the base gradient exactly like
 * the CSS layer does. The tier medal is drawn as a small top-right corner stamp rather than a
 * centered headline section, so "rank and level" reads as a badge, not the headline — freeing
 * vertical space for the trained-muscle figures and exercise grid.
 */
import {
  CARD_DIMENSIONS,
  chooseCardSize,
  distributeFillGap,
  exerciseGridRowCount,
  renderExerciseLines,
  wrapText,
  type WorkoutCardModel,
} from "@liftr/shared";
import { apiBase } from "./api";
import { MUSCLE_META } from "./muscles";
import { buildTierEmblem, wingReachUnits, type EmblemGradientDef, type EmblemShape } from "./tierEmblem";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "./tierIcons";

/** Hardcoded copy of tokens.css's live palette — see this file's header comment for why these
 *  are copies, not CSS-var reads. Keep in sync manually if tokens.css's palette changes. */
const COLORS = {
  bg: "#0a0c14", // --bg
  surface: "#212a42", // --surface-2
  surface2: "#2f3a5c", // --surface-3
  text: "#eef2fb", // --text
  dim: "#98a2c0", // --dim
  blue: "#3b8cff", // --blue
  blueHi: "#5ba0ff", // --blue-hi
  violet: "#8f6dff", // --violet
  fireHi: "#ffa04d", // --fire-hi
  pr: "#ffd23f", // --pr — tokens.css's dedicated PR-accent token, not an invented "gold"
  line: "rgba(255,255,255,0.14)", // --line
  // Nebula brand gradient (tokens.css --nebula-1/-m/-2)
  nebula1: "#2f9fe0",
  nebulaM: "#8a6dff",
  nebula2: "#d63aff",
  // tokens.css's dark-mode `--nebula-sweep-base-1..4` — the same diagonal 155deg base gradient
  // every live screen's body::before sits on.
  sweepBase1: "#0a0c14",
  sweepBase2: "#0b0d19",
  sweepBase3: "#0e0d20",
  sweepBase4: "#0a0c14",
};

/**
 * Each of the 4 stats gets one accent from the app's own restrained palette (tokens.css's
 * tier/brand hues) rather than plain colored text — see drawStatCard below for the full colored
 * card treatment. PRs echoes --pr, the token the rest of the app uses for achievement moments.
 * Dauer and Volumen use the Nebula gradient's own two end stops (--nebula-m/--nebula-1) so the
 * card's headline color story matches the app's brand identity.
 */
const STAT_COLORS = [COLORS.nebulaM, COLORS.nebula1, COLORS.fireHi, COLORS.pr];

/** tokens.css uses a two-face type system — Hanken Grotesk for body copy, Unbounded for
 *  display/numeral treatment (tier labels, .tnum stat numbers, celebratory numbers). Every
 *  ctx.font call goes through one of these two helpers instead of repeating a font-family
 *  literal, so the two can't drift apart. */
const FONT_BODY = "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_DISPLAY = "'Unbounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
function font(weight: number, size: number, display = false): string {
  return `${weight} ${size}px ${display ? FONT_DISPLAY : FONT_BODY}`;
}

/** Shrinks a font size in 2px steps until `text` fits `maxWidth`, floored at `min` — needed now
 *  that numbers render inside narrow per-stat card insets instead of a full-width text row, so a
 *  long value ("12.345 kg") can't just run off the edge the way free-floating text could. Leaves
 *  ctx.font set to the size it settles on. */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, base: number, min: number, weight: number, display: boolean): number {
  let size = base;
  while (size > min) {
    ctx.font = font(weight, size, display);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.font = font(weight, size, display);
  return size;
}

/** Manual rounded-rect path (not ctx.roundRect) — kept explicit rather than relying on a method
 *  that's only reliably available on newer engines, since this draws inside a Capacitor WebView
 *  as well as the browser. */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * One headline stat as its own full, solid-colored rounded card — a small label pill near the
 * top, a larger dark inset box below holding the value — rather than colored text on a shared
 * dark background. Uses Liftr's own palette (STAT_COLORS).
 */
function drawStatCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, value: string, label: string, accent: string): void {
  roundRectPath(ctx, x, y, w, h, 22);
  ctx.fillStyle = accent;
  ctx.fill();

  const padIn = 14;
  const pillH = 25;
  const pillY = y + padIn;
  roundRectPath(ctx, x + padIn, pillY, w - padIn * 2, pillH, pillH / 2);
  ctx.fillStyle = "rgba(6, 8, 14, 0.32)";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = font(800, 11, false);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.toUpperCase(), x + w / 2, pillY + pillH / 2 + 0.5);

  const insetY = pillY + pillH + 10;
  const insetX = x + padIn;
  const insetW = w - padIn * 2;
  const insetH = y + h - padIn - insetY;
  roundRectPath(ctx, insetX, insetY, insetW, insetH, 16);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();

  ctx.fillStyle = COLORS.text;
  fitFontSize(ctx, value, insetW - 16, 32, 19, 800, true);
  ctx.fillText(value, insetX + insetW / 2, insetY + insetH / 2 + 1);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

/**
 * One exercise as its own bordered pill row inside the 2-column grid. Keeps `renderExerciseLines`'
 * full per-set detail string verbatim rather than collapsing it to a bare set count. `detail` is
 * pre-wrapped to at most 2 lines by the caller (measurement needs the real font, which only
 * exists here in the draw step).
 */
function drawExerciseCell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, detailLines: string[]): void {
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.line;
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18);
  ctx.stroke();

  const pad = 20;
  const iconSize = 46;
  const iconX = x + pad;
  const iconY = y + pad;
  roundRectPath(ctx, iconX, iconY, iconSize, iconSize, 12);
  ctx.fillStyle = COLORS.surface2;
  ctx.fill();
  // Generic dumbbell glyph — one shared icon for every row rather than a full per-exercise icon set.
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(iconX + 11, iconY + iconSize / 2);
  ctx.lineTo(iconX + iconSize - 11, iconY + iconSize / 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(iconX + 10, iconY + iconSize / 2 - 7);
  ctx.lineTo(iconX + 10, iconY + iconSize / 2 + 7);
  ctx.moveTo(iconX + iconSize - 10, iconY + iconSize / 2 - 7);
  ctx.lineTo(iconX + iconSize - 10, iconY + iconSize / 2 + 7);
  ctx.stroke();

  const textX = iconX + iconSize + 14;
  const textW = x + w - pad - textX;
  ctx.fillStyle = COLORS.text;
  ctx.font = font(700, 28, false);
  ctx.textBaseline = "middle";
  let displayName = name;
  while (ctx.measureText(displayName).width > textW && displayName.length > 1) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== name) displayName = `${displayName.slice(0, -1)}…`;
  ctx.fillText(displayName, textX, iconY + iconSize / 2 + 1);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COLORS.dim;
  ctx.font = font(600, 22, false);
  let detailY = iconY + iconSize + 30;
  for (const line of detailLines) {
    ctx.fillText(line, x + pad, detailY);
    detailY += 28;
  }
}

/** Splits a detail string to at most 2 lines that fit `maxWidth` at the exercise-cell detail
 *  font, truncating a still-too-long final line with an ellipsis rather than overflowing the
 *  card (long set lists on a narrow half-width column). Font size must match drawExerciseCell's
 *  own detail-line font exactly — this measures the wrap, that one renders it. */
function wrapDetail(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  ctx.font = font(600, 22, false); // keep in sync with drawExerciseCell's own detail-line font
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && current) lines.push(current);
  const last = lines[lines.length - 1];
  if (last && ctx.measureText(last).width > maxWidth) {
    let truncated = last;
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    lines[lines.length - 1] = `${truncated}…`;
  }
  return lines;
}

/** Builds a canvas linear gradient matching a CSS `linear-gradient(<angleDeg>deg, ...)` over box
 *  (x, y, w, h) — CSS angle 0deg points "to top", increasing clockwise, and sizes the gradient
 *  line to the box's own projection onto that axis (the same formula the CSS spec uses), not an
 *  arbitrary corner-to-corner guess — needed since every layer below is a direct port of an
 *  actual tokens.css `linear-gradient(...)` value, not a redesign. */
function cssAngleGradient(ctx: CanvasRenderingContext2D, angleDeg: number, x: number, y: number, w: number, h: number): CanvasGradient {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const halfLen = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return ctx.createLinearGradient(cx - dx * halfLen, cy - dy * halfLen, cx + dx * halfLen, cy + dy * halfLen);
}

/** Appends an alpha channel to a `#rrggbb` hex color as a 2-digit hex suffix (`#rrggbbaa`) — the
 *  same convention the old hand-rolled halo code here used, and a valid CSS color canvas's
 *  addColorStop accepts directly (WebKit/Blink/Gecko all parse 8-digit hex). */
function hexAlpha(hex: string, opacity: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/**
 * Resolves one EmblemGradientDef to a real CanvasGradient, in the SAME 0-128 coordinate space the
 * shape geometry itself uses — the caller is expected to have already applied a ctx.translate +
 * ctx.scale that maps that space onto the card, so the raw EMBLEM_LIGHT_AXIS/shape coordinates can
 * be used as-is instead of re-deriving pixel positions. Radial gradients in this module are only
 * ever used by the single ambient-glow circle each emblem draws (see tierEmblem.ts's
 * buildTierEmblem) — SVG's default `objectBoundingBox` radial fills exactly the shape that
 * references it, so that circle's own cx/cy/r double as the gradient's bounds here too.
 */
function resolveEmblemGradient(ctx: CanvasRenderingContext2D, def: EmblemGradientDef, ownerCx: number, ownerCy: number, ownerR: number): CanvasGradient {
  if (def.kind === "linear") {
    const g = ctx.createLinearGradient(18, 2, 110, 126); // EMBLEM_LIGHT_AXIS, inlined (see tierEmblem.ts)
    g.addColorStop(0, def.from);
    g.addColorStop(1, def.to);
    return g;
  }
  const g = ctx.createRadialGradient(ownerCx, ownerCy, 0, ownerCx, ownerCy, ownerR);
  g.addColorStop(0, hexAlpha(def.color, def.fromOpacity));
  g.addColorStop(1, hexAlpha(def.color, 0));
  return g;
}

/** Resolves a shape's `fill`/`stroke` string, which is either a literal CSS color or `url(#id)`
 *  referencing one of the emblem's own gradients. */
function resolveEmblemPaint(ctx: CanvasRenderingContext2D, defs: EmblemGradientDef[], value: string | undefined, ownerCx: number, ownerCy: number, ownerR: number): string | CanvasGradient | undefined {
  if (!value) return undefined;
  const match = /^url\(#(.+)\)$/.exec(value);
  if (!match) return value;
  const def = defs.find((d) => d.id === match[1]);
  return def ? resolveEmblemGradient(ctx, def, ownerCx, ownerCy, ownerR) : undefined;
}

/**
 * Draws one EmblemShape (from lib/tierEmblem.ts's buildTierEmblem()) onto canvas, in the emblem's
 * own 0-128 coordinate space — the caller applies the translate+scale, this function just walks
 * the shape list and issues the matching canvas draw call per `kind`. This is the ONLY place the
 * geometry gets turned into pixels for canvas; TierBadge.vue is the equivalent for SVG. Neither
 * duplicates the ring/wing/mark math itself — see tierEmblem.ts.
 */
function drawEmblemShape(ctx: CanvasRenderingContext2D, shape: EmblemShape, defs: EmblemGradientDef[]): void {
  const ownerCx = "cx" in shape ? shape.cx : 0;
  const ownerCy = "cy" in shape ? shape.cy : 0;
  const ownerR = "r" in shape ? shape.r : 0;
  const fill = "fill" in shape ? resolveEmblemPaint(ctx, defs, shape.fill, ownerCx, ownerCy, ownerR) : undefined;
  const stroke = "stroke" in shape ? resolveEmblemPaint(ctx, defs, shape.stroke, ownerCx, ownerCy, ownerR) : undefined;
  const opacity = "opacity" in shape && shape.opacity !== undefined ? shape.opacity : 1;

  ctx.save();
  ctx.globalAlpha = opacity;
  switch (shape.kind) {
    case "polygon": {
      const points = shape.points.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
      ctx.beginPath();
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      break;
    }
    case "path": {
      const path = new Path2D(shape.d);
      if (fill && fill !== "none") {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (stroke && shape.strokeWidth) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(path);
      }
      break;
    }
    case "circle":
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      if (fill && fill !== "none") {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke && shape.strokeWidth) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.stroke();
      }
      break;
    case "ellipse":
      ctx.beginPath();
      if (shape.transform) {
        const m = /rotate\((-?[\d.]+) ([\d.]+) ([\d.]+)\)/.exec(shape.transform);
        if (m) {
          const [, deg, ox, oy] = m.map(Number);
          ctx.translate(ox!, oy!);
          ctx.rotate((deg! * Math.PI) / 180);
          ctx.translate(-ox!, -oy!);
        }
      }
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      break;
    case "line":
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(shape.x1, shape.y1);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
      }
      break;
    case "rect": {
      const rr = shape.rx ?? 0;
      roundRectPath(ctx, shape.x, shape.y, shape.width, shape.height, rr);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

/** Draws the tier medal — ring, mark, escalating wings — at real pixel position/size, using the
 *  exact same geometry lib/tierEmblem.ts's buildTierEmblem() gives TierBadge.vue for SVG. The
 *  translate+scale maps the emblem's fixed 0-128 coordinate space onto a `size`-px square whose
 *  top-left is (cx - size/2, topY), matching the old drawTierBadge's own (cx, topY, size) contract. */
function drawTierBadge(ctx: CanvasRenderingContext2D, cx: number, topY: number, size: number, tier: RankTier): void {
  const emblem = buildTierEmblem(tier, { small: size < 40 });
  ctx.save();
  ctx.translate(cx - size / 2, topY);
  ctx.scale(size / 128, size / 128);
  for (const shape of emblem.shapes) drawEmblemShape(ctx, shape, emblem.gradients);
  ctx.restore();
}

/**
 * Draws the tier medal + "Tier Division" / "Level N" / rank-up caption as a small top-right
 * corner stamp, so rank/level stays visible without dominating the card (the medal's own
 * material — halo, bevel, face gradient, specular streaks — is still drawn in full at `size`,
 * just smaller). Drawn independently of the header/stats/muscles/exercise cursorY flow: its
 * position is fixed relative to the top-right corner, so it never pushes later sections down.
 * Returns nothing — nothing else in the layout is positioned relative to it.
 */
function drawCornerBadge(ctx: CanvasRenderingContext2D, width: number, pad: number, size: number, model: WorkoutCardModel): void {
  if (!model.tier) return;
  const tier = model.tier.tier as RankTier;
  // Shift left by however far this tier's wings actually reach past the emblem's own 128-unit
  // viewBox — the live DOM avoids this via overflow:visible plus TierBadge.vue's layout box; canvas
  // has no layout pass, so the corner position accounts for it explicitly here. wingReachUnits()
  // mirrors buildTierEmblem's own escalation span table (lib/tierEmblem.ts) so this can't drift
  // out of sync with what actually gets drawn.
  const overflowUnits = Math.max(0, wingReachUnits(tier) - 64);
  const wingSpan = (overflowUnits / 128) * size;
  const badgeCx = width - pad - size / 2 - wingSpan;
  const badgeTopY = pad;
  drawTierBadge(ctx, badgeCx, badgeTopY, size, tier);

  let labelY = badgeTopY + size + 22;
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(800, 19, true);
  ctx.fillText(`${TIER_LABEL_DE[tier]} ${DIVISION_LABEL[model.tier.division] ?? ""}`.trim(), badgeCx, labelY);
  labelY += 22;
  ctx.fillStyle = COLORS.dim;
  ctx.font = font(600, 15, false);
  ctx.fillText(`Level ${model.tier.level}`, badgeCx, labelY);

  if (model.topRankUp) {
    labelY += 22;
    ctx.fillStyle = COLORS.fireHi;
    ctx.font = font(700, 14, false); // compact corner stack, not a headline
    const headline = model.topRankUp.isPr
      ? `${model.topRankUp.exerciseName}: neuer Rekord`
      : `${model.topRankUp.exerciseName}: ${TIER_LABEL_DE[model.topRankUp.tier as RankTier]} ${DIVISION_LABEL[model.topRankUp.division] ?? ""}`.trim();
    // The corner column is narrow (roughly `size` wide) — a long exercise name would run past it,
    // unlike the old centered treatment which had the full card width to work with.
    let displayHeadline = headline;
    while (ctx.measureText(displayHeadline).width > size * 1.9 && displayHeadline.length > 1) {
      displayHeadline = displayHeadline.slice(0, -1);
    }
    if (displayHeadline !== headline) displayHeadline = `${displayHeadline.slice(0, -1)}…`;
    ctx.fillText(displayHeadline, badgeCx, labelY);
  }
  ctx.textAlign = "left";
}

/** crossOrigin="anonymous" keeps the canvas untainted when apiBase() points at a different
 *  origin than the page (a Capacitor WebView talking to a LAN server, see lib/api.ts) — without
 *  it, a cross-origin image draws fine but toBlob() throws afterward. Same-origin loads (the
 *  normal web/PWA case) are unaffected either way. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Draws the same front+back anatomical silhouette MuscleFigure.vue renders in the app (primary
 * muscles highlighted brighter than secondary), centered under `centerX`. Returns the y just
 * below the figures so the caller knows where to continue laying out content.
 */
async function drawMuscleFigures(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  figHeight: number,
  primary: string[],
  secondary: string[],
): Promise<number> {
  const base = apiBase();
  const figWidth = figHeight * (200 / 362); // matches MuscleFigure.vue's fixed body-SVG aspect ratio
  const gap = 28;
  const startX = centerX - (figWidth * 2 + gap) / 2;

  const [frontBody, backBody] = await Promise.all([
    loadImage(`${base}/images/muscles/front-body.svg`),
    loadImage(`${base}/images/muscles/back-body.svg`),
  ]);

  interface Overlay {
    front: boolean;
    variant: "main" | "secondary";
    id: number;
  }
  const specs: Overlay[] = [];
  for (const slug of primary) {
    const meta = MUSCLE_META[slug];
    if (meta) specs.push({ front: meta.front, variant: "main", id: meta.id });
  }
  for (const slug of secondary) {
    if (primary.includes(slug)) continue; // primary wins, same rule as MuscleFigure.vue
    const meta = MUSCLE_META[slug];
    if (meta) specs.push({ front: meta.front, variant: "secondary", id: meta.id });
  }
  const overlays = await Promise.all(
    specs.map(async (spec) => ({ ...spec, img: await loadImage(`${base}/images/muscles/${spec.variant}/muscle-${spec.id}.svg`) })),
  );

  const sides: { front: boolean; body: HTMLImageElement; x: number }[] = [
    { front: true, body: frontBody, x: startX },
    { front: false, body: backBody, x: startX + figWidth + gap },
  ];
  for (const side of sides) {
    ctx.drawImage(side.body, side.x, topY, figWidth, figHeight);
    for (const o of overlays) {
      if (o.front !== side.front) continue;
      ctx.drawImage(o.img, side.x, topY, figWidth, figHeight);
    }
  }
  return topY + figHeight;
}

const PAD = 64;
const STAT_CARD_H = 176;
const STAT_GAP = 20;
// The tier medal is drawn as a small top-right corner stamp (see drawCornerBadge below),
// independent of the header/stats/muscles/exercise cursor, so it needs no reserved section
// height, fill slot, or rank-up-caption growth allowance — the vertical space that would have
// gone to an in-flow badge section is spent on MUSCLE_FIG_H and EXERCISE_ROW_H instead.
// Only the stats->muscles gap absorbs the fillGap surplus below; the header->stats and
// muscles->divider gaps stay fixed so the stat row and exercise grid don't drift with unrelated
// whitespace — that space goes directly into MUSCLE_FIG_H/EXERCISE_ROW_H (and the exercise
// cell's own font sizes) as real content size instead.
const CORNER_BADGE_SIZE = 110;
const MUSCLE_FIG_H = 470;
const MUSCLE_SECTION_H = 34 + 24 + MUSCLE_FIG_H + 40;
const DIVIDER_GAP = 40;
const EXERCISE_ROW_H = 164;
const EXERCISE_ROW_GAP = 16;
const EXERCISE_COL_GAP = 20;

export async function drawWorkoutCard(canvas: HTMLCanvasElement, model: WorkoutCardModel): Promise<void> {
  // tokens.css's @font-face blocks are declared app-wide, but the browser only actually fetches
  // a face once something on the page requests it — waiting here avoids the first share ever
  // drawn in a session silently falling back to a system font.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // best-effort — worst case the first draw uses a fallback font, not a crash
    }
  }

  const width = CARD_DIMENSIONS.square.width; // square and story share the same width; only height differs

  const hasBadge = model.tier != null;
  const hasMuscles = model.muscles.primary.length > 0 || model.muscles.secondary.length > 0;

  // ---- Header: routine name + date. Real height depends on how many lines the name wraps to.
  // Wrap width is narrower when a tier badge is present (17 vs. 20 chars) — the corner badge now
  // occupies the top-right, and the routine name/date must not run under it. ----
  const nameLines = wrapText(model.routineName, hasBadge ? 17 : 20).slice(0, 2);
  const headerH = 98 + nameLines.length * 64 + 44 + 30;

  // ---- Exercise grid: natural (uncapped) row count at this content, for the size decision. ----
  const lines = renderExerciseLines(model.exercises);
  const naturalRows = exerciseGridRowCount(lines.length);
  const naturalExerciseH = naturalRows > 0 ? naturalRows * EXERCISE_ROW_H + (naturalRows - 1) * EXERCISE_ROW_GAP : 0;

  const naturalTotal = headerH + STAT_CARD_H + (hasMuscles ? MUSCLE_SECTION_H : 20) + DIVIDER_GAP + naturalExerciseH;

  const { size, overflowsStory } = chooseCardSize(naturalTotal, PAD);
  const { height } = CARD_DIMENSIONS[size];
  const scale = 2; // backing-store 2x for a crisp share image on high-DPI screens
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  // A short routine leaves real dead space in a fixed-size card — spread whatever's unused into
  // the stats->muscles gap rather than leaving it all silently at the bottom. `overflowsStory`
  // (too many exercises even for the taller format) means there's no surplus to distribute; rows
  // get capped by maxRows below instead.
  const available = height - PAD * 2;
  const fillSlots = 1;
  const fillGap = overflowsStory ? 0 : distributeFillGap(naturalTotal, available, fillSlots, 150);

  // background — mirrors tokens.css's live `--nebula-sweep-*` recipe (body::before): the same
  // diagonal 155deg base gradient, plus the same three wide radial washes (violet top, magenta
  // bottom-right, blue left), screen-composited so hues melt into each other instead of reading
  // as separate patches — but at roughly 2x the live tokens' wash opacities, since a share PNG
  // has no in-app settle-back to protect the way the live celebratory glow does.
  const bgGrad = cssAngleGradient(ctx, 155, 0, 0, width, height);
  bgGrad.addColorStop(0, COLORS.sweepBase1);
  bgGrad.addColorStop(0.3, COLORS.sweepBase2);
  bgGrad.addColorStop(0.55, COLORS.sweepBase3);
  bgGrad.addColorStop(1, COLORS.sweepBase4);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // `globalCompositeOperation = "screen"` is canvas's equivalent of CSS `mix-blend-mode: screen`
  // (tokens.css's --nebula-sweep-blend in dark mode) — reset to "source-over" immediately after
  // so it doesn't leak into the wordmark/badge/stat/exercise drawing below.
  ctx.globalCompositeOperation = "screen";

  // Wash 1 — violet, top area (CSS: ellipse 140% 100% at 60% -20%, --nebula-sweep-wash-1 is
  // rgba(138,109,255,0.10) live; ~2x here).
  const wash1 = ctx.createRadialGradient(width * 0.6, height * -0.2, 0, width * 0.6, height * -0.2, width * 1.1);
  wash1.addColorStop(0, "rgba(138, 109, 255, 0.22)");
  wash1.addColorStop(1, "rgba(138, 109, 255, 0)");
  ctx.fillStyle = wash1;
  ctx.fillRect(0, 0, width, height);

  // Wash 2 — magenta, bottom-right (CSS: ellipse 120% 90% at 100% 90%, --nebula-sweep-wash-2 is
  // rgba(214,58,255,0.07) live; ~2x here).
  const wash2 = ctx.createRadialGradient(width * 1.0, height * 0.9, 0, width * 1.0, height * 0.9, width * 0.9);
  wash2.addColorStop(0, "rgba(214, 58, 255, 0.16)");
  wash2.addColorStop(1, "rgba(214, 58, 255, 0)");
  ctx.fillStyle = wash2;
  ctx.fillRect(0, 0, width, height);

  // Wash 3 — blue, left-mid (CSS: ellipse 100% 80% at -10% 60%, --nebula-sweep-wash-3 is
  // rgba(47,159,224,0.06) live; ~2x here).
  const wash3 = ctx.createRadialGradient(width * -0.1, height * 0.6, 0, width * -0.1, height * 0.6, width * 0.8);
  wash3.addColorStop(0, "rgba(47, 159, 224, 0.14)");
  wash3.addColorStop(1, "rgba(47, 159, 224, 0)");
  ctx.fillStyle = wash3;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "source-over";

  const pad = PAD;

  // wordmark — gradient-filled with the Nebula brand gradient across its own text box, matching
  // --nebula-grad's 120deg exactly.
  ctx.font = font(800, 30, true);
  const wordmarkW = ctx.measureText("LIFTR").width;
  const wordmarkGrad = cssAngleGradient(ctx, 120, pad, pad - 22, wordmarkW, 30);
  wordmarkGrad.addColorStop(0, COLORS.nebula1);
  wordmarkGrad.addColorStop(0.5, COLORS.nebulaM);
  wordmarkGrad.addColorStop(1, COLORS.nebula2);
  ctx.fillStyle = wordmarkGrad;
  ctx.textAlign = "left";
  ctx.fillText("LIFTR", pad, pad + 20);

  // Corner tier badge — drawn right after the wordmark, independent of the header/stats/muscles/
  // exercise cursorY flow (see drawCornerBadge's own comment for why).
  if (hasBadge) drawCornerBadge(ctx, width, pad, CORNER_BADGE_SIZE, model);

  // Routine name + date
  ctx.fillStyle = COLORS.text;
  ctx.font = font(800, 60, true);
  let y = pad + 98;
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += 64;
  }
  ctx.fillStyle = COLORS.dim;
  ctx.font = font(600, 24, false);
  ctx.fillText(model.dateLabel, pad, y - 6);
  y += 44;

  // ---- Stat cards ----
  const statCount = 4;
  const statCardW = (width - pad * 2 - STAT_GAP * (statCount - 1)) / statCount;
  const stats: [string, string][] = [
    [model.durationLabel, "Dauer"],
    [`${Math.round(model.volumeKg).toLocaleString("de-DE")} kg`, "Volumen"],
    [String(model.setCount), "Sätze"],
    [String(model.prCount), "PRs"],
  ];
  stats.forEach(([value, label], i) => {
    const x = pad + i * (statCardW + STAT_GAP);
    drawStatCard(ctx, x, y, statCardW, STAT_CARD_H, value!, label!, STAT_COLORS[i]!);
  });
  let cursorY = y + STAT_CARD_H + 30 + fillGap;

  // ---- Trained-muscle figure ----
  if (hasMuscles) {
    try {
      cursorY += 34;
      ctx.fillStyle = COLORS.dim;
      ctx.font = font(800, 20, false);
      ctx.textAlign = "center";
      ctx.fillText("TRAINIERTE MUSKELN", width / 2, cursorY);
      ctx.textAlign = "left";
      cursorY = await drawMuscleFigures(ctx, width / 2, cursorY + 24, MUSCLE_FIG_H, model.muscles.primary, model.muscles.secondary);
      cursorY += 40; // no fillGap here — the exercise grid sits snug against the muscle section
    } catch {
      // image load failed — carry on without the figure, see comment above
    }
  } else {
    cursorY += 20 + fillGap;
  }

  // divider
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, cursorY);
  ctx.lineTo(width - pad, cursorY);
  ctx.stroke();
  cursorY += DIVIDER_GAP;

  // ---- Exercise grid: 2 columns of bordered rows, keeping renderExerciseLines' full per-set
  // detail string. ----
  const colW = (width - pad * 2 - EXERCISE_COL_GAP) / 2;
  const remainingH = height - pad - cursorY;
  const maxRows = overflowsStory ? Math.max(1, Math.floor((remainingH + EXERCISE_ROW_GAP) / (EXERCISE_ROW_H + EXERCISE_ROW_GAP))) : naturalRows;
  const maxLines = Math.min(lines.length, maxRows * 2);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i]!;
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = pad + col * (colW + EXERCISE_COL_GAP);
    const rowY = cursorY + row * (EXERCISE_ROW_H + EXERCISE_ROW_GAP);
    const detailLines = wrapDetail(ctx, line.detail, colW - 32);
    drawExerciseCell(ctx, x, rowY, colW, EXERCISE_ROW_H, line.name, detailLines);
  }

  const drawnRows = Math.ceil(maxLines / 2);
  const overflowCount = lines.length - maxLines;
  if (overflowCount > 0) {
    const footerY = cursorY + drawnRows * (EXERCISE_ROW_H + EXERCISE_ROW_GAP) + 6;
    ctx.fillStyle = COLORS.dim;
    ctx.font = font(600, 22, false);
    ctx.fillText(`+${overflowCount} weitere Übungen`, pad, footerY);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FileSystemWritableStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableStream>;
}
type WindowWithSavePicker = Window & { showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike> };

/**
 * navigator.share() with a Files payload where supported (mobile — this is a PWA/Capacitor
 * build, so that's the primary target). Desktop has no such share sheet, but Chromium desktop
 * does support the File System Access API's showSaveFilePicker() — a real "Save As" dialog with
 * a destination picker, instead of always silently dropping into the browser's default downloads
 * folder. Falls back to the plain `<a download>` blob-click for anything without either API
 * (Firefox, Safari).
 */
export async function shareOrDownloadBlob(blob: Blob, filename: string, shareTitle: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return;
    } catch {
      // user cancelled the share sheet, or it failed — fall through to save/download
    }
  }

  const showSaveFilePicker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "PNG-Bild", accept: { "image/png": [".png"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // AbortError = user cancelled the picker, a real "do nothing" — anything else falls
      // through to the plain download so a save is never silently lost.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * "In Zwischenablage kopieren". Feature-detected: needs a secure context (implicit on this PWA's
 * own https/localhost origins) plus ClipboardItem + navigator.clipboard.write support, neither
 * guaranteed (older Safari, some Android WebViews). Returns false rather than throwing on
 * anything unsupported/denied so the caller can react (grey out the button, show a toast) instead
 * of crashing the share flow.
 */
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Feature-detects whether copyBlobToClipboard has a real chance of working here — same checks,
 *  without actually touching the clipboard, so a caller can decide whether to show the button at
 *  all rather than show-then-fail. */
export function canCopyToClipboard(): boolean {
  return typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
}
