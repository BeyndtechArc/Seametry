# seametry-design

Seametry's design system, packaged as an agent skill so every interface prompt, however short, is built to the same standard.

## Install

1. Copy this folder to `.claude/skills/seametry-design/` at the repository root. Claude Code loads it automatically when UI work is requested.
2. Add the block below to `AGENTS.md` at the repository root so other coding agents follow the same system.
3. Generate tokens into the UI package:
   `node .claude/skills/seametry-design/scripts/build-tokens.mjs .claude/skills/seametry-design/assets/tokens/seametry.tokens.json packages/ui/src/generated`
4. Add the linter to CI:
   `node .claude/skills/seametry-design/scripts/design-lint.mjs apps packages`
5. Add the build-note check to CI, against the PR diff:
   `node .claude/skills/seametry-design/scripts/check-build-note.mjs $(git diff --name-only origin/main...HEAD)`

Both scripts are plain Node, no dependencies.

## AGENTS.md block

```
## Interface work
Any change to UI, copy, styling, motion or naming follows .claude/skills/seametry-design/SKILL.md.
Read it before starting. For short or vague requests, write .plan/<slug>.buildnote.md using the
template in SKILL.md before writing any code. Design values come only from generated tokens.
Before finishing: run the design linter on changed paths, and run check-build-note.mjs against
this changeset so a missing plan note fails loudly instead of shipping silently.
```

This split matters more with a faster, cheaper model: a build note is a checked file, not an
internal reasoning step, precisely because the step most likely to get skipped under a short
prompt is the planning one, and only an artifact on disk can be checked for.

## Contents

- `SKILL.md`: the laws, the shallow-prompt expansion protocol, workflow, review gate.
- `references/foundations.md`: principles, reference analysis, naming register, auction-house layer, colour, type, layout, motion, accessibility.
- `references/components.md`: atoms to templates, each with a contract.
- `references/patterns.md`: section patterns and page templates with wireframes.
- `references/voice.md`: lexicon, formats, standard phrases.
- `assets/tokens/seametry.tokens.json`: the single source of design values (W3C Design Tokens Community Group format).
- `scripts/build-tokens.mjs`: generates `tokens.css` and `tokens.ts`.
- `scripts/design-lint.mjs`: enforces the non-negotiables.
- `scripts/check-build-note.mjs`: fails a changeset that touches UI with no matching file under `.plan/`.
- `scripts/generate-scale.mjs`: generates a perceptual OKLCH tonal scale from one anchor hex; used to produce `scale.*` in the tokens file.
