---
name: seametry-design
description: Seametry's design system and build discipline for every interface surface. Use this skill for ANY work that creates or changes UI in the Seametry repository, including screens, pages, components, sections, layouts, landing pages, the Explorer, the mobile app, charts, empty states, loading states, animations, icons, copy, microcopy, button labels, colours, typography, spacing, or theming, even when the request is short or vague such as "make the alloy page", "add a hallmark card", "clean up this screen", or "make it look better". Also use it when reviewing or critiquing UI, naming a new feature, or writing product copy.
---

# Seametry design

Seametry should feel like a great auction house that runs on Solana: quiet rooms, exact catalogues, provenance you can check, and one ceremony when something changes hands. This skill makes that the default outcome of any prompt, however brief.

## The five laws

1. Every number carries its provenance: source, age, evidence state.
2. Colour has jobs: green means touchable, blue means provenance, nothing else gets a hue.
3. Show the product, never a picture of it.
4. One ceremony per surface.
5. Nothing may claim what it cannot prove.

## When a prompt is short, expand it before building

A shallow prompt is a request to apply this system, not permission to improvise. Before writing code, produce a short build note in this exact shape and follow it:

```
Surface:     Explorer | Mobile
Template:    <from references/patterns.md, or "new" with justification>
Question:    <the one question this view answers for the user>
Sections:    <ordered, each from the section patterns, each with its question>
Components:  <from references/components.md; any new one is added there first>
Data:        <API fields rendered; fixture data labelled as such>
States:      default, loading, empty, stale, unavailable, error: how each looks
Ceremony:    <the one ceremony, or none>
Names:       <every user-facing name, from the register in foundations.md>
Assumptions: <anything decided without being told>
```

Then build to the note. If a genuine ambiguity would change the structure (which surface, which data exists), ask one question. Otherwise decide, state the assumption, and proceed.

## Workflow

1. **Locate.** Identify the surface and template in `references/patterns.md`. Read that template.
2. **Compose, don't invent.** Use components from `references/components.md`. A new component is added to that file first, with Answers, Anatomy, States, Data and Rules, then built.
3. **Name from the register.** Every user-facing noun comes from the register in `references/foundations.md` section 3. Code keeps literal names.
4. **Tokens only.** Colours, type, space, radius and motion come from generated tokens: `var(--sm-*)` on web, `theme.*` and `tokens.*` on mobile. Never a raw value.
5. **Write the words.** Every string follows `references/voice.md`. Buttons are verb plus object.
6. **Design every state.** All six universal states, rendered, not left to defaults.
7. **Run the gate** below, then the linter.

## Non-negotiables

- No shadows, gradients, glows, blur, or 3D decoration. Elevation is tone plus the single top hairline.
- No raw colours or font families. No emoji. No em or en dashes. No arrows appended to actions. No all-caps labels.
- No spinners. Loading is a rule-line skeleton with a sentence naming what is loading.
- GSAP on web, Reanimated and Skia on mobile. No other animation library.
- Gains and losses carry no colour. Decisions: ALLOW in primary text, WARN in provenance blue, BLOCK as an inverted stamp. No red anywhere.
- Never an estimate, never a price opinion, never true, correct, fair, safe, guaranteed or pure about a value.
- A source that said nothing is shown as "no observation", never omitted.
- Radius means touch: data rows 0, panels 4, anything actionable fully round.
- One Key per view. The Key sits in its tray and stays quieter than the figures above it.
- Dark and light modes both complete; dark is the default.
- Contrast at least 4.5:1 for text, measured against the real surface. `text.faint` is never used for readable text.

## Review gate

Before declaring done, answer each in writing. Any "no" means it is not done.

1. Does every section answer a named question?
2. Does every figure show its source, age and evidence state?
3. Is green used only on touchable things and blue only on provenance?
4. Are all six states designed and reachable in a gallery or story?
5. Is there at most one ceremony, and does it respect reduced motion?
6. Are all names from the register and all strings compliant with voice.md?
7. Is fixture data labelled?
8. Would an auction-house specialist be comfortable reading every sentence aloud to a buyer?
9. Does `node scripts/design-lint.mjs <changed paths>` pass?

## Commands

```bash
# Regenerate tokens after editing the source
node .claude/skills/seametry-design/scripts/build-tokens.mjs \
  .claude/skills/seametry-design/assets/tokens/seametry.tokens.json packages/ui/src/generated

# Lint changed UI
node .claude/skills/seametry-design/scripts/design-lint.mjs apps packages
```

Suppress a single line only with a reason: `design-lint-disable-line <rule> <why>`.

## References

Read the one you need, when you need it.

| File | Read when |
|---|---|
| `references/foundations.md` | Before any new component or page; for colour, type, space, motion, naming, the auction-house layer |
| `references/components.md` | Before building anything; to find or add a component contract |
| `references/patterns.md` | Before building a page or section; templates and wireframes |
| `references/voice.md` | Before writing any string |
| `assets/tokens/seametry.tokens.json` | The only place a design value may be changed |
