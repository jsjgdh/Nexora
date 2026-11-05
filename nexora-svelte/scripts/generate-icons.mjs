/* The icons the browser asks for before the page is read.
 *
 * `static/favicon.svg` is the source of truth for the mark: the ink plate of
 * the wordmark in `Header.svelte`, with the N drawn as strokes. This script renders that mark to the two
 * raster slots a vector cannot fill — the multi-size `/favicon.ico` that older
 * browsers request directly, and the opaque `apple-touch-icon.png` that iOS
 * puts on a home screen — so the three never drift apart.
 *
 * It renders through the same engine that renders the site (Playwright is
 * already a dev dependency and the a11y sweep already drives it), rather than
 * through a second drawing path that could disagree with the SVG. Nothing is
 * added to the dependency list, and nothing here ships to the browser.
 *
 * Run it after any change to the mark:
 *
 *   node scripts/generate-icons.mjs
 *
 * The plate colour is the literal for `--color-ink`: a favicon is painted in
 * the browser's own chrome, outside the page's cascade, so it cannot read a
 * custom property. That is the one value these files repeat.
 */

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = resolve(here, "..", "static");

const INK = "#211912"; // --color-ink, the plate
const LETTER = "#fefdfb"; // --color-panel, the N

/** The N, drawn as strokes so it depends on no font: down the left, across to
 *  the bottom right, and up the right. */
function nPath(x0, x1, top, bottom) {
  return `M${x0} ${bottom}V${top}L${x1} ${bottom}V${top}`;
}

/** The mark as the wordmark draws it: a plate with a 16px-class curve. */
function mark(size) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">`,
    `  <rect width="32" height="32" rx="5" fill="${INK}" />`,
    `  <path d="${nPath(11, 21, 9, 23)}" fill="none" stroke="${LETTER}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />`,
    `</svg>`,
  ].join("\n");
}

/** The home-screen icon. iOS applies its own mask, so the plate is full-bleed
 *  and square, and the N is set larger so it survives the curve. */
function homeScreen(size) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">`,
    `  <rect width="32" height="32" fill="${INK}" />`,
    `  <path d="${nPath(10.1, 21.9, 7.74, 24.26)}" fill="none" stroke="${LETTER}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`,
    `</svg>`,
  ].join("\n");
}

function page(svg) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}</style></head><body>${svg}</body></html>`;
}

async function render(browser, svg, size, opaque) {
  const context = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const page_ = await context.newPage();
  await page_.setContent(page(svg), { waitUntil: "load" });
  const png = await page_.screenshot({ omitBackground: !opaque, type: "png" });
  await context.close();
  return png;
}

/** An ICO container whose entries are PNGs. Every browser that asks for a
 *  `.ico` on a page that already offers an SVG is old enough to be served a
 *  PNG entry, which Vista introduced and nothing since has dropped. */
function ico(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // 1 = icon
  head.writeUInt16LE(entries.length, 4);

  const directory = [];
  const images = [];
  let offset = 6 + 16 * entries.length;
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width, 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    images.push(png);
    offset += png.length;
  }

  return Buffer.concat([head, ...directory, ...images]);
}

const browser = await chromium.launch();
try {
  const entries = [];
  for (const size of [16, 32, 48]) {
    entries.push({ size, png: await render(browser, mark(size), size, false) });
  }
  writeFileSync(resolve(staticDir, "favicon.ico"), ico(entries));
  writeFileSync(
    resolve(staticDir, "apple-touch-icon.png"),
    await render(browser, homeScreen(180), 180, true)
  );
} finally {
  await browser.close();
}

console.log("wrote static/favicon.ico and static/apple-touch-icon.png");
