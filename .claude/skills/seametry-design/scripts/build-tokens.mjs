#!/usr/bin/env node
// Builds tokens.css (web) and tokens.ts (React Native and TypeScript) from the DTCG source.
// Usage: node build-tokens.mjs <tokens.json> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [src = new URL('../assets/tokens/seametry.tokens.json', import.meta.url).pathname, outDir = 'generated'] = process.argv.slice(2);
const tokens = JSON.parse(readFileSync(src, 'utf8'));

// Walk a group, yielding [pathArray, token] for every leaf that has $value.
function* leaves(node, path = []) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object' && '$value' in v) yield [[...path, k], v];
    else if (v && typeof v === 'object') yield* leaves(v, [...path, k]);
  }
}
const cssValue = (v) => Array.isArray(v)
  ? (v.every((x) => typeof x === 'number') && v.length === 4 ? `cubic-bezier(${v.join(', ')})` : v.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', '))
  : String(v);
const cssName = (p) => `--sm-${p.join('-')}`;

const { theme, ...shared } = tokens;
const block = (entries) => entries.map(([p, t]) => `  ${cssName(p)}: ${cssValue(t.$value)};`).join('\n');

const sharedEntries = [...leaves(shared)];
const dark = [...leaves(theme.dark)];
const light = [...leaves(theme.light)];

const css = `/* Generated from seametry.tokens.json. Do not edit. */
:root {
${block(sharedEntries)}
${block(dark)}
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
${block(light).replace(/^/gm, '  ')}
    color-scheme: light;
  }
}
:root[data-theme="light"] {
${block(light)}
  color-scheme: light;
}
:root[data-theme="dark"] {
${block(dark)}
  color-scheme: dark;
}
`;

// TypeScript: nested objects, px dimensions as numbers for React Native.
function toObject(entries) {
  const o = {};
  for (const [p, t] of entries) {
    let cur = o;
    p.slice(0, -1).forEach((k) => (cur = cur[k] ??= {}));
    let v = t.$value;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?px$/.test(v)) v = parseFloat(v);
    else if (typeof v === 'string' && /^\d+ms$/.test(v)) v = parseInt(v, 10);
    cur[p.at(-1)] = v;
  }
  return o;
}
const ts = `// Generated from seametry.tokens.json. Do not edit.
export const theme = ${JSON.stringify({ dark: toObject(dark), light: toObject(light) }, null, 2)} as const;
export const tokens = ${JSON.stringify(toObject(sharedEntries), null, 2)} as const;
export type ThemeName = keyof typeof theme;
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tokens.css'), css);
writeFileSync(join(outDir, 'tokens.ts'), ts);
console.log(`tokens.css: ${sharedEntries.length + dark.length} variables per mode. tokens.ts written to ${outDir}.`);
