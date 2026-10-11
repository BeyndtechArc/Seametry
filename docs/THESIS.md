# Seametry thesis

**Status:** living research note.  
**Last substantive change:** 11 October 2026.

This document preserves the current economic and product thesis behind Seametry so the same market-structure questions do not have to be reconstructed from conversation history.

## The simple model

Seametry separates four things that are often collapsed into one number or one product:

1. **The Hall** knows quantities. It is the keyless on-chain machine that turns a fixed basket of constituent quantities into Alloy shares, and Alloy shares back into constituent claims.
2. **The market** sets the Alloy share price once a secondary venue exists.
3. **The Office** observes issuer state, reference prices, executable liquidity and admission evidence.
4. **The Terminal** compares reference value, executable economics and market price so an open participant can decide whether a Strike or Melt is economically rational.

## Why the AP function exists

ETF shares trade separately from the assets they represent. Therefore the share can trade above or below the value of its underlying basket.

Traditional Authorized Participants close that gap by creating shares when the ETF trades rich and redeeming shares when it trades cheap. Seametry does not remove that economic function. It removes the protocol-level approval list: any capable wallet can perform it, subject to capital, liquidity, execution and issuer restrictions.

Permissionless access does not guarantee arbitrage participation.

## Strike

A Strike deposits the Formula's exact required constituent quantities and mints Alloy shares.

The Hall does not need prices to do this.

## Melt

A Melt burns Alloy shares and credits the holder with a quantity claim on every constituent.

The redeem instruction does not invoke constituent token programs. Delivery happens afterward, one leg at a time.

## Claim

A Claim is the Hall's recorded quantity entitlement to a constituent after Alloy shares have been melted but before that constituent has been successfully delivered.

A Claim is not cash, not a guaranteed market value, and not automatically a transferable security. If the issuer later permits transfer, the holder can withdraw the constituent. If assets are seized from the Hall, claim quantities can be reduced under the Hall's deficit accounting.

## Transaction shape

At the economic level there are two stages:

1. **redeem:** burn Alloy shares and establish all constituent claims.
2. **withdraw:** deliver each constituent independently.

At the transaction level, a Melt can therefore be one redeem transaction followed by one or more withdraw transactions. A basket with eight constituents can require one redeem plus up to eight independent withdrawals if delivery is executed separately for every leg. Wallet and transaction composition may later batch compatible steps, but the protocol semantics stay separate.

## NAV, market price and executable value

These must never be treated as the same number.

### Reference NAV

Reference NAV is a valuation:

`NAV = Σ constituent quantity × reference price`

It requires attributed price observations. Those can come from oracle or market-data sources.

The Hall does not consume NAV.

### Alloy market price

Once Alloy shares trade in an AMM or order book, buyers and sellers set the market price through actual trades and liquidity.

Before such a secondary venue exists, there is no meaningful independent Alloy market price. There is only a reference value for the Formula and the cost of acquiring or disposing of its constituents.

### Executable assembly cost

The amount it actually costs, at a stated size and time, to acquire all constituents needed for a Strike.

### Executable melt value

The amount a participant could actually realize by selling deliverable constituents received through a Melt, after route conditions and costs.

### Useful spreads

`reference premium/discount = (Alloy market price - NAV) / NAV`

`strike spread = Alloy market price - executable assembly cost`

`melt spread = executable constituent proceeds - Alloy market price`

An AP-like trader should care more about executable spreads than headline NAV.

## Why wallets displaying similar NAV does not peg the Alloy

Wallets may show similar valuations when they consume similar reference data. That is display convergence, not price enforcement.

A wallet can display an Alloy at 100 while the best executable sale is 94 if the secondary market is thin. A reference price is not a liquidity commitment.

## What happens before share liquidity exists

Before an Alloy has a real secondary market:

- there is no independently discovered Alloy price to drift away from NAV;
- there is no useful premium/discount arbitrage loop through the share market;
- Formula NAV and constituent execution costs can still be observed;
- users can still directly assemble and hold constituent Allocations.

Allocations are therefore useful as an adoption and execution bridge. They can generate real wallet usage, routing data and evidence of preferred formulas before Seametry can seed a liquid Alloy share market.

An Allocation is **not** a substitute for Alloy secondary liquidity. It is a direct constituent path.

## Curated Allocations before Alloy liquidity

While the Hall remains on devnet, mainnet Allocations can carry more of the product.

Seametry may publish versioned, rules-based Allocation indexes grouped by industry. A purchase remains direct ownership: the application orchestrates independently simulated constituent swaps into the holder's wallet. A named index is only used when a published methodology defines membership, weighting, review and drift treatment.

The first methodology uses equal weighting, current Good Delivery admission and public industry evidence. Existing holders are never silently rebalanced. A methodology change creates a new version and the holder decides whether to migrate.

This creates a graduation path:

`curated Allocation → observed demand and execution data → candidate Alloy → seeded share market → open Strike/Melt loop`

The Allocation catalogue is therefore not a placeholder for the Hall. It is the demand-discovery layer that can tell Seametry which Formulae deserve scarce launch liquidity.

## Reference market data for Allocations

The Allocation UI may use an oracle or market-data provider for **reference** valuation and charts. It must keep that observation separate from execution.

Current model:

- Pyth Pro equity history: price-only reference charts and index series.
- Jupiter quotes: executable buy/sell terms at the user's actual size.
- Hall: no oracle input to Strike or Melt.
- Future Alloy pool: independent secondary-market share price.

A missing oracle observation removes the chart or reference valuation. It does not prevent quantity accounting, and it must never be silently replaced by a stale or partial basket value.

## Why the Terminal exists

The Terminal makes the open AP function practical.

For an Alloy it should eventually distinguish:

- market price;
- reference NAV;
- premium/discount;
- executable assembly cost;
- executable melt proceeds;
- Strike or Melt spread after modeled fees;
- constituent depth at size;
- route freshness;
- venue concentration and fallback execution;
- issuer restrictions and claims;
- source age and provenance.

The Terminal should never present reference NAV as guaranteed redemption proceeds.

## Drift

An Alloy Formula is fixed in constituent quantities. If constituent prices move differently, their value weights drift.

The Hall does not rebalance. Rebalancing would require prices, trading discretion and additional execution assumptions. A materially different Formula should be represented by a new Alloy rather than silently changing the old one.

## Dividends and appreciation

Price appreciation is embodied in the market value of the underlying quantity entitlement. There is no separate profit account.

Issuer distributions may appear through mechanisms such as a Scaled UI multiplier or additional raw token credits. The Hall's accounting treats those according to the actual constituent mechanics.

## Yield

The base Hall should not lend constituents. Lending assets out would conflict with the inventory and redemption guarantees that make the Hall useful.

Potential future yield belongs in opt-in external strategy layers built around Alloy shares or wallet-held Allocations, with separate risk and liquidity semantics.

## Current thesis

The Hall is the invention.  
Good Delivery is the potential standard.  
The Terminal makes an open AP set economically usable.  
Allocations are the discovery, execution and demand layer from which liquid Alloys can graduate.  
Integrations and evidence history may become the distribution moat.

## Falsifiable questions

The thesis is not settled until evidence answers:

- Will capable wallets or market makers repeatedly Strike and Melt when spreads appear?
- Can Alloy share pools become liquid enough for meaningful secondary-market price discovery?
- Does constituent-aware claim handling matter frequently enough to influence product choice?
- Do users prefer direct Allocations, persistent managed views, or fungible Alloy shares?
- Will wallets, exchanges or protocols pay for Good Delivery evidence instead of reproducing it internally?
