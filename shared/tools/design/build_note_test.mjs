/**
 * Regression test for the build-note check.
 *
 * The check arrives with the design skill and is replaced when a new version
 * lands. Until 7 October 2026 it matched apps/ and packages/ui/, paths this
 * repository stopped using on 27 September, so it passed every change while
 * appearing to enforce the rule. This file fails if that happens again.
 *
 * Run: node --test shared/tools/design/build_note_test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const CHECK = '.claude/skills/seametry-design/scripts/check-build-note.mjs';

function check(...files) {
  return spawnSync('node', [CHECK, ...files], { encoding: 'utf8' }).status;
}

test('interface source changed with no build note fails', () => {
  for (const file of ['clients/web/src/app/page.tsx', 'clients/packages/ui/src/components.tsx', 'clients/mobile/app/index.tsx']) {
    assert.equal(check(file), 1, file);
  }
});

test('interface source changed beside a build note passes', () => {
  assert.equal(check('clients/web/src/app/page.tsx', '.plan/landing.buildnote.md'), 0);
});

test('changes outside interface source need no note', () => {
  assert.equal(check('server/cmd/capture/main.go', 'clients/web/tests/csp.spec.ts', 'clients/web/README.md'), 0);
});
