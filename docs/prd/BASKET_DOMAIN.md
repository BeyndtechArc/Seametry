> **Living document. Owns:** basket domain arithmetic: the holdings boundary, recipe conformance vectors, off-chain basket valuation, weighting and drift, delivery standard evaluation, and execution planning for baskets.
> **Does not own, despite containing text about them:** issuer prerogative decoding and live multiplier resolution (now `../SERVICE_CATALOG.md` section 3.1), policy and determinism (now `../ENGINEERING_STANDARD.md` sections 8 and 15), and the TypeScript package layout it describes (retired; the Go core is the single authority). Those sections are pending removal from this file.
> **Core, from phase 0.** Recipe vectors and valuation are foundational, not deferred: the Rust program is bound to the Go implementation by the shared vectors this file specifies.

# PRD 0: Seametry Core

The assay library. Pure TypeScript that every service and app imports, plus the recipe specification the Hall must match to the unit.

Revision 3.

---

> **Superseded in part by `seametry-02-reconcile.md`.** The modules below are now Go packages under `internal/`, not TypeScript packages. Clients consume a generated client and never compute decisions. Recipe vectors live in `spec/recipe/vectors/`, shared by Go and Rust. Amounts are integer atoms plus scale.


## 1. What changed, and why

- **The Hall is price-blind.** NAV is computed off-chain only. The Rust conformance surface shrinks from NAV to recipe arithmetic, which is smaller and removes price manipulation from minting entirely. See PRD 2.
- **Issuer prerogatives are a first-class type,** decoded from chain on every read, never assumed from a published list.
- **Live multiplier resolution is specified,** because the field named `multiplier` is frequently stale.
- **Good Delivery evaluation lives in the core,** driven by published policy.
- **Canonicalization is fixed** to RFC 8785.

---

## 2. The boundary

The core never learns where holdings live.

```
HoldingsSource {
  getHoldings(basketId, owner) -> Holding[]
}
```

`DirectHoldings` reads a wallet's token accounts. `HallHoldings` derives a holder's position from the alloy's units per share. NAV, assay, weighting and planning consume the interface and never branch on which answered. Any function that needs to know which one it is talking to is a design failure.

---

## 3. Modules

### 3.1 `packages/domain`

Types only. No I/O, no app dependencies.

- **Constituent.** Mint, token program, decimals, issuer, grade, redemption path, jurisdiction exclusions, dividend mechanism (`multiplier`, `mint_to`, `unknown`).
- **Grade.** `entitlement`, `certificate`, `interest`, `ungraded`.

| Grade | Meaning | Example |
|---|---|---|
| `entitlement` | redeemable one to one into a security entitlement via a regulated broker | Backpack Securities via Sunrise |
| `certificate` | tracker certificate; a claim on the issuer that settles to cash | xStocks by Backed |
| `interest` | proportional interest in a vehicle holding private shares | PreStocks |
| `ungraded` | not classified; blocks execution by default | any new issuer |

- **Prerogatives.** See 3.2.
- **ReferenceObservation.** Never a naked number: identity, denomination, value, observed at, source, stated methodology, market status of the underlying, verification state, computed freshness.
- **MarkedValuation.** For constituents with no continuous reference: value, date struck, stated methodology, derived `markAgeDays`.
- **Recipe.** Units per share per constituent, derived from alloy state. Never stored as weights.
- **Alloy, Allocation, Holding, Claim, Hallmark, PolicyDocument.**
- **Holding** retains raw amount, resolved live multiplier, and UI amount. Raw and UI are never conflated.

### 3.2 `packages/prerogatives`

Pure decoder from mint account data to `Prerogatives`:

| Field | Source |
|---|---|
| `freezeAuthority` | mint freeze authority |
| `permanentDelegate` | PermanentDelegate extension |
| `pausable`, `paused` | Pausable extension |
| `transferHook` | hook program, or `initialized_disabled`, or none |
| `defaultAccountState` | DefaultAccountState extension |
| `permissionedBurn` | where present |
| `scaledUiAuthority` | ScaledUiAmount authority |
| `mintAuthority` | mint authority |

`initialized_disabled` must be reported distinctly from `none`. A hook that exists but is switched off can be switched on.

Reference fixture: as reported in July 2025, xStocks mints carried PermanentDelegate, FreezeAuthority, Pausable, Metadata and Scaled UI Amount, with Confidential Balances and Transfer Hooks initialized but disabled. The decoder is tested against real mainnet mint data captured as fixtures, and it always reads live. The published list is evidence of intent, not a guarantee of current state.

### 3.3 `packages/multiplier`

Scaled UI configuration carries `multiplier`, `new_multiplier`, and `new_multiplier_effective_timestamp`. The live value is `new_multiplier` once the effective timestamp has passed, otherwise `multiplier`.

This is not pedantry. An independent on-chain analysis found the field named `multiplier` stale on 370 of 927 xStock mints, and 631 of 640 activations taking effect outside the US regular session. A reader of the obvious field is one corporate action behind, and most corporate actions land while the market is closed.

- UI amounts are computed with the Token-2022 library helper for the resolved multiplier, never reimplemented.
- Reinvested dividends may be net of tax withholding; the same analysis observed 30 percent withheld on one xStock. Display as "reinvested, net of withholding where applicable".

Reference: https://github.com/iamrobertmoore/record-date

### 3.4 `packages/assay`

Formerly `preflight`. Pure. No I/O. Deterministic.

- Runs per constituent, aggregates per basket. There is no separate basket path.
- Emits one of four states per value, reason codes, and the weakest evidence present.
- `inputDigest`: SHA-256 over the RFC 8785 canonical JSON of every input, including the policy version. Identical inputs produce byte-identical digests on every machine.

### 3.5 `packages/policy`

Policy is data, not code. Versioned documents loaded at runtime:

staleness windows per source; quote sizes; price-impact ceilings; drift bands; Good Delivery rules; seal cadence; notification thresholds; market calendar version.

Every decision records the policy version that produced it. A consumer with different thresholds receives a file, not a fork.

### 3.6 `packages/nav`

Off-chain only. The Hall never computes value.

- Alloy NAV per share: sum over constituents of units per share, resolved to UI amount, times executable price at the policy's reference size.
- Allocation value: sum of UI holdings times executable price.
- Executable price at size, never mid. It is the number a user would actually receive.
- Refuses to produce a figure when any constituent lacks an acceptable observation. A partial NAV looks complete and is worse than none.
- Always reports the weakest evidence it contains.
- For pre-IPO constituents, states the executable price and the marked valuation with its age, side by side.

### 3.7 `packages/recipe`

**The conformance specification.** The exact arithmetic the Hall performs, written in TypeScript with published test vectors. The Rust program passes the identical suite. Any divergence is a failing test, not an exploit.

```
required_in(i, n) = ceil ( n * ledger[i] / supply )     favours the Hall
out(i, n)         = floor( n * ledger[i] / supply )     favours the Hall

expected[i] = ledger[i] + pending[i] + unclaimed[i]
sync(i):
  fold vested pending into ledger
  if actual[i] > expected[i]: pending += surplus, vest restarts over W
  if actual[i] < expected[i]: deficit consumes pending first,
                              then falls pro rata on ledger and unclaimed
```

All intermediates in u128. Overflow bounds documented per field.

Required vectors: genesis; minimum share; maximum share; donation then strike; dividend credit then strike inside the vest window; seizure with outstanding claims; seizure larger than pending; multiplier-only issuer with no raw change; twelve constituents with mixed decimals.

### 3.8 `packages/weights`

Schemes for allocations: `equal`, `curated` with a stated reason per weight, `market_cap`. Drift detection against a band; rebalancing proposed on drift, never on a calendar.

Alloys have a fixed recipe, so their value weights drift by design. The core reports that drift for information and never proposes trades against it. A new formula is a new alloy.

### 3.9 `packages/delivery`

Evaluates Good Delivery against the policy's published rules. Returns `good_delivery` or `ngd` with every failing reason.

Proposed v1 rules for a constituent:
- grade is not `ungraded`
- mint decodes cleanly; issuer is in the registry
- default account state does not freeze new accounts, or the Hall's accounts are verified thawed
- transfer hook is absent, disabled, or a published hook program
- an executable quote exists at the reference size within the price-impact ceiling
- the live multiplier resolves

For an alloy: every constituent is Good Delivery; the share mint carries no prerogatives; twelve constituents or fewer; genesis at or above the policy minimum.

### 3.10 `packages/execution`

Produces plans, never executes them.

- **Allocation buy:** one Jupiter leg per constituent; expected output, enforced floor, every fee line, route per leg.
- **Alloy acquisition,** in preference order: secondary pool swap if depth allows; direct strike if the user holds the constituents; assembly otherwise, with partial-fill recovery into an allocation.
- **Melt:** redeem, then withdraw legs; legs whose simulation fails are excluded and remain claims.
- Batched for a single approval where the wallet supports it.
- Never plans a leg it cannot assay.

### 3.11 `packages/source-*`

Issuer registry adapters (configuration-driven), a Jupiter adapter, a chain adapter. Adding an issuer requires no change to any other package. If it does, the interface is wrong.

---

## 4. Cross-cutting rules

- **Eligibility is per issuer.** Different issuers exclude different jurisdictions. A basket spanning them evaluates each constituent against its own issuer's rules.
- **Prefer the stronger grade.** Where one underlying exists from several issuers, as MSTR does from both xStocks and Backpack, prefer the entitlement and surface any fallback.
- **Cross-issuer corroboration.** One underlying priced by two independent issuers is a second opinion, not redundancy.
- **Language boundary.** The core never emits true, correct, fair or safe about any value.

---

## 5. Acceptance

- The prerogative decoder reproduces the known control set from captured mainnet xStocks fixtures, and distinguishes a disabled hook from an absent one.
- Given a mint whose `multiplier` field is stale, the resolver returns the live value, and a test proves the naive reader would be one action behind.
- Recipe vectors pass in TypeScript and are published for the Rust implementation.
- Identical inputs produce byte-identical `inputDigest` across runs and machines.
- A policy change alters decisions with no code change and records the new version.
- NAV refuses to produce a figure when any constituent lacks acceptable evidence.
- Good Delivery returns NGD with every failing reason, not just the first.
- The same basket produces identical valuation through `DirectHoldings` and `HallHoldings`.
- A new issuer adapter lands with no changes outside its own package.

## 6. Out of scope

Rendering, wallets, services, the program. PRD 1, PRD 2, and the architecture document.
