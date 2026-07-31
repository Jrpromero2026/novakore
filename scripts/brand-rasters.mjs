#!/usr/bin/env node
/**
 * NovaKore brand raster regeneration.
 *
 * The SVG files under apps/web/public/brand are the vector source of truth
 * (see docs/brand/logo.md). This script re-derives every raster deliverable
 * from them so PNG/ICO assets never drift from the vectors:
 *
 *   apps/web/public/brand/icon-192.png          (PWA icon)
 *   apps/web/public/brand/icon-512.png          (PWA icon)
 *   apps/web/public/brand/icon-maskable-512.png (PWA maskable, from icon-dark tile)
 *   apps/web/public/brand/social-preview.png    (OpenGraph/Twitter, 1200x630)
 *   apps/web/public/brand/github-social.png     (GitHub social image, 1280x640)
 *   apps/web/src/app/apple-icon.png             (apple-touch-icon, 180x180)
 *   apps/web/src/app/favicon.ico                (16/32/48 PNG-in-ICO)
 *
 * Uses `sharp`, which ships with Next.js — resolved from the workspace tree,
 * no extra dependency. Run: node scripts/brand-rasters.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let sharp;
try {
  sharp = createRequire(join(root, "package.json"))("sharp");
} catch {
  console.error(
    "sharp not found — run `npm install` first (sharp ships with Next.js).",
  );
  process.exit(1);
}

const BRAND = join(root, "apps", "web", "public", "brand");
const APP = join(root, "apps", "web", "src", "app");
const svg = (name) => readFileSync(join(BRAND, name));

async function png(input, width, height) {
  return sharp(input, { density: 288 }).resize(width, height).png().toBuffer();
}

/** Single-image-type ICO container with PNG-encoded entries (Vista+). */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, buf }, i) => {
    dir.writeUInt8(size >= 256 ? 0 : size, i * 16);
    dir.writeUInt8(size >= 256 ? 0 : size, i * 16 + 1);
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(buf.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

// Maskable tile: mark centered in the 80% safe zone on a full-bleed tile.
// Derived from icon.svg by wrapping it on an Obsidian square.
const iconSource = svg("icon.svg").toString("utf8");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0B0B0D"/>
  <svg x="97" y="97" width="318" height="318" viewBox="0 0 512 512">${iconSource
    .replace(/<\/?svg[^>]*>/g, "")
    .trim()}</svg>
</svg>`;
const appleTile = maskable.replace(
  'x="97" y="97" width="318" height="318"',
  'x="56" y="56" width="400" height="400"',
);

const outputs = [
  [join(BRAND, "icon-192.png"), await png(svg("icon.svg"), 192, 192)],
  [join(BRAND, "icon-512.png"), await png(svg("icon.svg"), 512, 512)],
  [
    join(BRAND, "icon-maskable-512.png"),
    await png(Buffer.from(maskable), 512, 512),
  ],
  [
    join(BRAND, "social-preview.png"),
    await png(svg("cover-social.svg"), 1200, 630),
  ],
  [
    join(BRAND, "github-social.png"),
    await png(svg("cover-social.svg"), 1280, 640),
  ],
  [join(APP, "apple-icon.png"), await png(Buffer.from(appleTile), 180, 180)],
  [
    join(APP, "favicon.ico"),
    ico([
      { size: 16, buf: await png(svg("icon.svg"), 16, 16) },
      { size: 32, buf: await png(svg("icon.svg"), 32, 32) },
      { size: 48, buf: await png(svg("icon.svg"), 48, 48) },
    ]),
  ],
];

for (const [path, buf] of outputs) {
  writeFileSync(path, buf);
  console.log(`wrote ${path.slice(root.length + 1)} (${buf.length} bytes)`);
}
