# seametry-design

Seametry's design system, packaged as an agent skill so every interface prompt, however short, is built to the same standard.

## Install

1. Copy this folder to `.claude/skills/seametry-design/` at the repository root. Claude Code loads it automatically when UI work is requested.
2. Add the block below to `AGENTS.md` at the repository root so other coding agents follow the same system.
3. Generate tokens into the UI package:
   `node .claude/skills/seametry-design/scripts/build-tokens.mjs .claude/skills/seametry-design/assets/tokens/seametry.tokens.json packages/ui/src/generated`
4. Add the linter to CI:
   `node .claude/skills/seametry-design/scripts/design-lint.mjs apps packages`

Both scripts are plain Node, no dependencies.

## AGENTS.md block

```
## Interface work
Any change to UI, copy, styling, motion or naming follows .claude/skills/seametry-design/SKILL.md.
Read it before starting. For short or vague requests, write the build note it specifies before coding.
Design values come only from generated tokens. Run the design linter on changed paths before finishing.
```

## Contents

- `SKILL.md`: the laws, the shallow-prompt expansion protocol, workflow, review gate.
- `references/foundations.md`: principles, reference analysis, naming register, auction-house layer, colour, type, layout, motion, accessibility.
- `references/components.md`: atoms to templates, each with a contract.
- `references/patterns.md`: section patterns and page templates with wireframes.
- `references/voice.md`: lexicon, formats, standard phrases.
- `assets/tokens/seametry.tokens.json`: the single source of design values (W3C Design Tokens Community Group format).
- `scripts/build-tokens.mjs`: generates `tokens.css` and `tokens.ts`.
- `scripts/design-lint.mjs`: enforces the non-negotiables.
