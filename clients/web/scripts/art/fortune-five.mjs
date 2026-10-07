/**
 * Fortune Five's artwork, drawn from geometry so it can be regenerated
 * exactly and traces no photograph or real mark (the engraved art direction).
 * Fortuna's wheel as a banknote guilloche: a rosette of hypotrochoid lines,
 * an engraved rim, five medallions for the five holdings on the points of a
 * pentagon, and the offset horizontal slices of Stoic Crew's artwork so the
 * two read as one series. One ink on Stoic Crew's olive ground.
 *
 * Run (from clients/web): node scripts/art/fortune-five.mjs
 * Writes public/alloys/fortune-five/artwork.png at 1280 by 1280 through
 * Playwright. The SVG is not kept: it is four times the PNG's size, and this
 * script regenerates it exactly.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const SIZE = 1280;
const C = SIZE / 2;
const GROUND = "#98AD3B";
const INK = "#1E2A0C";
/** The engraved line on the dark plate: the ground's own olive, lifted. */
const LIGHT = "#C3D46A";
const out = "public/alloys/fortune-five";

const fixed = (n) => n.toFixed(2);
const polar = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];

/** A hypotrochoid, the curve a banknote's guilloche engine traces. */
function hypotrochoid(R, r, d, phase, steps = 1400) {
  const points = [];
  const turns = r / gcd(R, r);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI * turns;
    const x = (R - r) * Math.cos(t + phase) + d * Math.cos(((R - r) / r) * t - phase);
    const y = (R - r) * Math.sin(t + phase) - d * Math.sin(((R - r) / r) * t - phase);
    points.push(`${fixed(C + x)},${fixed(C + y)}`);
  }
  return `<polyline points="${points.join(" ")}" />`;
}
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The wheel's face is a dark plate engraved in light line, the inverse of a
 * banknote, so the drawing carries the dark mass Stoic Crew's bust does.
 */
function face() {
  return `<circle cx="${C}" cy="${C}" r="404" fill="${INK}" />`;
}

function rosette() {
  const inner = [];
  for (let k = 0; k < 24; k++) inner.push(hypotrochoid(300, 60, 112 + k * 1.4, (k * Math.PI) / 120));
  const outer = [];
  for (let k = 0; k < 16; k++) outer.push(hypotrochoid(390, 78, 64 + k * 1.2, Math.PI / 5 + (k * Math.PI) / 160));
  return `<g fill="none" stroke="${LIGHT}" stroke-width="0.8" opacity="0.55">${outer.join("")}</g>
    <g fill="none" stroke="${LIGHT}" stroke-width="0.9" opacity="0.9">${inner.join("")}</g>`;
}

/** The rim: a woven guilloche band between two rules, and a beaded edge. */
function rim() {
  const parts = [`<circle cx="${C}" cy="${C}" r="456" stroke-width="2.6" /><circle cx="${C}" cy="${C}" r="404" stroke-width="2.6" />`];
  for (let k = 0; k < 9; k++) {
    const points = [];
    for (let i = 0; i <= 1800; i++) {
      const a = (i / 1800) * 2 * Math.PI;
      const r = 430 + 20 * Math.sin(a * 40 + (k * Math.PI) / 9) * Math.cos(a * 5);
      points.push(polar(r, a).map(fixed).join(","));
    }
    parts.push(`<polyline points="${points.join(" ")}" stroke-width="0.9" />`);
  }
  for (let i = 0; i < 120; i++) {
    const [x, y] = polar(476, (i / 120) * 2 * Math.PI);
    parts.push(`<circle cx="${fixed(x)}" cy="${fixed(y)}" r="5.5" fill="${INK}" stroke-width="0" />`);
  }
  return `<g fill="none" stroke="${INK}">${parts.join("")}</g>`;
}

/** Five spokes, each engraved as a bundle of converging light lines. */
function spokes() {
  const parts = [];
  for (let s = 0; s < 5; s++) {
    const a = -Math.PI / 2 + (s * 2 * Math.PI) / 5;
    for (let k = -7; k <= 7; k++) {
      const [x1, y1] = polar(86, a + k * 0.014);
      const [x2, y2] = polar(320, a + k * 0.003);
      parts.push(`<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" />`);
    }
  }
  return `<g stroke="${LIGHT}" stroke-width="1">${parts.join("")}</g>`;
}

/** A medallion: a dark coin engraved in light concentric and radial line. */
function medallion(cx, cy) {
  const parts = [`<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="112" fill="${GROUND}" stroke="${INK}" stroke-width="3" />`, `<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="100" fill="${INK}" />`];
  for (let r = 30; r <= 92; r += 4) parts.push(`<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="${r}" fill="none" stroke="${LIGHT}" stroke-width="${r > 86 ? 1.8 : 0.7}" opacity="0.85" />`);
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * 2 * Math.PI;
    parts.push(`<line x1="${fixed(cx + 30 * Math.cos(a))}" y1="${fixed(cy + 30 * Math.sin(a))}" x2="${fixed(cx + 74 * Math.cos(a + 0.42))}" y2="${fixed(cy + 74 * Math.sin(a + 0.42))}" stroke="${LIGHT}" stroke-width="0.8" />`);
  }
  parts.push(`<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="18" fill="${LIGHT}" />`);
  return `<g>${parts.join("")}</g>`;
}

function medallions() {
  const parts = [];
  for (let s = 0; s < 5; s++) {
    const [x, y] = polar(428, -Math.PI / 2 + (s * 2 * Math.PI) / 5);
    parts.push(medallion(x, y));
  }
  return parts.join("");
}

/** The hub: a pentagonal boss hatched in one direction, ringed. */
function hub() {
  const points = Array.from({ length: 5 }, (_, s) => polar(64, -Math.PI / 2 + (s * 2 * Math.PI) / 5).map(fixed).join(",")).join(" ");
  const hatch = [];
  for (let y = C - 70; y <= C + 70; y += 5) hatch.push(`<line x1="${C - 70}" y1="${y}" x2="${C + 70}" y2="${y}" />`);
  return `<defs><clipPath id="hub"><polygon points="${points}" /></clipPath></defs>
    <circle cx="${C}" cy="${C}" r="86" fill="${GROUND}" stroke="${LIGHT}" stroke-width="2" />
    <g clip-path="url(#hub)" stroke="${INK}" stroke-width="1.8">${hatch.join("")}</g>
    <polygon points="${points}" fill="none" stroke="${INK}" stroke-width="2.6" />`;
}

/** Stoic Crew's offset slices: bands of the drawing shifted sideways. */
function sliced(body) {
  const bands = [
    [380, 452, -26],
    [690, 742, 34],
    [905, 948, -18],
  ];
  const clips = bands.map(([y1, y2], i) => `<clipPath id="band${i}"><rect x="0" y="${y1}" width="${SIZE}" height="${y2 - y1}" /></clipPath>`).join("");
  const outside = `<clipPath id="rest"><path d="M0 0H${SIZE}V${SIZE}H0Z ${bands.map(([y1, y2]) => `M0 ${y1}V${y2}H${SIZE}V${y1}Z`).join(" ")}" clip-rule="evenodd" /></clipPath>`;
  const shifted = bands.map(([, , dx], i) => `<g clip-path="url(#band${i})"><g transform="translate(${dx} 0)">${body}</g></g>`).join("");
  return `<defs>${clips}${outside}</defs><g clip-path="url(#rest)">${body}</g>${shifted}`;
}

const drawing = `${face()}${rosette()}${spokes()}${rim()}${hub()}${medallions()}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${GROUND}" />${sliced(drawing)}</svg>`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: `${out}/artwork.png`, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
await browser.close();
console.log(`wrote ${out}/artwork.png`);
