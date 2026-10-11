# Seametry Equal-Weight Thematic Allocation Methodology v0.1

**Status:** published research methodology for mainnet Allocations.  
**Effective:** 11 October 2026.  
**Does not govern:** Alloy Formulae inside the Hall.

This methodology exists so a named Seametry "index" is a rule that can be inspected and reproduced, not a list of stocks selected behind a UI.

## 1. Holding form

The product is an **Allocation**. Every constituent is bought directly into the holder's wallet. Nothing is pooled, no basket share is issued, and Seametry does not custody the position.

An Allocation index is therefore a published target portfolio plus an execution plan. It is not an ETF and it is not an Alloy.

## 2. Eligible universe

A constituent may enter a published-rule Allocation only when all of the following are true at the time a new purchase is prepared:

1. the instrument is present in Seametry's current admissions register;
2. the policy engine gives it non-zero executable capacity at the applicable size;
3. its underlying public company can be identified unambiguously;
4. its industry evidence is available;
5. no unknown token extension or policy reason blocks execution.

A later policy block does not sell an existing holder automatically. It blocks new purchase plans under that version and is shown to the holder.

## 3. Industry classification

Where the underlying company files with the U.S. SEC, Seametry uses the **Standard Industrial Classification (SIC)** appearing in EDGAR as the first machine-readable industry observation.

SEC SIC is used as evidence of the registrant's reported type of business. It is **not** treated as an SEC endorsement, an investment-quality judgment, or a legal determination that two companies belong in the same investment product.

Source:
- https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces

A thematic rule may narrow a broad SIC class with an additional published business-description rule. If that narrowing requires human judgment, the card is labelled **Thematic Allocation** rather than pretending the classification is mechanically complete.

Seametry does not use a licensed commercial taxonomy such as GICS unless it has the rights to do so.

## 4. Duplicate representations

When the same underlying company is available from more than one tokenized-equity issuer:

1. prefer the stronger legal Grade under Seametry's published Grade model;
2. if Grades are equal, prefer the representation with greater measured executable capacity at the policy reference size;
3. if still tied, use a deterministic mint-address ordering.

The rule is applied when the methodology version is published. A holder's existing tokens are not silently swapped when a different representation later becomes preferable.

## 5. Weighting

Version 0.1 uses **equal weighting**.

For an index with `N` constituents, each purchase targets:

`target weight = 1 / N`

Equal weighting is a standard public index construction technique and is used here because it is deterministic and does not require Seametry to source or adjudicate float-adjusted market-cap data.

The actual wallet weights after execution may differ because prices move, minimum token units differ, routes have fees, and slippage is bounded rather than assumed away.

For background on public equal-weight index practice:
- https://www.spglobal.com/spdji/en/methodology/article/sp-us-indices-methodology/
- https://www.spglobal.com/spdji/en/methodology/article/index-mathematics-methodology/

Seametry does not use S&P constituent lists, names, marks or proprietary classifications.

## 6. Review and rebalancing

Membership is reviewed quarterly or when a constituent becomes unexecutable under policy.

**Existing holdings are never automatically rebalanced.**

The product observes current value weights and compares them with the published target. A rebalance may be proposed when any constituent drifts by at least **5 percentage points** from target. The holder must review and approve the exact trades and costs.

A membership change creates a new methodology version. Existing positions retain their recorded version until the holder explicitly migrates.

## 7. Historical routed-acquisition quote index

The first available history is **an indicative Jupiter buy-side route series**,
not a stock-price index, legal NAV or a user's realized performance.

For each currently admitted constituent:

1. At most once per UTC day, sample a read-only exact-input route from 25 USDC
   into its actual token mint with Jupiter, without executing the swap.
2. Record token output atoms, mint decimals, issuer, policy digest, context
   slot, route venues and observation time; no wallet identity is sampled.
3. At each UTC date on which **all** basket constituents have valid observations,
   compare that day's output atoms to the first complete date. Each constituent
   starts with equal-dollar exposure, and its initial raw-token quantity
   remains fixed for the comparison; the series does not rebalance.
4. Exclude incomplete dates and refuse to draw a series with fewer than two
   complete dates. No interpolation or artificial history is allowed.

This measures what the constituent acquisition quotes implied at a fixed size.
It varies with token prices, route quality, spread, depth and available venues.
It does **not** measure the underlying public equity's reference price.

Historical quotes:
- do not guarantee execution or settlement;
- are not official NAV or the user's P&L;
- omit user-specific transaction costs, network fees and Seametry's routing fee;
- cannot authorize a present-day purchase or sale;
- never enter Hall Strike or Melt arithmetic.

The feed needs only Jupiter and optional quote-observation storage.
No licensed equity data plan or oracle is required.

## 8. Purchase and exit

A Buy Allocation action is one user decision over several independently simulated swap legs. If the wallet supports batch signing, the set can be approved together. The transactions remain independently observable.

A Sell Allocation action exits only quantities attributed to that Allocation, capped by what the wallet still holds. It never sells unrelated quantities of the same token merely because they share a mint.

Partial failures remain explicit. Seametry does not silently substitute a constituent or retry outside the holder's approved bounds.

## 9. Current published baskets

The catalogue is deliberately broader than the currently executable set. A published row can remain research-only or incomplete while its constituents are being captured and evaluated; the interface must not expose a purchase action until every required representation is admitted.

Current catalogue:
- Prime Seven
- Compute Chain
- AI Cloud
- Physical AI
- Defense & Autonomy
- Attention Economy
- Digital Capital
- Global Rotation
- Cloud Core
- Private Frontier

`Private Frontier` is permanently research-only under this version because it compares three different legal access shapes: a Backpack private-company security entitlement, an Ondo private-market note and VCXx fund exposure. Other incomplete rows may become executable after their named representations are captured, graded and admitted.

The exact constituent set, research literature and catalogue filters live in `clients/web/src/lib/allocation/indexes.ts`.

## 10. Naming boundary

"Index" means there is a published, versioned rule behind the target portfolio. It does **not** mean the product is a registered investment company, a regulated benchmark, an ETF, or an Alloy.

When the membership rule still depends materially on editorial judgment, the interface must say **Thematic Allocation**.
