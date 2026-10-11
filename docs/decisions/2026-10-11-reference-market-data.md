# Oracle-free observation before licensed price feeds

**Decision record. Revised 11 October 2026 after field testing.**

This record is historical rationale. Current source boundaries are owned by
`docs/THESIS.md`, the published Allocation methodology, and the implementation.

## Context

The previous draft introduced a Pyth Pro adapter for index-card charts.
However, an authenticated equity-data subscription adds a cost and licensing
dependency before Seametry has a secondary Alloy market or contract-critical
price actions. The Hall does not use prices to Strike or Melt. Allocation
execution already relies on size-specific Jupiter route quotes and simulation.

## Decision

Remove Pyth Pro from the current production route. Start with a
**read-only, fixed-size Jupiter quote observation history**:

- one 25 USDC exact-input quote per currently admitted mint, sampled daily;
- store actual output raw atoms, timestamp, route, context slot and source;
- show a basket history only for dates where all constituents have observations;
- build a normalized fixed-unit series with no interpolated prices or
  automatic rebalancing;
- label its source and limitations clearly;
- keep records in optional inexpensive Redis REST storage, not in memory
  that vanishes on serverless deployment;
- secure the sampler as a CRON_SECRET-only route, not an open visitor endpoint.

This does **not** create a price oracle. The quote may be unavailable or
unexecutable at signing time, and is not a traditional equity price observation.

Current user trades still require fresh Jupiter terms, transaction simulation
and explicit wallet signature. No historical quote may authorize a trade.

## Why it is reversible

The data record contains mint, size, raw output, decimals, route, slot, and
sample time. If direct issuer reference prices, licensed display data or a
verified onchain oracle later become necessary, Seametry can publish those
as separate attributed observations without silently replacing the quote
series or changing Hall arithmetic.

## Operational boundary

Cron sampling remains disabled unless `JUPITER_API_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `CRON_SECRET`
are configured. With no storage, the UI reports that there is no observed
history. Once enabled, the first historical chart requires at least two
complete days of collected observations.

The reader-facing UI must never claim a route sample is executable NAV,
an ETF premium/discount, or a verified return.
