> **Living document. Owns:** the process for writing and checking outward copy: a pitch line, a deck slide, a tweet, an email, a video script, a README paragraph, anything read outside the product's own screens.
> **Does not own:** interface voice (register, lexicon, formats, standard phrases, buttons), owned entirely by `.claude/skills/seametry-design/references/voice.md`, which this file extends rather than restates. Does not own the canonical outward lines themselves either: the one-liner, the five words, the pitch paragraph and the judges' answers are `BRAND_AND_WORLD.md` section 10, and nothing here may contradict or replace them. Does not own the liturgy (section 6), the prohibitions (section 11) or the language boundary (`ENGINEERING_STANDARD.md` section 16); this file cites each rather than copying it.

# Storm Voice System

`voice.md` governs a UI string: short, inside a component, checked by the design linter. Outward copy is longer, leaves the product, and nothing checks it automatically. This file is the check a person runs by hand before it goes out.

---

## 1. What changes between a UI string and outward copy

Everything in `voice.md`'s register still applies: calm authority, lead with the fact, active voice, no exclamation marks, no em dash, no arrows. Two things change once copy leaves a single sentence and a single screen:

- **A paragraph carries one collision, not one idea per sentence.** `voice.md` fits a component. A paragraph gets to build: state the fact, then its consequence, then what Seametry does about it. Each sentence still does exactly one thing; the paragraph is where they accumulate.
- **There is no live number to attach provenance to.** A UI string shows "248.37, assayed 2s ago" because a real observation is on screen. Outward copy describing a capability in general terms says what the product does and does not do instead of inventing a figure to sound concrete. If a real number is available (a test count, a captured slot, a measured basis-point figure), it is used exactly as measured, per `AGENTS.md`'s evidence rule; if it is not, no number appears.

---

## 2. The check

Run every piece of outward copy through this before it goes out. Any "no" sends it back.

1. **Does it match `BRAND_AND_WORLD.md` section 10 rather than compete with it?** A new line may explain, or lead into, the one-liner and the pitch; it may not replace them with a different claim about what Seametry is.
2. **Does it violate section 11's four prohibitions** (obscure an operational fact, imply safety or purity or return, outrun the code, judge an issuer)? Outward copy is where "outrun the code" is easiest to break: a deck can describe phase 3 as though it shipped. State the phase.
3. **Does it cross the language boundary** (`ENGINEERING_STANDARD.md` section 16: never true, correct, fair, safe, guaranteed, pure; never a direction, size, timing or suitability recommendation)?
4. **Does every number in it come from something just measured**, per `AGENTS.md`'s evidence rule, or is it absent? A pitch deck repeating a stale test count is the same defect as a commit message doing it.
5. **Does it use the lexicon** (`voice.md`'s table: issuer, reference observation, executable quote, grade names, key/strike/melt/hallmark/seal) rather than the words on the right of that table?

---

## 3. Worked forms

Not new canon. Each applies the same register `voice.md` already sets, in a form it does not itself cover. Where one touches a fact already stated elsewhere, it is illustrative, not a new source for that fact.

**A tweet.** One collision, no hashtag stuffing, no exclamation mark.
> A tokenized Apple share and a cash claim that tracks Apple trade in the same pool at the same price. Seametry tells you which one you are holding, and who can freeze it.

**An email subject line.** States the fact, not a pitch.
> The Hall's melt still works when the issuer freezes a leg

**A deck bullet under "Why now."** One sentence, the collision leading.
> Token-2022 puts every issuer power on chain. Almost nothing reads it.

**A README opening line** (compare `README.md`'s own first paragraph, which already follows this): lead with the collision between what a tokenized stock looks like and what it is, not with a feature list.

---

## 4. Where copy is reviewed

Interface strings are caught by the design linter (`npm run design:lint`) where a rule exists; most of `voice.md`'s rules are register and cannot be linted. Outward copy has no linter at all. The check in section 2 is manual until a piece of it can be mechanized; if a rule here turns out to be checkable by pattern (a banned word, a number with no source cited beside it), it belongs in `.claude/skills/seametry-design/scripts/design-lint.mjs` as a proper rule, not duplicated as a second check here.
