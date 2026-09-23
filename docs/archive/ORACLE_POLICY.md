> **ARCHIVED, NOT BINDING.** Historical record only. Retired 23 September 2026.
> Replaced by `../SERVICE_CATALOG.md` sections 3.2 and 3.3, and `../ENGINEERING_STANDARD.md` section 13.
> Nothing in this file has authority over a living document. Do not build from it,
> do not cite it in a decision, and do not update it. See `../README.md`.

# Oracle and Source Policy

## Policy goal

Seametry compares attributed observations. It does not average several numbers into a synthetic “true price” and does not silently choose whichever source is closest to an executable quote.

Each source answers a different question.

## Source contracts

### xStocks

**Authority:** issuer/instrument state.

Use for:

- instrument identity and mint mapping;
- legal form and restrictions;
- multiplier and forward multiplier;
- corporate actions;
- issuer halt and market-session state;
- issuance/redemption context;
- issuer reference observation;
- proof-of-reserves observation and definition.

Do not treat xStocks' reference observation as executable liquidity or assume its reserve and circulating-supply definitions match every wallet/explorer field.

### Chainlink Data Streams

**Authority:** independent signed market observation.

Chainlink Data Streams uses a pull model: low-latency reports are fetched offchain and can be cryptographically verified offchain or onchain. Its RWA and tokenized-asset schemas can carry market-specific fields and event handling. Seametry will:

- discover the exact supported stream for the selected underlying;
- fetch the report server-side;
- decode value, report timestamp, valid-from time and market status fields supplied by the schema;
- verify the report with the supported Chainlink path;
- preserve the stream ID and schema version in the receipt;
- display `not-supported` when no exact stream exists.

V1 does not claim atomic onchain verification because Seametry does not deploy a program that consumes the report. The receipt states that verification occurred in the gateway.

### Stork

**Authority:** second independent signed market observation.

Stork is a pull oracle whose temporal numeric values contain a nanosecond timestamp and signed numeric value. Publishers sign inputs; aggregators combine and sign outputs; subscribers can consume REST/WebSocket data and optionally verify publisher and aggregator signatures. Seametry will:

- discover the exact Stork asset ID for the selected underlying;
- subscribe through WebSocket for the live mobile context and use REST for recovery;
- verify the aggregator signature and retain the aggregation method;
- preserve constituent/publisher evidence where licensing and payload size permit;
- record the encoded asset ID and observation timestamp;
- display `not-supported` when no exact feed exists.

An asset addition may be requested from Stork, but Seametry documentation and demo will never present a requested feed as available.

### Jupiter Metis

**Authority:** executable Solana liquidity for a stated amount and moment.

Jupiter is a router, not the market-data truth source and not the underlying DEX. Seametry uses `/build` because it exposes raw instructions and route composition. Venue-restricted probes can compare DEX execution using `dexes` and `excludeDexes`.

The executable quote is never generalized beyond its amount, direction and expiry.

### Solana RPC

**Authority:** onchain state and settlement.

Use for mint extensions, token accounts, raw balances, transaction simulation, slots, signatures and settled balance deltas. Preserve raw and scaled values separately.

## Resolution policy

Sources are shown side by side. Product state follows explicit rules:

| Condition | Result |
| --- | --- |
| Issuer halt or active forward-multiplier discontinuity covered by issuer integration guidance | `BLOCK` |
| No Jupiter route, expired quote, failed simulation or unenforceable minimum | `BLOCK` |
| Chainlink and Stork both unavailable | `WARN`, unless policy requires a fresh reference for that instrument |
| One oracle unavailable or verification fails | `WARN` with the source named |
| Oracle observations disagree | `WARN` when the displayed deterministic threshold is crossed |
| Underlying market closed but issuer state normal and route valid | contextual status; no automatic block |
| Route uses one thin venue or price impact crosses the configured product threshold | `WARN` |
| All required validity checks pass | `ALLOW` |

No price divergence alone causes Seametry to decide trade direction.

## Freshness

Freshness is evaluated from the provider's observation timestamp, not gateway arrival time. Every adapter defines:

- expected update behavior by market session;
- soft stale threshold;
- hard unusable threshold when the provider contract supports one;
- clock-skew allowance;
- recovery behavior.

Thresholds are versioned in policy and visible in the repository. They are not tuned per user to influence execution.

## Coverage gate

The first engineering task is a machine-readable matrix:

| Candidate | xStocks | Chainlink | Stork | Jupiter route | Decision |
| --- | --- | --- | --- | --- | --- |
| SPYx | probe | probe | probe | probe | pending |
| NVDAx | probe | probe | probe | probe | pending |
| AAPLx | probe | probe | probe | probe | pending |
| UNHx | historical evidence | probe | probe | reproduced route | replay minimum |

Select the live transaction asset only after exact identifier matching. Ticker similarity is insufficient; adapters must bind issuer instrument, oracle underlying and Solana mint through a checked mapping file with provenance.

## Source-health evidence

The public console shows:

- last successful observation;
- last verification result;
- median response latency measured by Seametry;
- current support/availability;
- schema or asset ID;
- source terms/link;
- fixture versus live state.

It does not publish provider reliability rankings until the sample is statistically meaningful.

## Security rules

- Provider credentials stay server-side.
- Runtime schemas validate every response.
- Signature verification errors fail visibly.
- Source timestamps outside reasonable clock bounds are rejected.
- Receipts hash normalized inputs to make replay deterministic.
- Logs redact wallet session material and provider secrets.
- A compromised reference source cannot alter the mint, output minimum or transaction instructions.

## Primary technical references

- Chainlink Data Streams: https://docs.chain.link/data-streams
- Chainlink Data Streams Solana verification: https://docs.chain.link/data-streams/tutorials/overview
- Chainlink Data Feeds on Solana: https://docs.chain.link/data-feeds/solana
- Stork introduction: https://docs.stork.network/
- Stork core concepts: https://docs.stork.network/introduction/core-concepts
- Stork architecture: https://docs.stork.network/introduction/how-it-works
- Jupiter Swap V2: https://developers.jup.ag/docs/swap
- Jupiter Metis build: https://developers.jup.ag/docs/swap/build
- xStocks developer documentation: https://docs.xstocks.fi/developers

