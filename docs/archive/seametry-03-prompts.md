> **ARCHIVED, NOT BINDING.** Historical record only. Retired 23 September 2026.
> Build prompts written against the retired mobile first architecture. To be regenerated against `../PRODUCT_ARCHITECTURE.md`. Its invariants and its "Yours, not the agents" list remain useful input to that regeneration.
> Nothing in this file has authority over a living document. Do not build from it,
> do not cite it in a decision, and do not update it. See `../README.md`.

# Seametry: Calibrated Prompts

Revision 4. Replaces the build pack.

Each prompt is calibrated against the ways coding agents actually fail: inventing API shapes, reaching for floats, silently mapping unknown values, adding dependencies, and claiming success without evidence. Every prompt therefore states what to read, what already exists, what not to do, how acceptance is measured, what to report, and when to stop and ask.

---

## Shared context

Prefix every prompt with this block.

> **Seametry** is a basket-first broker for tokenized stocks on Solana. Binding documents, read before writing code: `docs/seametry-02-reconcile.md` (wins on any conflict), `docs/seametry-00-world.md`, `docs/seametry-prd-2-hall.md`, `docs/ENGINEERING_STANDARD.md`, `docs/SERVICE_CATALOG.md`.
>
> **Invariants.**
> - Go is the only authority for domain, policy, basket arithmetic and decisions. Clients render; they never decide.
> - Amounts are integer atoms plus explicit scale. Never a float, anywhere in a domain contract, including tests.
> - Every external record carries `source_event_at`, `received_at`, `persisted_at`, and where applicable `effective_from` and `effective_to`, in UTC.
> - Raw payloads are stored before normalization and addressed by SHA-256.
> - Unknown enum values remain observable. Never map an unrecognised value to a known one.
> - Every state-changing request takes an idempotency key.
> - The Hall is price-blind. No price, quote or oracle is ever an input to a program instruction.
> - No private key or seed phrase ever enters any Seametry system.
> - Never write true, correct, fair, safe, guaranteed or pure about any value.
> - Never write an em-dash in code, comments, copy or documentation.
>
> **Dependencies.** Add none without stating which rented or owned category it falls under and why nothing already present suffices.
>
> **Evidence of done.** Paste the exact test command and its output. "It should work" is not evidence.

---

## Order

The demo path is S0, S1, S5, H1, D1, then C1 and C2. Everything else follows or runs alongside.

---

### S0 · Contract and repository

**Read:** the reconciliation record, sections 2 and 3; the existing Go server README.
**Exists:** `cmd/gateway`, `internal/domain`, `internal/policy`, `internal/store`, migrations, in the Go server. The public repository still holds the TypeScript `packages/preflight`.

**Build:**
- Restructure to the layout in reconciliation section 3 without breaking any existing Go test.
- Write `api/openapi/v1.yaml` covering the existing market-state endpoint and health endpoints exactly as they behave today.
- Generate Go server interfaces with oapi-codegen and the TypeScript client into `packages/client` with openapi-typescript.
- Retire `packages/preflight` in the same change; leave a README pointing at the Go authority.
- Add CI: `go test -race ./...`, `go vet ./...`, contract drift check (regenerate and fail on diff), client typecheck.

**Do not:** change any existing endpoint's behaviour; hand-edit generated files.
**Accept:** CI green; regenerating produces no diff; the existing curl examples in the server README still return the same shapes.
**Report:** the final tree, every moved package, any test that needed changes and why.
**Stop and ask** if an existing endpoint's actual behaviour differs from its documented behaviour.

### S1 · Registry: grade, prerogatives, live multiplier

**Read:** PRD 0 sections 3.1 to 3.3; reconciliation D4 and D6.

**Build:**
- Capture mint account data for at least three xStocks and three Backpack Securities mints from mainnet into `fixtures/mainnet/`, each with its slot and capture time.
- Write `docs/FINDINGS_EXTENSIONS.md` recording, per mint, exactly which Token-2022 extensions are present and their current configuration. For Backpack mints, state whether Scaled UI Amount is present. If you cannot determine how Backpack dividends land, say so.
- A pure Go decoder from mint data to prerogatives: freeze authority, permanent delegate, pausable and paused, transfer hook (present, `initialized_disabled`, or absent), default account state, permissioned burn, scaled UI authority, mint authority, and `unknown_extensions` for anything unrecognised.
- A live multiplier resolver: `new_multiplier` once its effective timestamp has passed, otherwise `multiplier`. Multipliers are held as exact decimals, never floats.
- Effective-dated registry records per the standard. A mismatch between an expected corporate action and observed multiplier state quarantines the instrument.

**Do not:** trust any published extension list; round multipliers through float; drop unknown extensions.
**Accept:** decoding each fixture reproduces its recorded extension set; a test proves a reader of `multiplier` alone would be one action behind on a fixture where the fields differ; an unknown extension surfaces in output; quarantine blocks a build request in a test.
**Report:** `FINDINGS_EXTENSIONS.md` in full.
**Stop and ask** if any mint shows an extension combination not covered here.

### S2 · Observation

**Read:** service catalog, event and time model, failure containment.

**Build:** raw capture to an object-store interface (filesystem adapter for development, S3-compatible for production); normalized observations with all four timestamps; adapters for xStocks public endpoints, Jupiter quotes, and Solana RPC; Chainlink and Stork adapters that return typed `UNAVAILABLE` or `CREDENTIAL_BLOCKED` without failing ingestion. Fetch current provider documentation first and record endpoints and response shapes used in `docs/SOURCES_*.md`.

**Do not:** acknowledge ingestion as durable if raw capture failed; relabel an old observation as fresh on timeout.
**Accept:** replaying stored raw payloads reproduces normalized observations byte for byte; a simulated timeout records the attempt and exposes `UNAVAILABLE`.
**Report:** the `SOURCES_*.md` files.
**Stop and ask** if a provider's live response contradicts its documentation.

### S3 · Market State

**Build:** freshness per source, US market sessions and holidays as versioned data, divergence in exact decimals, point-in-time snapshots, and the four evidence states from the world document (verified, unverified, stale, unavailable) as an explicit field separate from source state, transport state and session.
**Accept:** the service can answer both "what do we know now" and "what did Seametry know at time T" for the same instrument, tested against a fixture where a late-arriving observation changes history.

### S4 · Liquidity

**Build:** size-specific quotes at 100, 1,000 and 10,000 USDC per constituent, route normalization with every fee line, expiry, and a depth-at-size curve.
**Do not:** reuse an expired quote, ever.
**Accept:** a quote past expiry is rejected by every consumer in tests.

### S5 · Basket

**Read:** PRD 2 sections 4.1 to 4.5; PRD 0 section 3.7; reconciliation D5.

**Build:**
- `spec/recipe/vectors/*.json`: the conformance vectors from PRD 0 section 3.7, in a language-neutral format with integer strings for every amount.
- Go recipe simulation passing every vector: required inputs round up, outputs round down, sync with linear vesting of upward credits over W, deficits consuming pending first then falling pro rata on ledger and unclaimed, u128 semantics via `math/big` or checked 128-bit arithmetic.
- Alloys and allocations; Good Delivery evaluation returning every failing reason; off-chain NAV from executable prices at the reference size, refusing partial baskets and reporting the weakest evidence.

**Do not:** let any Basket function read a price for recipe arithmetic.
**Accept:** every vector passes; a property test over random operation sequences holds the balance invariant; NAV refuses a basket with one unavailable constituent.
**Report:** the vector list with a one-line purpose each.
**Stop and ask** if a vector's expected value looks wrong. Do not "fix" a vector to make code pass.

### S6 · Execution (separate binary)

**Build:** intents; transaction builds for Jupiter swaps and Hall instructions; an allowlist of program IDs and instruction shapes validated before wallet handoff; simulation with balance deltas; approval snapshots binding a digest of instrument version, snapshot, quote, policy, wallet and message; invalidation on any material change.
**Accept:** mutating any bound input after approval invalidates it in tests; a transaction touching an unlisted program is refused before handoff.

### S7 · Receipt and the seal

**Read:** reconciliation D7 closely. It corrects revision 3.

**Build:** finality tracking; settled deltas and reconciliation against the approved bounds; the serial allocator (`MMYY` plus seven Crockford base32 characters, monotonic, unique, never reused); private body with a 32-byte random salt; separately constructed public body with no signature, wallet or exact amounts; leaves and interior nodes with the `0x00` and `0x01` prefixes; periodic sealing of the root through SPL Memo from a dedicated low-balance anchor key; stored inclusion proofs; certificate rendering.
**Accept:** a public body verifies against an on-chain root with no Seametry credentials; the private body verifies only with its salt; no public artifact contains a transaction signature, tested by scanning every public artifact.

### S8 · Alert

**Build:** subscriptions and delivery through Expo push, retrying independently of ingestion and execution. Copy follows the world document's voice.
**Accept:** a scripted devnet freeze reaches a device within the policy's latency target; a push outage leaves ingestion unaffected.

### H1 · The Hall

**Read:** PRD 2 in full.

**Build:** `programs/hall` in Anchor with `initialize_alloy`, `create`, `redeem`, `withdraw`, `sync`. `redeem` invokes no constituent token program. `create` mints by share count within caller maximums. Transfers use `transfer_checked` and resolve transfer-hook extra accounts from day one. Share mint is Token-2022 with metadata only. Fees and vest window are compiled constants.
**Accept:** the Rust tests load `spec/recipe/vectors/` and pass all of them; property tests from PRD 2 section 5 pass; a Trident harness interleaves mock issuer actions; twelve constituents with six hooked strike in one transaction on a local validator.
**Stop and ask** if any vector cannot be satisfied without an instruction the PRD forbids.

### D1 · Devnet: the survival demonstration

**Build:** mock issuer mints on devnet reproducing the extension sets recorded in `FINDINGS_EXTENSIONS.md`, plus one mint whose default account state is frozen. One script per scenario in PRD 2 section 7, each printing signatures and before-and-after alloy state.
**Accept:** all nine scenarios run in order; the donor ends poorer; the freeze scenario ends with a successful melt and exactly one claim.

### C1 · Mobile

**Read:** world document sections 6 to 9; `docs/seametry-04-craft.md`.
**Build:** screens from PRD 1 section 7 on the generated client and `packages/ui`. Mainnet allocations at small size; devnet alloys labelled *Devnet Hall. Key still in hand.* everywhere they appear. Simulate before every signature request and show simulated deltas.
**Do not:** compute any decision on device.
**Accept:** PRD 1 section 14 in full, recorded on a physical mid-range Android device.

### C2 · Explorer

**Read:** `docs/seametry-04-craft.md` in full.
**Build:** the Explorer per the craft map: UNHx replay as the landing, the verification ritual, alloy and constituent pages, the Good Delivery list, the Key page.
**Accept:** a first-time visitor on a phone verifies a hallmark from its serial in two taps, watching their own browser do the verification; Largest Contentful Paint under 2.5 seconds on a mid-range Android phone over a throttled 4G profile.

---

## Yours, not the agents'

Confirm the deadline. Design your sponsor's mark. Choose Alloy No. 1's formula after S4 shows depth at size. Hold the mock issuer keys. Record the video leading with the freeze scenario. Pass copy through STORM-VOICE-SYSTEM.md. Later, in order: legal read, audit, the Key.
