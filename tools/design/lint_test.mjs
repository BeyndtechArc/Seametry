/**
 * Regression tests for the design linter.
 *
 * The linter arrives as an import and is replaced wholesale when a new version
 * of the design system lands. A fix made inside it therefore does not survive
 * unless something outside it fails when the fix is gone. This file is that
 * something, and it lives here rather than in the skill for exactly that reason.
 *
 * Run: node --test tools/design/lint_test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINTER = '.claude/skills/seametry-design/scripts/design-lint.mjs';

/** Runs the linter over one file of source and returns the rule ids it reported. */
function lint(filename, source) {
  const dir = mkdtempSync(join(tmpdir(), 'seametry-lint-'));
  try {
    writeFileSync(join(dir, filename), source);
    let output = '';
    try {
      output = execFileSync('node', [LINTER, dir], { encoding: 'utf8' });
    } catch (e) {
      output = e.stdout ?? '';
    }
    // A violation line is "<path>:<line>  <rule>  <message>". Anything else is
    // the summary, which must not be mistaken for a rule id.
    return output
      .split('\n')
      .map((line) => /^\S+:\d+\s+(\S+)/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => m[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('tokenised font-family passes, with or without a space after the colon', () => {
  // A lookahead placed after \s* backtracks and reports both of these. The
  // asymmetry between them is what exposed the bug: only the spaced form was
  // flagged, which no real rule would do.
  assert.deepEqual(lint('a.css', '.x { font-family: var(--sm-font-family-ui); }'), []);
  assert.deepEqual(lint('b.css', '.x { font-family:var(--sm-font-family-ui); }'), []);
});

test('literal font-family is still reported', () => {
  assert.ok(lint('c.css', ".x { font-family: 'Helvetica'; }").includes('font-literal'));
  assert.ok(lint('d.css', '.x { font-family: Helvetica, sans-serif; }').includes('font-literal'));
});

test('a font-face block may name the family it defines', () => {
  const source = "@font-face { font-family: 'Switzer'; src: url('a.woff2') format('woff2'); }";
  assert.deepEqual(lint('e.css', source), []);
});

test('the rules that matter most still fire', () => {
  assert.ok(lint('f.css', '.x { color: #ff0000; }').includes('raw-color'));
  assert.ok(lint('g.css', '.x { box-shadow: 0 2px 4px black; }').includes('shadow'));
  assert.ok(lint('h.css', '.x { background: linear-gradient(red, blue); }').includes('gradient'));
  assert.ok(lint('i.css', '.x { text-transform: uppercase; }').includes('uppercase'));
});

test('a suppression comment with a reason silences one line', () => {
  const source = ".x { font-family: 'Switzer'; } /* design-lint-disable-line font-literal a reason */";
  assert.deepEqual(lint('j.css', source), []);
});
