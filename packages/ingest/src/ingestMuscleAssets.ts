/**
 * `pnpm ingest --muscles` — mirrors wger's real anatomical muscle-map assets (plan Phase 3.1,
 * rebuilt on real anatomy rather than hand-drawn blobs). Source: wger's own static assets,
 * which are themselves a CC-BY-SA 3.0 derivative of Wikimedia Commons illustrations
 * ("Muscular_system.svg" / "Muscular_system-back.svg" by Termininja) — see
 * wger/core/static/images/muscles/SOURCES in the wger repo. Mirrored once, recolored once,
 * never hotlinked or re-fetched at runtime, per the ingest-once rule.
 *
 * Two asset families, both served as plain static files (no runtime SVG manipulation needed):
 *  - Two base body outlines (front/back), recolored from their original white-background
 *    grayscale palette into a dark-theme-appropriate blue-gray range.
 *  - 15 x 2 muscle highlight overlays (one "main"/primary + one "secondary" shape per muscle,
 *    aligned to the same coordinate space as the base bodies). wger bakes primary as solid red
 *    (#fc0000) and secondary as orange (#f57900) — recolored here to this app's blue accent
 *    tokens so the map reads as part of the same design system as the rest of the UI.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MUSCLES } from "./muscles.js";

const RAW_BASE = "https://raw.githubusercontent.com/wger-project/wger/master/wger/core/static/images/muscles";

const PRIMARY_FROM = "#fc0000";
const PRIMARY_TO = "#5ba0ff"; // --blue-hi
const SECONDARY_FROM = "#f57900";
const SECONDARY_TO = "#5f7fd6"; // matches the app's existing --mm-sec token

// Readiness hero (engagement rework W5) — a third, local-only recolor pass reading the
// already-mirrored `main/` overlays (no network fetch, no re-download) and swapping the blue
// highlight for the app's fire-orange token, so MuscleFigure.vue's `heat` mode can render a
// fatigued muscle warm and a recovered one in its normal cool blue. Deterministic string swap,
// same technique as the two passes above, not a runtime CSS filter — easier to keep visually
// tuned than a hue-rotate() that has to be re-eyeballed per asset.
const FATIGUE_COLOR = "#ff7a1f"; // --fire

// dark-theme anchors for the base-body grayscale remap (see module doc: per-file min/max
// luminance normalized into this range, since front/back source SVGs use different palettes)
const BODY_DARK: [number, number, number] = [26, 32, 51];
const BODY_LIGHT: [number, number, number] = [79, 92, 130];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  return res.text();
}

function recolorOverlay(svg: string): string {
  return svg
    .split(PRIMARY_FROM)
    .join(PRIMARY_TO)
    .split(SECONDARY_FROM)
    .join(SECONDARY_TO)
    // wger's originals are drawn at ~52% opacity for a white background; boost toward opaque
    // so the highlight reads clearly against our dark surfaces (the "clear visible distinction"
    // requirement) — cosmetic, not required for wger asset attribution/compatibility.
    .replace(/opacity:0\.52424239;/g, "opacity:0.92;");
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Remap every `fill:#RRGGBB` grayscale value in the body outline into the dark-theme range. */
function recolorBody(svg: string): string {
  const matches = [...svg.matchAll(/fill:(#[0-9a-fA-F]{6})/g)];
  const luminances = matches.map((m) => hexToRgb(m[1]!)[0]); // grayscale: R === G === B
  const min = Math.min(...luminances);
  const max = Math.max(...luminances);
  const span = max - min || 1;

  return svg.replace(/fill:(#[0-9a-fA-F]{6})/g, (full, hex: string) => {
    const lum = hexToRgb(hex)[0]!;
    const t = (lum - min) / span; // 0 = darkest in source, 1 = lightest in source
    const mix = (a: number, b: number) => a + (b - a) * t;
    const mixed: [number, number, number] = [
      mix(BODY_DARK[0], BODY_LIGHT[0]),
      mix(BODY_DARK[1], BODY_LIGHT[1]),
      mix(BODY_DARK[2], BODY_LIGHT[2]),
    ];
    return `fill:${rgbToHex(mixed)}`;
  });
}

export async function ingestMuscleAssets(imagesDir: string) {
  const muscleDir = path.join(imagesDir, "muscles");
  await mkdir(path.join(muscleDir, "main"), { recursive: true });
  await mkdir(path.join(muscleDir, "secondary"), { recursive: true });
  await mkdir(path.join(muscleDir, "fatigue"), { recursive: true });

  const front = recolorBody(await fetchText(`${RAW_BASE}/muscular_system_front.svg`));
  await writeFile(path.join(muscleDir, "front-body.svg"), front, "utf-8");
  const back = recolorBody(await fetchText(`${RAW_BASE}/muscular_system_back.svg`));
  await writeFile(path.join(muscleDir, "back-body.svg"), back, "utf-8");

  let ok = 0;
  for (const muscle of MUSCLES) {
    const id = muscle.wgerMuscleId;
    const mainPath = path.join(muscleDir, "main", `muscle-${id}.svg`);
    const main = recolorOverlay(await fetchText(`${RAW_BASE}/main/muscle-${id}.svg`));
    await writeFile(mainPath, main, "utf-8");
    const secondary = recolorOverlay(await fetchText(`${RAW_BASE}/secondary/muscle-${id}.svg`));
    await writeFile(path.join(muscleDir, "secondary", `muscle-${id}.svg`), secondary, "utf-8");

    // Local-only: re-reads the file just written above, no re-fetch.
    const fatigue = (await readFile(mainPath, "utf-8")).split(PRIMARY_TO).join(FATIGUE_COLOR);
    await writeFile(path.join(muscleDir, "fatigue", `muscle-${id}.svg`), fatigue, "utf-8");
    ok++;
  }

  console.log(`muscle assets: mirrored 2 base bodies + ${ok} muscle overlays (main+secondary+fatigue)`);
}
