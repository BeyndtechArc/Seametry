/**
 * The landing's ASCII pictures, written from the stock photographs beside
 * this script so the page sends text rather than images (Storm, 24 October
 * 2026: the Opened Alloy's photographs become ASCII). Each photograph is
 * cropped from its centre to the card's 2:1 strip, cut into a grid of
 * character cells, and each cell's mean luminance, sharpened and equalised,
 * becomes one of ten levels, 0 darkest. The page maps a level to a
 * character, so the same levels serve both themes. A 3:1 strip of 120
 * columns was tried first and read as noise: its glyphs were 4 pixels wide.
 *
 * Each photograph was checked on its own Unsplash page as "Free to use under
 * the Unsplash License" on 24 October 2026 and is kept here, not in public/,
 * because no page serves it any more.
 *
 * Run (from clients/web): node scripts/art/ascii-pictures.mjs [--check]
 * Writes src/lib/ascii-pictures.ts; --check fails if that file differs.
 * Chromium decodes the WebP; the averaging is done here, on unscaled pixels,
 * so the result does not depend on the browser's resampling.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "..", "..", "src", "lib", "ascii-pictures.ts");

const COLS = 70;
const ROWS = 21;
/** A monospace cell is 0.6 of its height wide; at 10 units tall it is 6 wide, so the grid is 420 by 210, the card's 2:1. */
const CELL_W = 6;
const CELL_H = 10;
const LEVELS = 10;
const SHARPEN = 1.2;

const pictures = {
  glassTowers: { file: "glass-towers.webp", alt: "A glass office facade seen from below against a grey sky", photographer: "Clay LeConey", source: "https://unsplash.com/photos/oW66SyCnoLs" },
  siliconWafer: { file: "silicon-wafer.webp", alt: "Close view of chip dies on a silicon wafer", photographer: "Maxence Pira", source: "https://unsplash.com/photos/aNaq4lbX99E" },
  serverCabinets: { file: "server-cabinets.webp", alt: "Rows of white server cabinets in a data centre", photographer: "Tony Marinescu", source: "https://unsplash.com/photos/fImCPTZ026U" },
  robotArm: { file: "robot-arm.webp", alt: "An industrial robot arm on a factory line", photographer: "Homa Appliances", source: "https://unsplash.com/photos/sz1CHL7Pky0" },
  warehouseAisle: { file: "warehouse-aisle.webp", alt: "A long warehouse aisle between shelves of boxes", photographer: "Lance Chang", source: "https://unsplash.com/photos/h3pVxOIpnzk" },
};

/** The centre crop at the grid's ratio, as unscaled grey pixels. */
async function greyCrop(page, file) {
  const data = `data:image/webp;base64,${readFileSync(join(here, "photos", file)).toString("base64")}`;
  return page.evaluate(async ({ data, ratio }) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const cropW = Math.min(width, Math.round(height * ratio));
    const cropH = Math.round(cropW / ratio);
    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const context = canvas.getContext("2d");
    context.drawImage(image, Math.round((width - cropW) / 2), Math.round((height - cropH) / 2), cropW, cropH, 0, 0, cropW, cropH);
    const rgba = context.getImageData(0, 0, cropW, cropH).data;
    const grey = new Array(cropW * cropH);
    for (let index = 0; index < grey.length; index++) {
      grey[index] = 0.2126 * rgba[index * 4] + 0.7152 * rgba[index * 4 + 1] + 0.0722 * rgba[index * 4 + 2];
    }
    return { width: cropW, height: cropH, grey };
  }, { data, ratio: (COLS * CELL_W) / (ROWS * CELL_H) });
}

function levelsOf({ width, height, grey }) {
  const sums = new Array(COLS * ROWS).fill(0);
  const counts = new Array(COLS * ROWS).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y * ROWS) / height);
    for (let x = 0; x < width; x++) {
      const cell = row * COLS + Math.floor((x * COLS) / width);
      sums[cell] += grey[y * width + x];
      counts[cell] += 1;
    }
  }
  const means = sums.map((sum, cell) => sum / counts[cell]);
  // An unsharp mask over the cells: at this few cells a plain average blurs
  // every edge away, and an edge is what lets a reader see shelves or a wafer.
  const at = (col, row) => means[Math.min(ROWS - 1, Math.max(0, row)) * COLS + Math.min(COLS - 1, Math.max(0, col))];
  const sharp = means.map((mean, cell) => {
    const col = cell % COLS;
    const row = Math.floor(cell / COLS);
    let around = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) around += at(col + dx, row + dy);
    return mean + SHARPEN * (mean - around / 9);
  });
  // Equalised, not stretched: each level holds about a tenth of the cells, so
  // a photograph that is mostly mid grey still uses the whole ramp.
  const rank = new Map([...sharp].sort((a, b) => a - b).map((value, index) => [value, index]));
  const level = (value) => Math.min(LEVELS - 1, Math.floor((rank.get(value) / sharp.length) * LEVELS));
  return Array.from({ length: ROWS }, (_, row) => sharp.slice(row * COLS, (row + 1) * COLS).map(level).join(""));
}

const browser = await chromium.launch();
const page = await browser.newPage();
const entries = [];
for (const [key, { file, ...credit }] of Object.entries(pictures)) {
  const levels = levelsOf(await greyCrop(page, file));
  entries.push(`  ${key}: {
    alt: ${JSON.stringify(credit.alt)},
    photographer: ${JSON.stringify(credit.photographer)},
    source: ${JSON.stringify(credit.source)},
    levels: [
${levels.map((line) => `      "${line}",`).join("\n")}
    ],
  },`);
}
await browser.close();

const source = `// Generated by clients/web/scripts/art/ascii-pictures.mjs from the
// photographs beside it. Do not edit; run the script.

export type AsciiPicture = {
  /** What the photograph shows, for assistive technology. */
  alt: string;
  photographer: string;
  source: string;
  /** ${ROWS} rows of ${COLS} cells, each a level from 0, darkest, to ${LEVELS - 1}. */
  levels: readonly string[];
};

export const ASCII_COLS = ${COLS};
export const ASCII_ROWS = ${ROWS};

export const asciiPictures = {
${entries.join("\n")}
} as const satisfies Record<string, AsciiPicture>;
`;

if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== source) {
    console.error(`${output} differs from what scripts/art/ascii-pictures.mjs writes; run the script and commit the result.`);
    process.exit(1);
  }
  console.log("ascii pictures: up to date");
} else {
  writeFileSync(output, source);
  console.log(`wrote ${output}`);
}
