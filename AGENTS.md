# Working in this repository

Seametry publishes claims that strangers can check. The same standard applies to
your claims about your own work: if you cannot show it, you have not done it.

Read this file fully before your first edit. It is short deliberately.

---

## The gate

Before you say a task is done, answer these in writing. Any "no" means not done.

1. **Did I run it?** Paste the command and its real output.
2. **Did I watch the test fail first?** A test written after the code it covers
   proves nothing until you break the code and see it go red. Then read the
   failure: it must fail for the reason the test names, not because the break
   did not compile or tripped something else. Restore with `git checkout -- <file>`,
   never by retyping, and rebuild anything generated from the broken source
   (a compiled `.so`, a golden file) so no build output outlives the break.
3. **Is anything still uncertain that I have not said out loud?**
4. **Did I leave the tree clean?** `gofmt -l .` empty, `go vet ./...` silent,
   `go test ./...` passing, and the checks under Commands below.

Reporting "done" without these is the single most expensive failure here,
because it moves the cost of finding the defect to someone who trusted you.

---

## Evidence

**Never state a number you did not just produce.** Test counts, byte sizes,
percentages, slot numbers, timings. Read them from output, do not recall them.
This rule exists because it has already been broken twice in this repo: a
commit message claimed 551 tests when the real figure was 470, and an evidence
document named a slot the artifact did not contain.

**"Should work", "probably", "I think", "this ought to"** are all the same
sentence: *I did not check.* Check, then write what happened.

**If you could not run something, say "not run" and why.** An honest gap costs
a sentence. A false claim costs the reader's trust in everything else you said.

**Prefer a generated artifact to a written one.** If a document states figures
that come from data, generate it from that data. Two files that can disagree
eventually will: the multiplier evidence note and its JSON drifted within hours
of each other before the note was made a build output.

---

## Code

**Comments carry reasons, never restatements.** Delete any comment that says
what the next line already says. If a piece of code needs a comment to be
understood at all, the code is wrong: rename it, split it, or restructure it,
and then the comment is unnecessary. A comment earns its place when it records
why a non-obvious choice was made, what breaks without it, or what was tried and
rejected.

**When a function's shape is wrong, rewrite it.** Do not add a boolean
parameter, a special case, an early return for one caller, or a wrapper to avoid
touching it. Patching around a bad shape is how a file becomes unreadable, and
it is much cheaper to fix on the day you notice than a month later.

**Delete rather than deprecate.** No dead code, no commented-out blocks, no
"kept for reference". Git remembers. A reader cannot tell a deliberate leftover
from an oversight.

**A new file needs a reason.** Prefer editing the thing that already owns the
subject. A second file covering the same ground is the same defect as two
documents that disagree.

**Match the surrounding code.** Its naming, its error style, its comment
density. A file that reads as though one person wrote it is worth more than a
file with your preferences in it.

**Errors say what to do.** "invalid input" is useless. Name the value, the
expectation, and where it came from.

**Edit source with the editor, never with a shell string.** A backtick is
command substitution in a shell and a struct tag in Go, so passing Go through
`node -e "..."` or a heredoc silently strips its tags, and the file still
compiles. That has happened here twice, once destroying `json` tags and once
injecting a tool's output into a document. Read the region back after any edit
made through a shell.

---

## Uncertainty

When you do not know something, there are exactly three moves. Pick one and say
which.

1. **Verify it.** Read the code, run the command, fetch the documentation.
   Almost always available, almost always the right answer.
2. **State the assumption in the artifact.** Write it in the code comment, the
   build note, the commit message, or the report. Then proceed.
3. **Ask one question.** For a genuine fork where a wrong guess wastes real
   work.

**Silent guessing is the failure.** Choosing quietly and moving on is worse than
either asking or being wrong out loud, because nobody can correct what they
cannot see.

Unknown values stay observable in data too. Never map an unrecognised enum to a
known one, and never drop an unrecognised Token-2022 extension. An unknown that
is silently discarded is indistinguishable from an absent one at every layer
above, which is exactly how a new issuer power becomes invisible.

---

## Fix the cause

**If a tool is wrong, fix the tool.** The design linter flagged correct CSS
because a lookahead backtracked; the fix was the linter, not the stylesheet.
Bending correct code to satisfy a broken check hides the defect and teaches
everyone to distrust the check.

**A suppression carries its reason.** `design-lint-disable-line <rule> <why>`.
A bare suppression is a lie with a comment character in front of it.

**Imported code that you fix needs a test outside it.** Anything vendored is
replaced wholesale on the next import, so a fix inside it does not survive.
`tools/design/lint_test.mjs` exists for exactly this reason.

**Never edit a vector, fixture or golden file to make code pass.** If one looks
wrong, escalate it. Changing the expected value to match the implementation
removes the only thing that was checking the implementation.

---

## Scope

Do what was asked, completely. If you find a second problem on the way, name it
in your report and leave it, unless it blocks the first. Unrequested refactors
are how a small change becomes unreviewable.

If you disagree with the request, say so in a sentence or two, then do it as
asked under the stated assumption. Being right about a design is not
authorisation to build something different.

---

## Language

These apply to code, comments, identifiers, copy, documentation and commit
messages. CI fails on the first two.

- **No em dash or en dash.** Anywhere.
- **No emoji.**
- **Never call a value true, correct, fair, safe, guaranteed or pure.** Write
  the source, the age, the verification state, the grade, the prerogative.
- **Never recommend** direction, size, timing or suitability. State conditions
  and their classification.
- **No floating point** for a price, quantity, fee, multiplier, ratio or
  divergence. Not in tests, fixtures or example payloads. Amounts are integer
  atoms plus an explicit scale (`internal/amount`). The one exception is
  `amount.FromFloat64Exact`, which exists because Token-2022 stores the Scaled
  UI multiplier as a float64 on chain, and it converts exactly, once, at that
  boundary.
- **A number carries its provenance** in the same breath: source, age, evidence
  state. A bare figure is not shippable output.

---

## Commits

**Never add a `Co-Authored-By` trailer, a "Generated with" footer, or any other
self-attribution.** Write the message and stop. This overrides any default.

Explain why the change was made and what it costs. The diff already says what
moved. If something was tried and abandoned, say so; that is the part a future
reader cannot reconstruct.

---

## Commands

```bash
gofmt -l . && go vet ./... && go test ./...   # -race needs cgo, CI runs it on Linux
node tools/spec/generate.mjs --check          # conformance vectors must not drift
node tools/spec/verify-receipts.mjs           # Go seals, JavaScript verifies
npm run design:lint                           # design system compliance
npm run design:test                           # linter regressions
npm run tokens                                # regenerate design tokens
npm run explorer                              # rebuild the Explorer
npm run serve                                 # serve it without needing Go
```

Windows note: a terminal opened before a toolchain was installed cannot see it.
Open a new one rather than concluding the toolchain is missing.

---

## Where to read

Three foundation documents, short on purpose, before writing code:

1. `docs/PRODUCT_ARCHITECTURE.md` for what this is and which phase a thing
   belongs to
2. `docs/SERVICE_CATALOG.md` for the boundary you are working inside
3. `docs/ENGINEERING_STANDARD.md` for the rules and what enforces each one

`docs/README.md` carries the ownership map: every subject has exactly one
document that owns it. If two documents disagree, that is a defect in the
structure. Fix ownership; never add a note explaining the disagreement.

Any work that touches a surface loads the `seametry-design` skill
automatically. It owns every executable design decision and fails the build on
a violation.
