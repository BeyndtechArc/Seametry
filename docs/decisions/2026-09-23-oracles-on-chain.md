# Read oracles from the chain, not from credentialed APIs

**Decision record. Historical, append only, not a living document.**
Recorded 23 September 2026.

The living authority is `../SERVICE_CATALOG.md` section 3.2, Observation.

---

## Context

Earlier documents treated Chainlink Data Streams and Stork as credentialed
adapters that would return `CREDENTIAL_BLOCKED` until access was arranged, and
`.env.example` carried four oracle keys accordingly. Arranging that access
turned out to need a commercial conversation with each provider, which prompted
the question of whether it was worth having at all.

## What was checked

**Chainlink Data Streams has no free tier.** The self service portal issues
credentials, billing runs through Stripe in 30 day cycles, and a payment method
is required before any stream is subscribed. For a solo builder with no runway
this is a recurring cost with no trial.

**Pyth is readable with an RPC connection and nothing else.** Queried on
23 September 2026 through our own RPC endpoint, the Pyth receiver program
`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` returned **11,400 price update
accounts**, and decoding one gave its price, confidence, exponent and publish
time directly. Pyth's Hermes REST service began requiring an API key in August
2026; reading the accounts did not.

**Stork publishes feed accounts on Solana too**, as Temporal Numeric Value Feed
PDAs under its own program, with an Anchor SDK for reading them. The REST and
WebSocket API needs a key. The accounts do not.

## Decision

**Observation reads oracle values from Solana accounts, using the RPC
connection it already holds. It does not hold oracle API credentials.**

Chainlink Data Streams is out of scope until there is a measured reason to pay
for it. If it returns, it returns as an adapter like any other.

## Why this is better than a cost workaround

It would be honest enough to say we did this because the credentials cost money
we do not have. That is true and it is not the main reason.

**It matches what the product claims.** Seametry's whole proposition is that a
number carries its provenance and that a stranger can check it. A value read
from a credentialed API and republished is a value the reader must take our
word for, because they cannot fetch it themselves. A value read from a Solana
account is one we can cite by address, and the reader can pull the same bytes
from any RPC and get the same answer. The second is a materially stronger
claim, and it is the one this product exists to make.

**Freshness becomes an observation rather than a promise.** The sample account
read during this check had a publish time of 11 September 2025, over a year
stale. An API would more likely have returned something current for a
well known symbol and said nothing about the neglected ones. Reading accounts
directly means staleness is visible per feed, which is exactly the four state
evidence model in `../SERVICE_CATALOG.md` section 3.3, and it is the same class
of finding as the stale multiplier field.

**It removes a rented dependency and a relationship.** No contract, no billing
cycle, no provider who can change terms, and no credential that can expire
during a demonstration.

## What it costs

- **Lower latency data is not available.** Data Streams exists because pull
  based, sub second data is genuinely better for some uses. Seametry does not
  have one yet: the executable quote is the number a user actually receives,
  and that comes from Liquidity, not from an oracle.
- **Chainlink's brand is not on the page.** Worth naming honestly, since one
  reason to integrate a well known oracle is that judges and partners recognise
  it. That is a marketing argument, not an engineering one, and it should be
  paid for deliberately if it is paid for at all.
- **Decoding is our problem.** An API returns JSON; an account returns bytes,
  and each provider's layout has to be decoded and tested against fixtures, the
  way `internal/registry` already does for Token-2022.

## What this does not settle

Whether Stork's on chain feeds cover the tokenized equities we care about, or
only the crypto and forex majors. That is an empirical question, settled by
reading the feed registry rather than by reading marketing pages, and it is the
next thing to check before either oracle is wired in.
