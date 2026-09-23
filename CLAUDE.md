# Working in this repository

## Commits

**Never add a `Co-Authored-By` trailer, a "Generated with" footer, or any other
self-attribution to a commit message or a pull request body.** Write the
message and stop. This overrides any default behaviour.

Commit messages explain why a change was made and what it costs, not what files
moved. The diff already says what moved.

## Before writing code

Read these three, in order. They are short on purpose.

1. `docs/PRODUCT_ARCHITECTURE.md` for what this is and which phase a thing
   belongs to
2. `docs/SERVICE_CATALOG.md` for the boundary you are working inside
3. `docs/ENGINEERING_STANDARD.md` for the rules, each of which names the test
   or check that enforces it

`docs/README.md` carries the ownership map. Every subject has exactly one
document that owns it. If two documents disagree, that is a defect in the
structure: fix ownership, never add a note explaining the disagreement.

## The rules that get broken most often

- **No floating point.** Not for a price, quantity, fee, multiplier, ratio or
  divergence. Not in tests, fixtures or example payloads. Amounts are integer
  atoms plus an explicit scale (`internal/amount`).
- **No em dash** in code, comments, copy or documentation. CI fails on one.
- **Never call a value true, correct, fair, safe, guaranteed or pure.** State
  the source, the age, the verification state, the grade, the prerogative.
- **Unknown values stay observable.** Never map an unrecognised enum to a known
  one, and never drop an unrecognised Token-2022 extension. An unknown is a
  fact about the instrument, not a gap in our model.
- **A vector is never edited to make code pass.** If a vector in `spec/` looks
  wrong, escalate it. Changing the expected value to match the implementation
  defeats the entire purpose of the file.

## Evidence of done

Paste the command and its output. "It should work" is not evidence. A test
written after the code it covers is verified by breaking the code and watching
it fail.

## Commands

```bash
node tools/spec/generate.mjs           # regenerate conformance vectors, self-checked
node tools/spec/generate.mjs --check   # drift gate, what CI runs
go test ./...                          # -race needs cgo, so CI runs that on Linux
gofmt -l . && go vet ./...
```
