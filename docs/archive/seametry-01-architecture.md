> **ARCHIVED, NOT BINDING.** Historical record only. Retired 23 September 2026.
> Replaced by `../PRODUCT_ARCHITECTURE.md` and `../SERVICE_CATALOG.md`.
> Nothing in this file has authority over a living document. Do not build from it,
> do not cite it in a decision, and do not update it. See `../README.md`.

# Seametry: Architecture

Systems, data, dependencies, failure. Revision 3.

---

> **Superseded in part by `seametry-02-reconcile.md`.** Go is the only authority; services are modules in three processes (core, worker, executor); Redis is dropped in favour of the Postgres outbox; the TypeScript gateway is retired. Where this document conflicts, the reconciliation record wins.


## 1. Principles

1. **The core is a pure library.** Services and apps are thin shells around `packages/*`. No business logic lives in a handler, a worker, or a screen.
2. **The Hall is price-blind. The Office prices.** On-chain logic moves quantities. Off-chain logic evaluates value and evidence.
3. **Own the boring, rent only what cannot be owned.** Owned infrastructure is commodity and substitutable. Rented services are few, named, and each has a stated failure mode.
4. **Nothing in the backend can move user funds.** Services build unsigned transactions. Wallets sign. The backend holds no user key and signs no user transaction.
5. **Every freshness is an observation, including the backend's own.** Ledger lag and observer age are shown to users with the same four-state treatment as any price.
6. **Idempotent everywhere.** Every event has a natural key. Replaying the chain rebuilds the database.

---

## 2. Why there is a backend

A phone cannot do these, and pretending it can produces a worse product:

- **Cost basis** needs full transfer history for every lot, not current balances. That history must be indexed once and kept.
- **Corporate actions** need every tracked mint's multiplier configuration watched over time, including effective timestamps, while the phone sleeps.
- **Prerogative events**, a freeze, a pause, a seizure, must be noticed when they happen and pushed, not discovered on next launch.
- **Hallmarks** need a serial authority that never reuses a number and a sealing process that anchors them on schedule.
- **One NAV for everyone.** Phones polling Jupiter independently produce a different number per device and burn shared rate limits.
- **The B2B surface** (assay, Good Delivery list, hallmark verification) is an API, and an API needs a server.

---

## 3. System map

```
                    SOLANA
   Token-2022 mints     Hall program     SPL Memo
          |                  |               ^
          | stream + RPC     |               | seal roots
          v                  v               |
   +-------------+    +-------------+        |
   |   ledger    |    |  observer   |<------ Jupiter API
   |    (Go)     |    |    (Go)     |        |
   +------+------+    +------+------+        |
          |                  |               |
          v                  v               |
   +-------------------------------------+   |
   |  Postgres            Redis          |   |
   |  (system of record)  (streams,cache) |   |
   +---+-----------+------------+--------+   |
       |           |            |            |
       v           v            v            |
   gateway     hallmark ------------------------+
    (TS)        (TS)       notifier (TS) --> Expo push
       |
   +---+----------------+
   |                    |
 mobile (Expo)     console (Next.js)
   |
 wallet (MWA / Phantom) signs and submits to RPC
```

---

## 4. Components

### 4.1 `services/ledger` (Go)

The indexer. System of record for everything that happened on-chain.

- Consumes a chain stream behind a `ChainStream` interface. One primary provider; Yellowstone gRPC or provider webhooks both satisfy it.
- Decodes Hall program events; for every tracked mint: Scaled UI configuration changes (both multiplier fields and the effective timestamp), authority changes, pause toggles, freeze and thaw of Hall accounts; transfers touching signed-in users' wallets, for lots.
- Ingests at `confirmed`, promotes at `finalized`, rolls back anything confirmed that never finalized.
- Idempotency key: signature, instruction index, inner instruction index.
- Backfill: on a new wallet sign-in or a stream gap, walks signatures from the last processed slot.
- Classifies Hall credits: a raw increase traced to the issuer's mint authority is a reinvested dividend; anything else is a donation.
- Publishes to the Redis stream `chain.events`.

### 4.2 `services/observer` (Go)

Everything that is not on-chain but must be observed.

- Jupiter quotes for each constituent at fixed notional sizes (100, 1,000 and 10,000 USDC by default, policy data), on a cadence and on demand. Derives a depth-at-size curve per constituent.
- Market calendar: US exchange sessions, holidays, early closes. Owned, versioned data.
- Issuer registry: mint to issuer, grade, redemption path, jurisdiction exclusions, dividend mechanism (multiplier, mint-to, or unknown). Owned, versioned data.
- Pre-IPO marks: value and struck date as published by the issuer.
- Writes observations to Postgres in daily partitions; hot values to Redis.

### 4.3 `services/gateway` (TypeScript, Hono)

The API. Imports the core directly.

- Auth: Sign In With Solana for user data; API keys for B2B later.
- Surfaces: constituents (grade, prerogatives, assay, Good Delivery), alloys (recipe, units per share, NAV with weakest evidence, Good Delivery), allocations, plans (unsigned transactions for every flow), hallmarks, the Good Delivery list, health.
- Health is itself observational: ledger lag and observer freshness are returned in the same envelope as any other evidence.
- Stateless and horizontally scalable.

### 4.4 `services/hallmark` (TypeScript worker)

- Builds a hallmark on every settlement event: canonical JSON under RFC 8785, SHA-256 digest.
- Assigns the serial: `MMYY` plus seven Crockford base32 characters from a monotonic allocator, enforced unique, never reused, never deleted.
- Seals: on a policy cadence, builds a Merkle tree of new digests and writes the root through SPL Memo from a dedicated anchor key holding a minimal balance. Stores each inclusion proof. Status moves Unsealed to Sealed.
- Renders the certificate PDF to object storage.

### 4.5 `services/notifier` (TypeScript worker)

Consumes `chain.events` and assay changes, applies per-user rules, sends through Expo push.

Events: a prerogative exercised on a held constituent; a dividend activation scheduled and then effective; allocation drift crossing its band; mark age crossing its threshold; a claim ready to withdraw; a hallmark sealed (opt-in).

### 4.6 `programs/hall`, `apps/mobile`, `apps/console`

Specified in PRD 2 and PRD 1.

---

## 5. Data model (Postgres)

| Table | Holds |
|---|---|
| `issuers` | issuer identity, redemption path, jurisdictions |
| `constituents` | mint, token program, decimals, issuer, grade, dividend mechanism |
| `prerogative_snapshots` | decoded mint controls per slot, append-only |
| `multiplier_events` | both multiplier fields, effective timestamp, slot, classification |
| `observations` | the evidence envelope; partitioned by day |
| `alloys` | instance address, sponsor, recipe, share mint, program version |
| `alloy_events` | strike, melt, withdraw, sync (credit, dividend, donation, seizure) |
| `claims` | outstanding melted legs per owner |
| `allocations` | user-defined baskets: constituents, weights, drift band, version |
| `lots` | acquisitions per wallet per mint, for cost basis |
| `hallmarks` | serial, canonical body, digest, seal status, proof |
| `anchors` | Merkle root, memo signature, slot, hallmark range |
| `delivery_assessments` | Good Delivery results per constituent and alloy, per policy version |
| `policy_versions` | every policy document ever loaded |
| `users`, `sessions`, `push_tokens` | wallet identity and delivery |

Every table derived from chain data can be rebuilt from `finalized` history. That is tested, not assumed.

---

## 6. Flows

**6.1 Buy an allocation (mainnet).** App requests a plan. Gateway assays each constituent, gets Jupiter builds, returns unsigned transactions with expected output, enforced floor and every fee line. App simulates each, shows balance deltas, requests one approval where the wallet supports batched signing, submits to RPC. Ledger sees the settlement; hallmark service strikes and later seals the receipt.

**6.2 Acquire an alloy.** Three paths, planned by the core in order of preference. If a secondary pool for the alloy's share token exists with sufficient depth, a single Jupiter swap. If the user already holds the constituents, a single strike. Otherwise, assembly: one swap per constituent plus a strike, under one approval where supported, non-atomic. If assembly partially fails, whatever was acquired remains in the user's wallet as an allocation. Nothing is lost; the modes compose.

**6.3 Melt.** Redeem burns shares and credits claims for every leg. It never touches a constituent mint, so no issuer control can block it. Withdraw then delivers each leg; the client simulates each and bundles those that pass. Legs held back by an issuer stay as claims; the notifier fires when they become withdrawable.

**6.4 Issuer event.** Ledger decodes it, records it, publishes it. Notifier pushes to affected holders. The next assay reflects it. Every surface that shows the constituent shows the event.

**6.5 Seal and verify.** Anyone can take a serial to the console: the console recomputes the digest from the canonical body, checks the inclusion proof against the Merkle root, and checks that root against the memo on-chain, signed by a key on the Office's published anchor key list.

---

## 7. Dependencies

### Rented

| Service | Used for | When it fails |
|---|---|---|
| Solana RPC and stream | reads, submission, indexing | fail over to a secondary RPC; backfill after any stream gap |
| Jupiter API | quotes, swap builds, depth | read-only mode; evidence ages to stale; **the Hall keeps working** |
| Wallets | MWA on Android, Phantom deep links on iOS | two implementations behind one interface |
| Expo, EAS, stores, push | build, distribution, notifications | accepted; no practical substitute |

### Owned

Postgres, Redis, S3-compatible object storage, one container host. All commodity, all replaceable.

### Protocols

Token-2022, SPL Memo, the Hall. Permissionless. No relationship to maintain.

### Excluded from v1, and why

- **Oracles.** Credentialed or frozen on weekends, and executable quotes are the number users actually get. Pyth may return later as corroboration since it is permissionless on-chain.
- **Jito bundles, embedded wallets, lending integrations.** Each adds a relationship before it adds value.
- **Kafka or NATS.** Redis streams are sufficient at this scale.

### Human gates

Audit, legal read, seed liquidity for alloy share pools. None of these are code. All three gate mainnet.

---

## 8. Degradation

| Failure | Behaviour | What the user sees |
|---|---|---|
| Jupiter unavailable | no new plans; observations age | "Quotes unavailable"; strike and melt still offered, since the Hall needs no price |
| Primary RPC down | automatic failover | nothing, unless both fail |
| Stream gap | backfill from last processed slot | "Ledger catching up, 14s behind" |
| Postgres down | gateway returns 503 | last-known values from device cache, each with its age |
| Anchor key unfunded | hallmarks issued, sealing paused | "Unsealed" status, honestly |
| Issuer freezes a Hall account | per PRD 2 | "Struck closed for this alloy"; melts continue; claims shown |

---

## 9. Security

- The backend cannot move user funds, by construction.
- The app simulates every transaction before requesting a signature and shows the simulated balance changes, not the plan's claims about them.
- The anchor key can only write memos and holds a minimal balance. Compromise could write junk memos; verification ignores any root not signed by a published anchor key. Rotated on a schedule; rotations published.
- Secrets live in the host's secret manager. The app ships none.
- Rate limits per wallet and per API key, in Redis.
- Serials are allocated monotonically under a unique constraint, and hallmarks are never deleted.

---

## 10. Environments

- **Devnet.** The Hall, upgradeable and labelled *Key still in hand*. Mock issuer mints reproducing real extension sets. Scenario scripts that exercise every prerogative. Jupiter does not route devnet liquidity, which is exactly why the Hall is price-blind and the devnet demo uses mock issuers.
- **Mainnet.** Allocations with real constituents at small size. Alloys only after the Key.
- **Staging.** Mainnet reads, separate database, no writes.

---

## 11. Observability

Structured JSON logs. Metrics that double as user-visible evidence: ledger lag in slots and seconds, observer freshness per constituent, seal backlog, notifier queue depth. Alerts on ledger lag, seal backlog and Jupiter error rate. Use the host's built-in logging and metrics for v1; add no new vendor.
