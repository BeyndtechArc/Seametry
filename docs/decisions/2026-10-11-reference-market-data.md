# Reference market data may be credentialed; transaction truth may not

**Decision record. Recorded 11 October 2026.**

This decision narrows, rather than reverses, `2026-09-23-oracles-on-chain.md`.

## Context

The original oracle decision correctly kept transaction-critical evidence verifiable from chain wherever possible. The Allocation product now needs historical equity series for inline charts, index cards, drift displays and reference valuation before Alloy share markets exist.

Pyth Core supports U.S. equity price feeds, but the set of sponsored push accounts on Solana is not equivalent to the full historical equity catalogue needed by the UI. Pyth Pro exposes equity symbology and authenticated historical OHLC data.

## Decision

**The Hall remains price-blind. Execution continues to use executable Jupiter quotes.**

For informational reference surfaces only, the web server may read Pyth Pro equity history using a server-side `PYTH_PRO_ACCESS_TOKEN`.

The browser never receives the credential.

The resulting observations are labelled:
- source: Pyth Pro;
- kind: price-only reference;
- methodology version;
- observation time.

A missing credential or missing constituent series makes the chart unavailable. The product does not fabricate, forward-fill or partially compute a basket series.

## Why

The product now has three distinct price concepts:

1. **Reference price / NAV:** useful for valuation, charts and comparison.
2. **Executable quote:** what a route can actually transact at a stated size.
3. **Alloy market price:** what a secondary share venue trades at, once one exists.

Only the second can authorize an Allocation swap. None of them enters Hall Strike or Melt arithmetic.

## Security boundary

Pyth's API key is server-only. It is never committed, exposed through `NEXT_PUBLIC_`, or used as an authority over wallet execution.

If an on-chain Pyth or Stork feed exists for the same underlying, the Office may later publish it as a separately attributable observation. It does not silently average sources into a synthetic consensus.
