#!/usr/bin/env node
// Enforces the SKILL.md build-note discipline as a real artifact instead of an
// internal reasoning step a fast model can silently skip under a short prompt.
//
// Rule: any changeset touching interface source (clients/web/src,
// clients/packages/ui/src, clients/mobile) must also add or modify at least one
// file under .plan/. This does not verify the note is *good*, only that
// one exists; catching quality is still a human or review-pass job. Catching its
// absence, which is the actual failure mode with a rushed model, is what this buys.
//
// Usage: node check-build-note.mjs <file1> <file2> ...
//   In CI:  node check-build-note.mjs $(git diff --name-only origin/main...HEAD)
//   Local:  node check-build-note.mjs $(git diff --name-only --cached)

const files = process.argv.slice(2);
if (!files.length) { console.log('No changed files passed in. Nothing to check.'); process.exit(0); }

// The interface moved under clients/ (docs/decisions/2026-09-27-repository-layout.md).
// Until 7 October 2026 this still matched apps/ and packages/ui/, which no longer
// exist, so it passed every change; shared/tools/design/build_note_test.mjs pins it.
const UI_PATH = /^clients\/(web\/src|packages\/ui\/src|mobile)\//;
const PLAN_PATH = /^\.plan\//;

const uiChanges = files.filter((f) => UI_PATH.test(f));
const planChanges = files.filter((f) => PLAN_PATH.test(f));

if (!uiChanges.length) {
  console.log('No interface source changes in this set. Build note not required.');
  process.exit(0);
}
if (planChanges.length) {
  console.log(`UI changes present (${uiChanges.length} file${uiChanges.length > 1 ? 's' : ''}), and ${planChanges.length} plan note${planChanges.length > 1 ? 's' : ''} found. OK.`);
  process.exit(0);
}

console.log('UI files changed with no build note under .plan/:');
uiChanges.forEach((f) => console.log(`  ${f}`));
console.log('\nBefore this change: write .plan/<slug>.buildnote.md using the template in SKILL.md');
console.log('(Surface, Template, Question, Sections, Components, Data, States, Ceremony, Names, Assumptions),');
console.log('then build to it. This check does not judge the note\'s quality, only that one exists.');
process.exit(1);
