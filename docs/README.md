# Documentation

**Last substantive change:** 23 September 2026.

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
| `prd/EXPLORER.md` | Public Explorer: the devnet demonstration, evidence, the verification ritual | **Not written.** Phase 1, so this is the most urgent gap |
| `prd/TERMINAL.md` | Terminal: the creation and redemption console | **Not written.** Phase 2 |
| `prd/API.md` | The assay as a metered service, entitlements | Not written. Phase 3 |

### Brand and craft

| Document | Owns |
|---|---|
| [BRAND_AND_WORLD.md](BRAND_AND_WORLD.md) | The world, canon, voice, naming, the world to code name map, visual language, motion |
| [CRAFT.md](CRAFT.md) | Library choices, signature interaction moments, performance budgets |

The name map in `BRAND_AND_WORLD.md` section 4 is the only source for which
world name corresponds to which code name. World names live in interfaces.
Literal names live in code and in every external contract.

### History

| Document | What it is |
|---|---|
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

- `prd/EXPLORER.md` does not exist, and the Explorer is phase 1. The devnet
  demonstration it publishes is specified in `prd/HALL.md` section 7, and the
  verification ritual in `CRAFT.md`, but nothing owns the surface itself.
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
- The external validation of the idea and market, referenced 23 September 2026,
  is not recorded anywhere. Who said what, and what specifically was validated.

**Code**

- The repository contains a TypeScript scaffold, not the Go core these
  documents describe. `packages/preflight` computes decisions in TypeScript,
  which `ENGINEERING_STANDARD.md` section 2 forbids. Nothing in the repository
  yet satisfies the foundation.
- `api/openapi/`, `spec/recipe/vectors/`, and `spec/policy/golden/` are
  referenced by these documents and do not exist.
- No CI exists. Most rules in `ENGINEERING_STANDARD.md` name an enforcement
  mechanism that is not yet implemented.

**External**

- Backpack Securities' dividend mechanism is unconfirmed: a multiplier change
  or newly minted tokens. It is settled by capturing mint fixtures, not by
  reading documentation.
- Stocklana submission closes 25 September 2026, 16:00 ET, judging through
  2 October. Confirmed at hackathons.solana.com on 23 September 2026.
