# Allocation capacity is issued at measured sizes

**Status:** accepted

**Date:** 3 October 2026

## Context

The first Allocation gate judged every instrument at one global reference size of 1,000 USDC. That made a useful first survey, but it collapsed two different facts into one answer: an instrument with no route at any measured size and an instrument whose 100 USDC route exists but deteriorates before 1,000 USDC both appeared unavailable.

Relative deterioration alone is also insufficient at the smallest measured size. Its shortfall is zero by definition, even when the aggregator already states substantial price impact there.

## Decision

The policy now issues an Allocation capacity for each instrument. Capacity is the largest captured size that the complete instrument decision admits. It is never interpolated beyond a measured point.

A measured size must satisfy both liquidity conditions:

1. Its realised rate may not deteriorate from the smallest priced route by more than `depth_ceiling_bps`.
2. The aggregator's stated price impact may not exceed `impact_ceiling_bps`.

Both ceilings are 100 basis points in `policy-2026.10.1`. They are policy assumptions and remain versioned data. The capacity decision has its own input digest, and Allocation binds that digest into every execution approval.

## Consequences

- Different constituents can carry different spend caps in one Allocation.
- An instrument refused at 1,000 USDC can be offered at 100 USDC when the captured 100 USDC route satisfies the policy.
- A smallest route with high stated impact is not admitted merely because its relative shortfall is zero.
- A live quote and exact transaction simulation still run before a wallet sees a signature request.
- Sell-side depth is still unavailable. Capacity classifies the captured USDC-to-constituent route only and does not claim an exit route.
