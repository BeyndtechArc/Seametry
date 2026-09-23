# Conformance vectors

Language neutral test vectors that bind every implementation: the Go core, the
Rust program, and the browser side verifier in the Explorer. They exist because
determinism across implementations is either a property of shared vectors or it
is a hope.

**Generated and self-checked by `tools/spec/generate.mjs`.** Never hand edited.

```bash
node tools/spec/generate.mjs           # regenerate, runs every self-check
node tools/spec/generate.mjs --check   # verify on-disk vectors match, write nothing
```

The `--check` form is the drift gate. It belongs in CI, and it fails if anyone
edits a vector file directly.

## The rule

**A vector is never edited to make an implementation pass.** A vector that
looks wrong is escalated, and either the specification changes (which is a
decision record) or the implementation is wrong. Adjusting the expected value
to match the code being tested defeats the entire purpose of the file.

See `docs/ENGINEERING_STANDARD.md` sections 8 and 17.

## What is here

| File | Binds |
|---|---|
| `canonical/vectors.json` | RFC 8785 canonical JSON, plus Seametry's refusal of non-integer numbers |
| `merkle/vectors.json` | Receipt tree geometry, leaf composition, inclusion proofs |

Not yet written, and required before their implementations begin:
`recipe/vectors/` (the Hall's arithmetic, shared with Rust), `policy/golden/`
(decision outcomes with their reason codes), `registry/` (mint fixtures
captured from mainnet with their slot and capture time).

## Two decisions these vectors encode

**Non-integer numbers are refused at canonicalization.** Amounts travel as
integer atoms plus an explicit scale. A fractional number appearing in a
canonical body means a float reached a domain contract, and the canonicaliser
is the cheapest place to catch it, because every digest passes through it.

**The Merkle tree uses RFC 6962 geometry, splitting at the largest power of two
strictly less than the leaf count.** The pairwise fold that suggests itself
first breaks on any count that is not a power of two. The obvious repair,
duplicating the final node, is CVE-2012-2459: it makes an n-leaf tree produce
the same root as the n+1-leaf tree built by duplicating its last leaf, so two
different sets of receipts become indistinguishable. RFC 6962 is defined for
every count and has no such collision, and the self-check asserts the
non-collision directly rather than trusting the construction.
