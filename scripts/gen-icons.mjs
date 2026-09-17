// Regenerates every raster icon/splash asset from the SVG masters in
// packages/client/public/icons/. Run with `pnpm icons:gen` after touching a master.
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'packages/client/public/icons');
const publicDir = join(root, 'packages/client/public');
const androidRes = join(root, 'packages/client/android/app/src/main/res');

const svg = {
  compact: await readFile(join(iconsDir, 'icon-compact.svg')),
  master: await readFile(join(iconsDir, 'icon-master.svg')),
  maskable: await readFile(join(iconsDir, 'icon-maskable.svg')),
  foreground: await readFile(join(iconsDir, 'icon-foreground.svg')),
};

async function render(source, outPath, size, { round = false } = {}) {
  await mkdir(dirname(outPath), { recursive: true });
  let pipeline = sharp(source, { density: 384 }).resize(size, size);
  if (round) {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    pipeline = pipeline.composite([{ input: mask, blend: 'dest-in' }]);
  }
  await pipeline.png().toFile(outPath);
}

// Favicons + PWA + apple-touch
await render(svg.compact, join(publicDir, 'favicon-16.png'), 16);
await render(svg.compact, join(publicDir, 'favicon-32.png'), 32);
await render(svg.master, join(publicDir, 'apple-touch-icon.png'), 180);
await render(svg.master, join(iconsDir, 'pwa-192.png'), 192);
await render(svg.master, join(iconsDir, 'pwa-512.png'), 512);
await render(svg.maskable, join(iconsDir, 'pwa-maskable-192.png'), 192);
await render(svg.maskable, join(iconsDir, 'pwa-maskable-512.png'), 512);

// Android launcher icons
const density = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const foregroundDensity = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [d, size] of Object.entries(density)) {
  await render(svg.master, join(androidRes, `mipmap-${d}/ic_launcher.png`), size);
  await render(svg.master, join(androidRes, `mipmap-${d}/ic_launcher_round.png`), size, { round: true });
}
for (const [d, size] of Object.entries(foregroundDensity)) {
  await render(svg.foreground, join(androidRes, `mipmap-${d}/ic_launcher_foreground.png`), size);
}

// Splash screens: mark centered on the master's sweep background, scaled per short edge.
const splash = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [720, 480],
  'drawable-land-xhdpi': [960, 640],
  'drawable-land-xxhdpi': [1440, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 720],
  'drawable-port-xhdpi': [640, 960],
  'drawable-port-xxhdpi': [960, 1440],
  'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(splash)) {
  const shortEdge = Math.min(w, h);
  const markSize = Math.round(shortEdge * 0.38);
  const markBuf = await sharp(svg.master, { density: 384 }).resize(markSize, markSize).toBuffer();
  await mkdir(join(androidRes, dir), { recursive: true });
  await sharp(svg.master, { density: 384 })
    .resize(w, h, { fit: 'cover' })
    .composite([{ input: markBuf, left: Math.round((w - markSize) / 2), top: Math.round((h - markSize) / 2) }])
    .png()
    .toFile(join(androidRes, dir, 'splash.png'));
}

console.log('Icons regenerated.');
