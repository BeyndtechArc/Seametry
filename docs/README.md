# Documentation

**Last substantive change:** 24 September 2026.

---

## How this documentation works

The previous documentation set was written as layers: a revision, then a
revision that superseded it in part, then a reconciliation record that
superseded both in part. Every reader, human or agent, had to reconstruct
authority from banners before they could trust a sentence. That is the defect
this structure exists to remove.

Four rules:

**1. One topic, one owner.** Every subject has exactly one document that owns
it. That document is current. If two documents would disagree, one of them is
wrong about what it owns, and the fix is to move the content, not to add a
banner.

**2. Living documents are edited, never layered.** There are no revision
numbers and no "superseded in part" notices on a living document. When
something changes, the owning document is edited. Its header carries the date
of the last substantive change and nothing else.

**3. History lives in `decisions/`.** Why a decision was made is valuable and
permanent. It goes in an append only decision record, which is explicitly
historical and therefore cannot conflict with anything. Read a decision record
for reasoning, never for current state.

**4. Retired documents go to `archive/` with a stamp.** They are not deleted,
because they hold reasoning and evidence. They carry a header saying they are
not binding and what replaced them. Nothing in `archive/` may be cited in a
decision or built from.

---

## The map

### Foundation

| Document | Owns | Does not own |
|---|---|---|
| [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) | What Seametry is, the problem and its evidence, users, the four surfaces, the Terminal's shape, product lines, the capability to revenue map, phasing, positioning, risks | Service boundaries, engineering rules, brand |
| [SERVICE_CATALOG.md](SERVICE_CATALOG.md) | Service boundaries, data ownership per service, contracts, deployment topology, extraction criteria, the event catalog. Also the Registry specifics: grades, prerogative decoding, live multiplier resolution, quarantine | Product scope, engineering rules |
| [ENGINEERING_STANDARD.md](ENGINEERING_STANDARD.md) | Rules that hold everywhere: authority, decimals, time, evidence, point in time state, unknown values, determinism, idempotency, schema change, execution safety, receipts and redaction, degradation, asynchrony, dependencies, language, testing, observability, security | Product scope, service boundaries |

Read all three before writing code. They are short on purpose.

### Surfaces and product lines

| Document | Owns | Status |
|---|---|---|
| [prd/HALL.md](prd/HALL.md) | The Hall on-chain program: guarantees, instructions, arithmetic, prerogative handling, the devnet demonstration | Live. **The product.** Devnet is phase 1, mainnet is phase 3 |
| [prd/BASKET_DOMAIN.md](prd/BASKET_DOMAIN.md) | Basket arithmetic: holdings boundary, recipe conformance vectors, valuation, weights, delivery evaluation | Live. Core from phase 0. Contains sections pending removal, listed in its header |
| [prd/MOBILE.md](prd/MOBILE.md) | Mobile holding, monitoring, and approval surface | Live. Phase 2. Deliberately not a consumer brokerage |
| [prd/EXPLORER.md](prd/EXPLORER.md) | Public Explorer: the verification ritual, instrument pages, evidence pages, the Hall demonstration | Live. Phase 1 |
| `prd/TERMINAL.md` | Terminal: the creation and redemption console | **Not written.** Phase 2 |
| `prd/API.md` | The assay as a metered service, entitlements | Not written. Phase 3 |

### Brand, and the design system

| Document | Owns |
|---|---|
| [`.claude/skills/seametry-design/`](../.claude/skills/seametry-design/SKILL.md) | **Every executable design decision.** Tokens, colour, type, space, radius, motion values, component contracts, page templates, interface voice, and the linter that enforces them. Invoked automatically for any work that creates or changes UI |
| [BRAND_AND_WORLD.md](BRAND_AND_WORLD.md) | The world and its canon, the naming register, the world to code name map, the liturgy |
| [CRAFT.md](CRAFT.md) | Library evaluations and the reasoning behind them |

The split is execution against canon. The skill says what a surface must do and
fails the build when it does not. The world document says what things are
called and why the world is the way it is. When a value is in dispute, the
token file wins, because it is the only one a build reads.

**Pending:** `BRAND_AND_WORLD.md` sections 8 and 9 (visual language, motion)
and parts of `CRAFT.md` restate values the skill now owns and enforces. Those
sections need trimming to their canon, so that a colour or duration appears in
exactly one place. Until then the skill's tokens are authoritative.

The name map in `BRAND_AND_WORLD.md` section 4 is the only source for which
world name corresponds to which code name. World names live in interfaces.
Literal names live in code and in every external contract.

### History

| Document | What it is |
|---|---|
| [decisions/2026-09-24-depth-at-size.md](decisions/2026-09-24-depth-at-size.md) | What executable depth looked like across seven live instruments, why a refusal is an observation, and every assumption made to get a ceiling |
| [decisions/2026-09-23-oracles-on-chain.md](decisions/2026-09-23-oracles-on-chain.md) | Why oracle values are read from Solana accounts rather than credentialed APIs, what was measured, and what it costs |
| [decisions/2026-09-23-etf-spine.md](decisions/2026-09-23-etf-spine.md) | Why baskets became the spine and intelligence became the admission standard, the open authorized participant wedge, why lending is excluded, why one process, why retention became policy |
| [decisions/2026-09-22-reconciliation.md](decisions/2026-09-22-reconciliation.md) | Why Go became the single authority, why Redis was dropped, why public receipts are separately constructed and salted, why unknown enums stay observable |
| [archive/](archive/) | Nine retired documents, each stamped with what replaced it |

---

## Where to start

**Building a service:** `ENGINEERING_STANDARD.md`, then `SERVICE_CATALOG.md`
for the service you are touching, then the contract in `api/openapi/`.

**Building a surface:** `PRODUCT_ARCHITECTURE.md` sections 4 and 5, then the
surface's PRD, then `BRAND_AND_WORLD.md` sections 6 to 9 for the liturgy,
voice, and visual language, then `CRAFT.md`.

**Writing copy:** `BRAND_AND_WORLD.md` section 7, and
`ENGINEERING_STANDARD.md` section 16 for the hard prohibitions.

**Deciding whether something belongs in the product:**
`PRODUCT_ARCHITECTURE.md` section 7. A feature that cannot name an owning
service, a data asset, a user, and a revenue surface does not get built.

---

## Changing a document

1. Find the owner in the map above. Edit it. Update its last substantive
   change date.
2. If the change reverses a previous decision, add a record to `decisions/`
   saying what changed and why, then make the edit. The record is history; the
   living document is truth.
3. If you find two documents disagreeing, that is a defect in this structure.
   Fix ownership, do not add a note explaining the disagreement.
4. If a document is retired, stamp it and move it to `archive/`. Do not delete
   it and do not leave it in place.

---

## Open items

Tracked here because an untracked gap becomes folklore.

**Documentation**

- `prd/TERMINAL.md` and `prd/API.md` do not exist.
- The validation record in `PRODUCT_ARCHITECTURE.md` section 11 needs the
  pitch clinic's exact date, which is currently recorded only as
  "September 2026, ahead of Stocklana".
- `prd/BASKET_DOMAIN.md` still contains prerogative, multiplier, policy, and
  TypeScript package sections that are now owned elsewhere. They need removing
  from that file.
- `archive/CLAIMS_AND_LIMITATIONS.md` holds the reproduced UNHx evidence
  claims. They belong in `evidence/`, with the captured raw payloads beside
  them.
- The build prompt set in `archive/seametry-03-prompts.md` needs regenerating
  against the current architecture. Its invariants and its list of tasks that
  cannot be delegated remain valid input.
- No Terminal craft guidance exists in `CRAFT.md`.
- `BRAND_AND_WORLD.md` section 7 requires all outward copy to pass through
  `STORM-VOICE-SYSTEM.md`. That file does not exist anywhere in the repository.
  Either it is written, or the requirement points at
  `BRAND_AND_WORLD.md` section 7 itself and the reference is removed.

**Code**

Built and tested: `internal/canonical`, `merkle`, `amount`, `registry`,
`receipt`, `transport`, `solana`, `liquidity`, `policy` and `basket`, with
shared vectors and goldens in `spec/`, captured fixtures for mainnet mints and
aggregator responses, a generated Explorer, and CI.

- `packages/preflight` still computes decisions in TypeScript, which
  `ENGINEERING_STANDARD.md` section 2 forbids. `internal/policy` now does
  everything it did and more, so it can go. It should go in one change with its
  workspace entries, so the repository never shows two authorities.
- `programs/hall` does not exist. The toolchain installs (Solana CLI 4.3.0,
  Anchor 1.2.0, Rust 1.98.1), but that an Anchor program builds and tests here
  is not yet verified, and the documentation says WSL is required.
- Nothing is anchored on chain, so the verification ritual ends at the
  published root rather than at a transaction.
- `api/openapi/` does not exist. The public boundary has no contract yet.
- Depth is measured for buying only. Selling into USDC is unmeasured and can
  differ sharply on a thin pool.
- The depth ceiling of 100 basis points is an assumption, recorded in
  `decisions/2026-09-24-depth-at-size.md` with the rest.
- CI does not enforce the no-float rule outside `internal/canonical`, where it
  is checked at runtime.
- `-race` does not run on a Windows developer machine because it needs cgo.
  CI runs it on Linux.

**External**

- Backpack Securities' dividend mechanism is unconfirmed: a multiplier change
  or newly minted tokens. It is settled by capturing mint fixtures, not by
  reading documentation. The survey in `evidence/` covers xStocks only.
- Stocklana submission closes 25 September 2026, 16:00 ET, judging through
  2 October. Confirmed at hackathons.solana.com on 23 September 2026. The
  deadline shapes which release is cut and nothing else.
