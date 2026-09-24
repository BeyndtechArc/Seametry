#!/usr/bin/env node
// Seametry design lint. Scans UI source for violations of the design system.
// Usage: node design-lint.mjs [paths...]   (defaults to apps packages)
// Suppress a single line with the comment: design-lint-disable-line <rule> <reason>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.mdx', '.html']);
const SKIP_DIR = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.expo', 'generated', 'coverage']);
const TOKEN_FILE = /tokens\.(css|ts|json)$|\.tokens\.json$/;

const RULES = [
  { id: 'raw-color', test: (l, f) => !TOKEN_FILE.test(f) && /(^|[^&\w])#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b/.test(l) && !/url\(|href=|#[0-9a-fA-F]{3,8}"?\s*\)?\s*;?\s*\/\/\s*id/.test(l),
    msg: 'Raw colour literal. Use a token (var(--sm-...) or theme.*).' },
  { id: 'raw-rgba', test: (l, f) => !TOKEN_FILE.test(f) && /\brgba?\(/.test(l), msg: 'Raw rgb/rgba. Use a token.' },
  { id: 'shadow', test: (l) => /(box-shadow|boxShadow)\s*:/.test(l) && !/var\(--sm-line-highlight\)|(box-shadow|boxShadow)\s*:\s*['"]?none/.test(l) || /\b(shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation)\s*:/.test(l),
    msg: 'Shadows are banned. Elevation is tone; the only light effect is the line.highlight top hairline.' },
  { id: 'gradient', test: (l) => /(linear|radial|conic)-gradient\(|LinearGradient/.test(l), msg: 'Gradients are decoration. Banned outside approved ceremony components.' },
  { id: 'uppercase', test: (l) => /text-transform\s*:\s*uppercase|textTransform\s*:\s*['"]uppercase/.test(l), msg: 'No all-caps labels. Sentence case only.' },
  { id: 'dash', test: (l) => /[\u2014\u2013]/.test(l), msg: 'Em or en dash. Banned everywhere, including comments.' },
  { id: 'arrow-cta', test: (l) => /\u2192|&rarr;|-&gt;<\/|->\s*<\//.test(l), msg: 'Arrow appended to link or button text. Say what the action does instead.' },
  { id: 'claim-words', test: (l) => !/^\s*(import\b|export\s.*\bfrom\b)|require\(/.test(l) && /["'`>][^"'`<]*(?<![-\w])(safe|safest|guaranteed?|pure|true price|fair value|risk[- ]free|correct price)(?![-\w])[^"'`<]*["'`<]/i.test(l),
    msg: 'Language boundary. Never true, correct, fair, safe, guaranteed or pure about a value.' },
  { id: 'animation-lib', test: (l) => /from\s+['"](framer-motion|motion\/react|motion|lenis|@studio-freight\/lenis|react-spring|animejs)['"]/.test(l),
    msg: 'Only GSAP (web) and Reanimated (mobile) are allowed animation libraries.' },
  // The value is extracted and tested directly rather than excluded with a
  // lookahead. A lookahead after \s* backtracks: with "font-family: var(--sm-...)"
  // the engine retries with \s* matching nothing, evaluates the lookahead at the
  // space, finds no "var(" there, and reports correctly tokenised CSS as a
  // violation. It also let the same declaration pass when written without a
  // space, which is the giveaway.
  { id: 'font-literal', test: (l, f) => {
      if (TOKEN_FILE.test(f)) return false;
      const m = /font-family\s*:\s*([^;]+)/.exec(l);
      if (!m) return false;
      const value = m[1].trim();
      // A @font-face block must name the family it is defining. Nothing else may.
      if (/^['"][^'"]+['"]$/.test(value) && /@font-face|font-face/.test(l)) return false;
      return !value.startsWith('var(--sm-font-family');
    }, msg: 'Font family literal. Use var(--sm-font-family-*).' },
  { id: 'spinner', test: (l) => /\b(Spinner|ActivityIndicator|animate-spin)\b/.test(l), msg: 'No spinners. Loading shows the rule-line skeleton and states what is loading.' },
  { id: 'emoji', test: (l) => /\p{Extended_Pictographic}/u.test(l), msg: 'No emoji in product UI or copy.' },
];

function* files(p) {
  const s = statSync(p);
  if (s.isDirectory()) { for (const e of readdirSync(p)) if (!SKIP_DIR.has(e)) yield* files(join(p, e)); }
  else if (EXT.has(extname(p))) yield p;
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['apps', 'packages'];
let count = 0;
for (const t of targets) {
  let it; try { it = files(t); } catch { continue; }
  for (const f of it) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const r of RULES) {
        if (line.includes(`design-lint-disable-line ${r.id}`)) continue;
        if (r.test(line, f)) { count++; console.log(`${f}:${i + 1}  ${r.id}  ${r.msg}`); }
      }
    });
  }
}
if (count) { console.log(`\n${count} design violation${count > 1 ? 's' : ''}.`); process.exit(1); }
console.log('Design lint clean.');
