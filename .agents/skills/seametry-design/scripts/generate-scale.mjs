#!/usr/bin/env node
// Generates a perceptually-even 12-step OKLCH tonal scale for a named hue family.
// This is how the "different shades of one colour, blended or dropped to low opacity,
// read as premium rather than arbitrary" effect gets built: the steps are computed on a
// real perceptual model (Bjorn Ottosson's OkLab), not eyeballed in a colour picker, so
// adjacent steps never clash and a composited stack always looks intentional.
//
// Usage: node generate-scale.mjs <name> <hexAnchor> <anchorStep(1-12)>
// Example: node generate-scale.mjs touch '#8DA32C' 6

const [, , NAME, HEX, ANCHOR_STEP] = process.argv;
if (!NAME || !HEX) { console.error('Usage: generate-scale.mjs <name> <hex> [anchorStep=6]'); process.exit(1); }
const anchorStep = Number(ANCHOR_STEP || 6);

// --- sRGB <-> linear <-> OKLab <-> OKLCH, per Bjorn Ottosson's reference formulas ---
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToLinearRgb(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));
  return [r, g, b];
}
function linearRgbToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
function oklabToLinearRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const toLch = ([L, a, b]) => [L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI];
const toLab = ([L, C, H]) => [L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)];

function oklabToHex(lab) {
  let [r, g, b] = oklabToLinearRgb(lab).map(linearToSrgb);
  // Gamut-map by chroma reduction if any channel clips, rather than naive clamping,
  // which is what keeps a generated scale from producing a muddy or blown-out step.
  if ([r, g, b].some((c) => c < -1e-4 || c > 1 + 1e-4)) {
    const [L, C, H] = toLch(lab);
    for (let c = C; c >= 0; c -= C / 40) {
      const cand = oklabToLinearRgb(toLab([L, c, H])).map(linearToSrgb);
      if (cand.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) { [r, g, b] = cand; break; }
    }
  }
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0').toUpperCase()).join('');
}

// --- build the ramp: 12 steps, lightness sweeps low to high, chroma eases toward the ends ---
const [L0, C0, H0] = toLch(linearRgbToOklab(hexToLinearRgb(HEX)));
const STEPS = 12;
const targetL = Array.from({ length: STEPS }, (_, i) => 0.08 + (i / (STEPS - 1)) * 0.86);
const anchorIdx = Math.max(1, Math.min(STEPS, anchorStep)) - 1;
const shift = L0 - targetL[anchorIdx];
const L = targetL.map((l) => Math.min(0.97, Math.max(0.05, l + shift)));

const scale = {};
for (let i = 0; i < STEPS; i++) {
  const t = 1 - Math.abs(i - anchorIdx) / Math.max(anchorIdx, STEPS - 1 - anchorIdx || 1);
  const c = i === anchorIdx ? C0 : C0 * (0.35 + 0.65 * Math.max(0, t));
  scale[String((i + 1) * 100 - 100 || 50).padStart(2, '0')] = oklabToHex(toLab([L[i], c, H0]));
}
// Relabel to conventional 50/100/200.../900/950 keys.
const keys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975'];
const named = Object.fromEntries(Object.values(scale).map((hex, i) => [keys[i], hex]));

console.log(`\n${NAME} scale, anchored to ${HEX} at step ${keys[anchorIdx]}:\n`);
for (const k of keys) console.log(`  ${k.padEnd(4)} ${named[k]}`);
console.log(`\nAs tokens.json fragment:\n`);
console.log(JSON.stringify({ [NAME]: Object.fromEntries(keys.map((k) => [k, { $type: 'color', $value: named[k] }])) }, null, 2));
