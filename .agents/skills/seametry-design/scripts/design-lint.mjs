#!/usr/bin/env node
// Seametry design lint. Scans UI source for violations of the design system.
// Usage: node design-lint.mjs [paths...]   (defaults to apps packages)
// Suppress a single line with the comment: design-lint-disable-line <rule> <reason>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.mdx', '.html']);
const SKIP_DIR = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.expo', 'generated', 'coverage']);
const TOKEN_FILE = /tokens\.(css|ts|json)$|\.tokens\.json$/;
// The Lens (restricted glass material) may only appear inside these paths. Anything
// matching backdrop-filter, feDisplacementMap, or a specular box-shadow stack outside
// them is unauthorised sprawl, which is exactly how glassmorphism-as-slop happens.
const LENS_ALLOWED = /\/(lens|components\/lens|illustrations)\//;
const SURFACE_MARK = /(surface-raised|surface-tray|surface\.raised|surface\.tray|['"]raised['"]|['"]tray['"])/;

const RULES = [
  { id: 'raw-color', test: (l, f) => !TOKEN_FILE.test(f) && /(^|[^&\w])#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b/.test(l) && !/url\(|href=/.test(l),
    msg: 'Raw colour literal. Use a token (var(--sm-...) or theme.*).' },
  { id: 'raw-rgba', test: (l, f) => !TOKEN_FILE.test(f) && /\brgba?\(/.test(l), msg: 'Raw rgb/rgba. Use a token.' },
  { id: 'shadow', test: (l) => (/(box-shadow|boxShadow)\s*:/.test(l) && !/var\(--sm-line-highlight\)|(box-shadow|boxShadow)\s*:\s*['"]?none/.test(l)) || /\b(shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation)\s*:/.test(l),
    msg: 'Shadows are banned. Elevation is tone; the only light effect is the line.highlight top hairline.' },
  { id: 'gradient', test: (l) => /(linear|radial|conic)-gradient\(|LinearGradient/.test(l), msg: 'Gradients are decoration. Banned outside approved ceremony components.' },
  { id: 'uppercase', test: (l) => /text-transform\s*:\s*uppercase|textTransform\s*:\s*['"]uppercase/.test(l), msg: 'No all-caps labels. Sentence case only.' },
  { id: 'dash', test: (l) => /[\u2014\u2013]/.test(l), msg: 'Em or en dash. Banned everywhere, including comments.' },
  { id: 'arrow-cta', test: (l) => /\u2192|&rarr;/.test(l), msg: 'Arrow appended to link or button text. Say what the action does instead.' },
  { id: 'claim-words', test: (l) => !/^\s*(import\b|export\s.*\bfrom\b)|require\(/.test(l) && /["'`>][^"'`<]*(?<![-\w])(safe|safest|guaranteed?|pure|true price|fair value|risk[- ]free|correct price)(?![-\w])[^"'`<]*["'`<]/i.test(l),
    msg: 'Language boundary. Never true, correct, fair, safe, guaranteed or pure about a value.' },
  { id: 'apy-banned', test: (l) => !/^\s*(import\b|export\s.*\bfrom\b)/.test(l) && /["'`>][^"'`<]*\bAPY\b[^"'`<]*["'`<]/.test(l),
    msg: 'voice.md bans APY outright. Price movement, reinvested dividends and opted-in yield stay named and separated; never collapsed into a stablecoin-style rate.' },
  { id: 'animation-lib', test: (l) => /from\s+['"](framer-motion|motion\/react|motion|lenis|@studio-freight\/lenis|react-spring|animejs)['"]/.test(l),
    msg: 'Only GSAP (web) and Reanimated (mobile) are allowed animation libraries.' },
  { id: 'lens-scope', test: (l, f) => !LENS_ALLOWED.test(f) && (/backdrop-filter|backdropFilter|feDisplacementMap|feTurbulence/.test(l)),
    msg: 'The Lens material is restricted to lens/ and illustrations/ components. See foundations.md section 5b.' },
  // The value is extracted and tested directly. A negative lookahead placed
  // after \s* backtracks: the engine retries with \s* matching nothing,
  // evaluates the lookahead at the space rather than at "var(", and reports
  // correctly tokenised CSS as a violation. The giveaway was that the same
  // declaration passed when written without a space after the colon.
  // Regression covered by tools/design/lint_test.mjs.
  { id: 'font-literal', test: (l, f) => {
      if (TOKEN_FILE.test(f)) return false;
      const m = /font-family\s*:\s*([^;]+)/.exec(l);
      if (!m) return false;
      const value = m[1].trim();
      // A font-face block must name the family it defines. Nothing else may.
      if (/^['"][^'"]+['"]$/.test(value) && /font-face/.test(l)) return false;
      return !value.startsWith('var(--sm-font-family');
    }, msg: 'Font family literal. Use var(--sm-font-family-*).' },
  // The two elevation rules below are a same-line heuristic: they catch a tertiary or
  // touchText token written on the same source line as a raised/tray surface reference.
  // They will NOT catch the same mistake split across a multi-line JSX block, which is
  // the common real-world shape. Treat a clean run as a partial check, not a guarantee;
  // review elevation usage by eye on any component with nested surfaces.
  { id: 'elevated-tertiary', test: (l) => /var\(--sm-text-tertiary\)|theme\.\w+\.text\.tertiary/.test(l) && SURFACE_MARK.test(l),
    msg: 'text.tertiary is restricted to ground and sheet (the olive ground has a tight contrast budget). Use text.secondary on raised or tray.' },
  { id: 'elevated-touchtext', test: (l) => /var\(--sm-accent-touchText\)|theme\.\w+\.accent\.touchText/.test(l) && SURFACE_MARK.test(l),
    msg: 'accent.touchText is restricted to ground and sheet. On raised or tray use text.primary with a touch-coloured icon.' },
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
