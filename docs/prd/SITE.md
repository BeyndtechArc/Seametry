> **Living document. Owns:** the business pages: landing, how it works, the Key, and later pricing and legal.
> **Does not own:** the world's canon, naming, liturgy, and outward lines (`../BRAND_AND_WORLD.md`), the copy process for writing them (`../STORM-VOICE-SYSTEM.md`), the Explorer's evidence pages (`EXPLORER.md`), or the Terminal (`TERMINAL.md`). This document cites those rather than restating them.
> **Phase 1.** Ships in `clients/web`, alongside the Terminal, linking to the Explorer as its own separately hosted site rather than sharing a deployment with it. Pricing and legal are gated separately, below.

# Site

These are the pages a visitor who has never heard of Seametry lands on:
what it is, why an ETF and not a bundle, and what the Key means. They are the
front door to the Explorer for the same audience `PRODUCT_ARCHITECTURE.md`
section 6 names for it: the public, researchers, press, judges. They are not a
fifth surface with their own users or phase; they are how that audience
arrives. Linking to the Explorer, not embedding it: the two are deployed
separately, `decisions/2026-09-27-web-app-and-payments.md` records why.

**Why this document exists.** No document owned these pages before it. They
had drifted into the Explorer's own generator, alongside an engineering status
table that belongs to the README and business positioning that belongs here,
which blurred the Explorer's one job: evidence a stranger can check. Recorded
in `../decisions/2026-09-27-web-app-and-payments.md`.

---

## 1. Pages

### Landing (`/`)

The one screen that has to answer, before a word is read, what goes wrong
without Seametry. Built from the Incident hero pattern in
`.claude/skills/seametry-design/references/patterns.md` section 2 (Landing),
composed from real components with real or labelled fixture data, never a
screenshot.

**What it is not built from yet.** The template opens on a replayed incident,
a scheduled corporate action, an issuer halt, missing issuer quotes, and the
oracle observations and executable route beneath them, all on one scrubbable
timeline. No raw UNHx payload has been captured (`README.md`'s open items), so
that specific replay cannot ship honestly today. Which real, already captured
evidence opens the page instead, the multiplier staleness finding or the
devnet melt that succeeds while an issuer has frozen a constituent, or whether
UNHx is captured first, is Storm's call, not a default to guess at.

Everything below the hero: the claim grid, a living fragment of a real lot
entry, the live assay feed, the verification ritual embedded, the loop, the
proof strip and agent panel, and the register footer, exactly as the Landing
template lays them out.

**Copy.** The one-liner, the pitch, and the judges' three sentences are
canonical, word for word, from `../BRAND_AND_WORLD.md` section 10. Nothing
here paraphrases them. Any copy this page adds beyond those lines follows
`../STORM-VOICE-SYSTEM.md`.

### How it works (`/how-it-works`)

Answers, in order: what a tokenized stock actually is (a claim, not the
underlying), why a bundle of them is not an ETF, and how the Hall's open
authorized participant set differs from a closed one. Each claim in the Claim
grid pattern must be literally true of the shipped product, per
`foundations.md` section 1, law 5.

### The Key (`/the-key`)

The Key template from `patterns.md` section 2: a still page, no motion at all,
naming the program ID, the upgrade authority, and either the transaction that
made the program final or the words "Key still in hand." The Hall's three
guarantees are stated word for word from `HALL.md` section 1, matching how
`MOBILE.md` section 10 requires the same sentence to appear in the app's own
About screen. One sentence, the same everywhere it appears, is what makes it
a guarantee rather than a claim that drifts by surface.

---

## 2. What does not exist yet, and what unlocks it

| Page | Trigger |
|---|---|
| Pricing | The first paid feature ships. Until then this repository's own design rule bans a pricing teaser before a product exists (`patterns.md` section 1, banned sections) |
| Privacy notice | Before sign-in exists, since a linked wallet is personal data (`API.md` section 7) and this is where the deletion path it requires is described in plain language, alongside the endpoint that performs it |
| Terms | Before sign-in exists, alongside the privacy notice |

## 3. Rules that apply here

Every rule in `.claude/skills/seametry-design/SKILL.md` applies, including
the six universal states, tokens only for every value, and the review gate
before anything here is called done. Every figure this document's pages show
is rendered from what the Go core computed; nothing on a business page
computes anything of its own. `ENGINEERING_STANDARD.md` section 16 applies to
every word: no direction, size, timing or suitability is recommended, and
nothing is called true, correct, fair, safe, guaranteed or pure.
