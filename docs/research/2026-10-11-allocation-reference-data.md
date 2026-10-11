# Allocation reference data options

**Observed:** 11 October 2026.  
**Scope:** charts, reference valuation and future protocol-grade pricing for Seametry Allocations and Alloys.

This note separates four price problems that are easy to collapse into "we need an oracle":

1. **Underlying reference price.** What the public equity or other referenced asset is observed at.
2. **Token execution price.** What the tokenized representation can actually be bought or sold for onchain at a stated size.
3. **Alloy secondary-market price.** What an Alloy share trades for once a share venue exists.
4. **Continuous or protocol-grade reference.** A signed price a lending, liquidation or derivatives contract can safely consume, including outside the underlying exchange session.

They are not interchangeable.

## Current Seametry boundary

- **Allocation execution:** Jupiter executable quotes and simulation. No oracle authorizes a swap.
- **Basket cards and research:** an optional historical reference series may be shown with source and observation time.
- **Good Delivery:** issuer controls, legal Grade and executable depth are admission evidence; an oracle is not a substitute.
- **Hall:** Strike and Melt remain quantity-only and price-blind.
- **Future Terminal:** compares reference NAV, executable assembly and melt economics, and the independent Alloy market price.

## Pyth

Pyth is the strongest immediate technical fit because the prototype adapter already exists and its Pro history API exposes equity OHLC data. The API requires a server-side bearer token.

Current commercial reality is material:
- Pyth Terminal offers view-only access without API access on its free plan.
- Pyth advertises a 14-day trial for its paid market-data products.
- Pyth's current plans page lists Pro starting at $2,500 per month, while the May 2026 Core-upgrade announcement listed a U.S. equities package at $5,000 per month. Treat the exact equity entitlement as a quote-time fact, not a hard-coded assumption.
- Pyth Indices supplies 24/7 single-name and macro reference products; licensing and pricing are scoped with the team.

Sources:
- https://app.pyth.com/plans
- https://www.pyth.network/blog/the-pyth-core-upgrade
- https://docs.pyth.network/price-feeds/pro/api/history
- https://www.pyth.network/blog/pyth-pro-and-pyth-indices-bring-24-7-pricing-to-stellar-s-4b-rwa-ecosystem

**Use now:** free trial or sponsored access for the World Fair build if available. Do not make paid Pyth equity access a launch dependency.

## Twelve Data

Twelve Data is the lower-cost candidate for ordinary web charts rather than an onchain oracle.

Its current documentation says:
- Basic is free but for internal/non-display usage.
- Business Venture is the client-facing display tier.
- external redistribution requires the applicable distribution rights/add-on;
- historical end-of-day U.S. equity data is available broadly, but the commercial-use terms still govern a public product.

Sources:
- https://twelvedata.com/pricing-business
- https://support.twelvedata.com/en/articles/9935903-us-equities-market-data
- https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage

**Use later:** price a licensed external-display plan after the World Fair if basket charts prove useful enough to pay for. This is likely a better economics match for UI history than buying a low-latency onchain oracle package.

## Stork

Stork is better matched to contract-critical RWA pricing than to a cheap catalogue sparkline. Its Solana case study with Spout describes pull-based signed stock/RWA updates used atomically for lending and liquidation, refreshing as fast as 10ms. Stork also describes equity and tokenized-stock venue aggregation for 24/7 RWA markets.

Sources:
- https://www.stork.network/case-studies/solana-rwa-oracle-spout-finance
- https://www.stork.network/blog/equity-perps-oracle

**Use later:** evaluate when an Alloy becomes collateral, derivatives infrastructure, or another contract must make a value-dependent decision onchain.

## RedStone

RedStone is already operating in the tokenized-security layer. It provides Securitize's SECZ feed on Solana and its TSSO work is designed for tokenized assets where an issuer or administrator is the authoritative NAV source.

Sources:
- https://www.redstone.finance/blog/redstone-brings-securitizes-secz-tokenized-equity-to-loopscale-on-solana
- https://www.redstone.finance/blog/tokenize-the-world-redstones-role-in-the-securitize-ecosystem

**Use later:** strong candidate for issuer-native or partnership-grade feeds, especially when Seametry needs legal-product NAV rather than merely the underlying exchange price.

## Product decision

Do not buy protocol-grade oracle infrastructure merely to draw basket charts.

For the World Fair:
1. keep the Pyth Pro adapter optional;
2. use a trial or partner key if available;
3. show "No reference observation" when it is not;
4. keep Jupiter as execution truth;
5. keep the Hall price-blind.

After real Allocation usage:
1. measure whether reference charts improve selection and retention;
2. if yes, price a licensed web market-data plan;
3. approach Pyth, Stork or RedStone only when 24/7 or contract-consumable pricing has a concrete revenue or risk-control job.

A later first-party series should also record **Seametry executable basket cost at standard notionals** from fresh routes. That series would answer a different and more useful question than NAV: what did this basket actually cost to assemble onchain at size?
