/**
 * Draws a @liftr/shared WorkoutCardModel onto a <canvas> and shares/downloads it (plan §4.5,
 * "shareable workout & run cards"). The layout math (CARD_DIMENSIONS, renderExerciseLines,
 * wrapText, the >10-exercise compression rule) already existed in @liftr/shared, fully unit-
 * tested, and was never imported anywhere in the client — this module is the missing half:
 * the actual drawing + navigator.share() call the layout module's own header comment always
 * pointed at ("the actual drawing... lives in the client package").
 *
 * Colors are hardcoded rather than read from tokens.css custom properties: canvas 2D drawing
 * happens off the DOM render path, and hardcoding a fixed small palette here is simpler and
 * more reliable than resolving CSS vars at draw time, at the cost of needing a manual update
 * if the brand palette in tokens.css ever changes materially.
 */
import { CARD_DIMENSIONS, renderExerciseLines, wrapText, type WorkoutCardModel } from "@liftr/shared";
import { apiBase } from "./api";
import { MUSCLE_META } from "./muscles";

const COLORS = {
  bg: "#0a0c14",
  surface: "#1c2233",
  surface2: "#28304a",
  text: "#eef2fb",
  dim: "#98a2c0",
  blue: "#3b8cff",
  blueHi: "#5ba0ff",
  violetHi: "#a98cff",
  fireHi: "#ffa04d",
  gold: "#ffd24a",
};

/**
 * Feedback: "the main stats should be single colored stats — not childish, but engaging to look
 * at." Each of the 4 stats gets one accent from the app's own restrained palette (tokens.css's
 * tier/brand hues) instead of uniform white — enough to give the row rhythm without turning into
 * a rainbow. Picked by what each number represents, not arbitrarily: Volumen is the headline
 * number (brand blue), PRs echoes the gold used everywhere else in the app for an achievement.
 */
const STAT_COLORS = [COLORS.violetHi, COLORS.blueHi, COLORS.fireHi, COLORS.gold];

function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, value: string, label: string, color: string) {
  ctx.fillStyle = color;
  ctx.font = "800 46px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(value, x, y);
  ctx.fillStyle = COLORS.dim;
  ctx.font = "600 20px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(label.toUpperCase(), x, y + 30);
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

export async function drawWorkoutCard(canvas: HTMLCanvasElement, model: WorkoutCardModel): Promise<void> {
  const { width, height } = CARD_DIMENSIONS.square;
  const scale = 2; // backing-store 2x for a crisp share image on high-DPI screens
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  // background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, COLORS.bg);
  bgGrad.addColorStop(1, COLORS.surface);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // A soft glow in the corner — the flat two-stop gradient above read as "text on a background",
  // not a reward. Same accent the app's own celebration/rank surfaces glow with (tokens.css's
  // --glow-blue), just large and faint here since it's sitting behind a whole card, not a button.
  const glow = ctx.createRadialGradient(width * 0.82, height * 0.08, 0, width * 0.82, height * 0.08, width * 0.55);
  glow.addColorStop(0, "rgba(59, 140, 255, 0.22)");
  glow.addColorStop(1, "rgba(59, 140, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const pad = 64;

  // wordmark
  ctx.fillStyle = COLORS.blueHi;
  ctx.font = "800 30px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LIFTR", pad, pad + 20);

  // Routine name + date — line height only advances for lines the title actually uses (a short
  // one-word routine name used to leave the same dead gap as a full two-line title before this;
  // feedback: "a lot of wasted space due to the giant title and date"). Date sits directly under
  // the real last line, tight margin, not a fixed offset assuming the worst case.
  ctx.fillStyle = COLORS.text;
  ctx.font = "800 60px 'Plus Jakarta Sans', system-ui, sans-serif";
  const nameLines = wrapText(model.routineName, 20).slice(0, 2);
  let y = pad + 98;
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += 64;
  }
  ctx.fillStyle = COLORS.dim;
  ctx.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(model.dateLabel, pad, y - 6);
  y += 44;

  // stat row — see STAT_COLORS' header comment for why each one gets its own accent.
  const statY = y + 56;
  const statGap = (width - pad * 2) / 4;
  const stats: [string, string][] = [
    [model.durationLabel, "Dauer"],
    [`${Math.round(model.volumeKg).toLocaleString("de-DE")} kg`, "Volumen"],
    [String(model.setCount), "Sätze"],
    [String(model.prCount), "PRs"],
  ];
  stats.forEach(([value, label], i) => drawStat(ctx, pad + statGap * i, statY, value, label, STAT_COLORS[i]!));

  let cursorY = statY + 56;

  // Trained-muscle figure — the card's visual centerpiece now that rank-ups (feedback: "should
  // be stripped completely, the PRs stat already carries that info") no longer compete for the
  // same vertical budget. Failure here (a slow/offline image load, an unexpected CORS wrinkle on
  // a native build) degrades to the plain card that shipped before this existed, rather than
  // breaking the share flow entirely — the figure is an enhancement, not a hard dependency.
  if (model.muscles.primary.length > 0 || model.muscles.secondary.length > 0) {
    try {
      cursorY += 34;
      ctx.fillStyle = COLORS.dim;
      ctx.font = "800 20px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TRAINIERTE MUSKELN", width / 2, cursorY);
      ctx.textAlign = "left";
      cursorY = await drawMuscleFigures(ctx, width / 2, cursorY + 24, 340, model.muscles.primary, model.muscles.secondary);
      cursorY += 40;
    } catch {
      // image load failed — carry on without the figure, see comment above
    }
  } else {
    cursorY += 20;
  }

  // divider
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, cursorY);
  ctx.lineTo(width - pad, cursorY);
  ctx.stroke();
  cursorY += 46;

  // exercise list (compresses past COMPRESS_EXERCISE_THRESHOLD via renderExerciseLines) — no
  // longer sharing its row budget with a bottom-anchored rank-ups block, so it gets the rest of
  // the card down to the bottom margin.
  const lines = renderExerciseLines(model.exercises);
  const maxRows = Math.max(1, Math.floor((height - pad - cursorY) / 44));
  for (const line of lines.slice(0, maxRows)) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 30px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText(line.name, pad, cursorY);
    ctx.fillStyle = COLORS.dim;
    ctx.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(line.detail, width - pad, cursorY);
    ctx.textAlign = "left";
    cursorY += 44;
  }
  if (lines.length > maxRows) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = "600 22px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText(`+${lines.length - maxRows} weitere Übungen`, pad, cursorY);
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
 * folder (feedback: "on desktop it does not allow us to save it to a destination"). Falls back to
 * the plain `<a download>` blob-click for anything without either API (Firefox, Safari).
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
 * "In Zwischenablage kopieren" (feedback: "copying also does not work correctly" — there wasn't
 * a copy feature at all until now). Feature-detected: needs a secure context (implicit on this
 * PWA's own https/localhost origins) plus ClipboardItem + navigator.clipboard.write support,
 * neither guaranteed (older Safari, some Android WebViews). Returns false rather than throwing on
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
