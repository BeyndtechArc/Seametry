> **Living document. Owns:** off chain basket valuation, weighting and drift, delivery standard evaluation for whole alloys, and execution planning for baskets. The domain concepts specific to a basket (Alloy, Allocation, Holding, Claim) as more than the narrower on-chain types `internal/basket` already implements.
> **Does not own:** instrument identity, grade, prerogatives and live multiplier resolution (`../SERVICE_CATALOG.md` section 3.1, Registry), provider adapters and raw observation capture (section 3.2, Observation), executable routes and depth at size (section 3.4, Liquidity), the decision engine, policy documents and reason codes (section 3.5, Policy, and `../ENGINEERING_STANDARD.md` section 8 for the determinism rule it follows), and the Hall's own arithmetic (`HALL.md`, specified in `internal/basket`). None of those subjects gets restated here.
> **Core, from phase 0 for the recipe; unbuilt for everything else.** `internal/basket` and its shared vectors exist and are load bearing. NAV, weighting, delivery evaluation for a whole alloy, and acquisition planning are specified below and not yet built; `TERMINAL.md` is the surface that will need them first.

# Basket Domain

What a basket is worth, how it drifts, whether it may be formed, and how to acquire or unwind one. This is the layer above the Hall's own arithmetic: the Hall moves quantities and reads no price, and everything in this document is the off-chain reasoning that decides what quantities to ask the Hall for and whether the result was worth it.

---

## 1. What changed, and why

- **The Hall is price-blind.** NAV is computed off-chain only. The Rust conformance surface is the recipe arithmetic in `internal/basket`, not NAV. See `HALL.md`.
- **Issuer prerogatives and live multiplier resolution moved to Registry.** Both are decoded from live chain data on every read, never assumed from a published list, and both now live in one place: `../SERVICE_CATALOG.md` section 3.1.
- **The decision engine moved to Policy.** One pure function, one place: `../SERVICE_CATALOG.md` section 3.5 and `../ENGINEERING_STANDARD.md` section 8.
- **Canonicalization is fixed** to RFC 8785, implemented once in `internal/canonical` and used everywhere a digest is computed.

---

## 2. The boundary

This document never learns where holdings live.

```
HoldingsSource {
  getHoldings(basketId, owner) -> Holding[]
}
```

`DirectHoldings` reads a wallet's token accounts. `HallHoldings` derives a holder's position from the alloy's units per share. NAV, weighting and planning consume the interface and never branch on which answered. Any function that needs to know which one it is talking to is a design failure.

---

## 3. Subjects

### 3.1 Domain concepts

Grade and Prerogatives are Registry's (`../SERVICE_CATALOG.md` section 3.1); this document does not restate their tables.

What is specific to a basket, none of it built yet beyond what `internal/basket` already covers:

- **ReferenceObservation.** Never a naked number: identity, denomination, value, observed at, source, stated methodology, market status of the underlying, verification state, computed freshness.
- **MarkedValuation.** For constituents with no continuous reference: value, date struck, stated methodology, derived mark age in days.
- **Recipe.** Units per share per constituent, derived from alloy state, never stored as weights. `internal/basket.Leg` and `internal/basket.Alloy` implement the on-chain-matching arithmetic; they carry ledger, pending, unclaimed and the vest and claim state the Hall needs, not the richer per-constituent identity (issuer, grade, redemption path, jurisdiction exclusions, dividend mechanism) this section originally proposed. That richer identity is Registry's, joined in at the surface that renders a basket, not duplicated into the recipe type.
- **Alloy, Allocation, Holding, Claim, Hallmark, PolicyDocument.** Alloy and Claim exist on chain now (`chain/programs/hall/src/state.rs`) and in `internal/basket`. Allocation, Holding, Hallmark and PolicyDocument as basket-domain concepts are unbuilt.
- **Holding** must retain raw amount, resolved live multiplier, and UI amount separately, never conflating raw and UI, once it is built.

### 3.2 NAV

Off chain only. The Hall never computes value.

- Alloy NAV per share: sum over constituents of units per share, resolved to UI amount, times executable price at the policy's reference size.
- Allocation value: sum of UI holdings times executable price.
- Executable price at size, never mid. It is the number a user would actually receive.
- Refuses to produce a figure when any constituent lacks an acceptable observation. A partial NAV looks complete and is worse than none.
- Always reports the weakest evidence it contains.
- For pre-IPO constituents, states the executable price and the marked valuation with its age, side by side.

Not built. `TERMINAL.md` section 4 lists it as the first thing that needs it, blocked on oracle values being read from chain (`../decisions/2026-09-23-oracles-on-chain.md`).

### 3.3 Weighting and drift

Schemes for allocations: equal, curated with a stated reason per weight, market cap. Drift detection against a band; rebalancing proposed on drift, never on a calendar.

Alloys have a fixed recipe, so their value weights drift by design. This document reports that drift for information and never proposes trades against it. A new formula is a new alloy.

Not built.

### 3.4 Delivery standard evaluation

Evaluates Good Delivery for a whole alloy against Policy's published rules (`../SERVICE_CATALOG.md` section 3.5 evaluates one instrument at a time; this is that evaluation applied across every constituent of a formula plus the formula itself). Returns `good_delivery` or `ngd` with every failing reason, not just the first.

Proposed v1 rules for a constituent: grade is not `ungraded`; mint decodes cleanly and the issuer is in the registry; default account state does not freeze new accounts, or the Hall's account is verified thawed; transfer hook is absent, disabled, or a published hook program; an executable quote exists at the reference size within the price-impact ceiling; the live multiplier resolves.

For an alloy: every constituent is Good Delivery; the share mint carries no prerogatives (verified on chain, matches `HALL.md` section 4.7); twelve constituents or fewer; genesis at or above the policy minimum.

Not built.

### 3.5 Execution planning for baskets

Produces plans, never executes them. This is planning which acquisition path to take; turning an approved plan into a signed transaction is `../SERVICE_CATALOG.md` section 3.6, Execution, a different service with a different guarantee (it is the only surface that can cost a user money, isolated by deployment).

- **Allocation buy:** one Jupiter leg per constituent; expected output, enforced floor, every fee line, route per leg.
- **Alloy acquisition,** in preference order: secondary pool swap if depth allows; direct strike if the user holds the constituents; assembly otherwise, with partial-fill recovery into an allocation.
- **Melt:** redeem, then withdraw legs; legs whose simulation fails are excluded and remain claims, matching how `chain/programs/hall`'s `redeem` and `withdraw` already behave on chain.
- Batched for a single approval where the wallet supports it.
- Never plans a leg it cannot assay.

Not built.

---

## 4. Cross-cutting rules

- **Eligibility is per issuer.** Different issuers exclude different jurisdictions. A basket spanning them evaluates each constituent against its own issuer's rules.
- **Prefer the stronger grade.** Where one underlying exists from several issuers, as MSTR does from both xStocks and Backpack, prefer the entitlement and surface any fallback.
- **Cross-issuer corroboration.** One underlying priced by two independent issuers is a second opinion, not redundancy.
- **Language boundary.** This document, and everything it specifies, never emits true, correct, fair or safe about any value. See `../ENGINEERING_STANDARD.md` section 16.

---

## 5. Acceptance

- Recipe vectors pass in Go and Rust from the same committed files, checked by CI.
- NAV refuses to produce a figure when any constituent lacks acceptable evidence.
- Good Delivery for a whole alloy returns NGD with every failing reason, not just the first.
- The same basket produces identical valuation through `DirectHoldings` and `HallHoldings`.
- Weighting drift is reported, never acted on automatically.

## 6. Out of scope

Rendering, wallets, services outside this boundary, the program's own arithmetic (owned by `internal/basket` and specified in `HALL.md`). See `MOBILE.md`, `TERMINAL.md`, `HALL.md`, and the architecture document.
