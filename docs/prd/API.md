> **Living document. Owns:** the public API: its contract, the shape of every response, the resources and who may read them, sign-in, sessions and API keys, entitlements and metering, streaming, the storage layout behind it, and the order the server is built in.
> **Does not own:** service boundaries and deployment topology (`../SERVICE_CATALOG.md`), rules that hold everywhere such as decimals, time and idempotency (`../ENGINEERING_STANDARD.md`, cited here, never restated), product scope and phasing (`../PRODUCT_ARCHITECTURE.md`), or what each surface shows (`EXPLORER.md`, `TERMINAL.md`, `MOBILE.md`).
> **Specified, mostly not built.** Section 12 is the order it gets built in. Step A0 is built: `contracts/openapi/openapi.yaml`, generation into `server/internal/gateway/api` and `clients/packages/api`, the drift check, and the service boundary test in `server/boundary_test.go`. Everything after A0 runs nowhere yet.

# The API

**Last substantive change:** 27 September 2026.

One HTTP API serves every surface: the Explorer, the Terminal, the mobile app, and the wallets, exchanges and protocols that buy the assay. It is the Gateway in `SERVICE_CATALOG.md` section 3.10. A surface is a client of it like any other. No surface gets a private endpoint, because a figure only one surface can fetch is a figure nobody else can check.

---

## 1. What the API is for

| Caller | Needs | First phase |
|---|---|---|
| The Explorer | Instruments, prerogatives, evidence, receipts and proofs, the Hall's state, all without an account | Phase 1 |
| The Terminal | Admissibility, depth at size, cost to assemble and melt proceeds, live change, and later execution, with a signed-in wallet | Phase 2 |
| The mobile app | Holdings, what changed, receipts, approvals and signing handoff | Phase 2 |
| Integrators | The assay as a metered service: grades, decoded prerogatives, corporate actions, admissibility, receipt verification | Phase 3 |

The same resources serve all four. What differs is the entitlement a caller holds (section 8), never the shape of the answer.

## 2. Principles at the edge

These follow from the engineering standard and apply to every endpoint.

1. **The contract is written first.** A shape changes in `contracts/openapi/` before any handler learns about it (`SERVICE_CATALOG.md` section 6).
2. **A response is evidence.** Every figure arrives with its source, its timestamps and its evidence state, in the same object (standard sections 4, 13 and 16).
3. **Every read answers "as of when".** Any read resource accepts `as_of` and answers what Seametry held at that time (standard section 6).
4. **The API decides nothing new.** Handlers call the owning service and serialize its result. A decision reaches a client with its `policy_version` and `input_digest`, and a client never recomputes one (standard section 2).
5. **Missing is named.** A part that could not be produced is listed as missing with its state. It is never omitted and never filled (standard section 13).

## 3. The contract and what is generated from it

| Piece | Tool | Version checked 27 September 2026 | Output |
|---|---|---|---|
| Public contract | OpenAPI 3.1, one file, `contracts/openapi/openapi.yaml`. A genuine attempt to split it by resource group hit real friction, oapi-codegen could not resolve a `$ref` crossing back into the root file without an explicit import mapping, and a bundler dependency was not worth adding for organization alone; resource groups are tags on every operation instead | | The source of truth |
| Go server | `oapi-codegen`, strict server over the standard library `net/http` | v2.8.0 | Typed request and response structs and a handler interface in `server/internal/gateway/api` |
| TypeScript client | `openapi-typescript`, with `openapi-fetch` for calls | 7.13.0 and 0.17.0 | Types in `clients/packages/api` |
| Contract validation | `kin-openapi`, from a Go test | v0.149.0 | Fails CI on an invalid document |

`oapi-codegen` states initial OpenAPI 3.1 support in its README. If a 3.1 construct the contract needs is not supported, the contract stays within what is, and the gap is recorded here, rather than switching generators mid-build. `ogen` (v1.24.0) also generates Go servers from OpenAPI and was not evaluated in depth; `oapi-codegen` was chosen because its strict server targets the standard library directly, which is what the rest of the server uses.

**Drift check.** CI regenerates the Go server code and the TypeScript types from the contract and fails on any diff (standard section 17). A hand written TypeScript type describing a server shape is a defect (standard section 2).

**Internal Protobuf is not written yet.** While there is one process, services call each other through Go interfaces in process (`SERVICE_CATALOG.md` section 2, rule 1). `contracts/proto/` is created at the first process split, which is Execution.

## 4. The response model

### 4.1 Amounts

Every price, quantity, fee, multiplier and ratio is an object with integer atoms as a string and an integer scale.

```json
{ "atoms": "5005000", "scale": 6 }
```

It is never a JSON number and never a formatted decimal string (standard section 3). Any integer that can exceed 2^53, including slots, lamports and supplies, is also a string. Counts that cannot, such as the number of items on a page, are numbers.

### 4.2 An observed value

Anything that came from outside Seametry, or was computed from something that did, is wrapped in an observation. The examples in this section show shape only; their values are illustrative and come from no capture.

```json
{
  "value": { "atoms": "1000000", "scale": 6 },
  "source": "solana:mainnet:getAccountInfo",
  "source_event_at": "2026-09-23T14:02:11Z",
  "received_at": "2026-09-23T14:02:12Z",
  "persisted_at": "2026-09-23T14:02:12Z",
  "slot": "366209814",
  "evidence_state": "verified",
  "age_seconds": 41,
  "raw": "sha256:6a4d6d94..."
}
```

- The three timestamps are the standard's, never conflated (section 4). `age_seconds` is derived at read time against the served time, never stored.
- `evidence_state` is one of `verified`, `unverified`, `stale`, `unavailable` (`SERVICE_CATALOG.md` section 3.3). A value past its retention window reports `pruned` with the range it covered, distinct from `unavailable` (standard section 5.1).
- `raw` is the content address of the payload the value was derived from, fetchable where section 5 allows it.
- An `unavailable` observation has no `value`. It still appears, with its source named.

### 4.3 The envelope

Every successful response has the same outer shape.

```json
{
  "data": {},
  "meta": {
    "served_at": "2026-09-27T10:00:00Z",
    "as_of": "2026-09-27T10:00:00Z",
    "completeness": "partial",
    "missing": [
      { "part": "depth.sell", "state": "unavailable", "reason": "SELL_DEPTH_NOT_MEASURED" }
    ],
    "cluster": "mainnet"
  }
}
```

- `completeness` is `complete` or `partial`. A partial answer lists every missing part with its state and a stable reason code. A partial answer that does not say so is the most expensive defect in the standard (section 13).
- `cluster` is named wherever chain state is involved, so a devnet figure cannot be read as a mainnet one.
- A decision carries `decision`, `reasons`, `policy_version`, `input_digest` and `expires_at` beside `data`, exactly as `server/internal/policy` returns them.

### 4.4 Errors

Errors use RFC 9457 problem details, `application/problem+json`, with a stable `type` per failure. Every `detail` names the value, what was expected, and where it came from, because the repository's rule is that an error says what to do. A dependency that cannot answer returns `503` with type `degraded` and the dependency named. It never returns an empty success (standard section 13).

### 4.5 Reads

- **`as_of`** is accepted by every read, as an RFC 3339 UTC time. Omitted, it means now. A request reaching beyond retention answers with `pruned` ranges rather than a shorter history (standard section 5.1).
- **Pagination** is by opaque cursor over a stable order. Offsets are not offered, because an offset over append-only history shifts under a reader.
- **Caching.** Public reads send `ETag` and `Cache-Control`, so Cloudflare's edge answers repeated reads and the free-tier host sees a fraction of them. Signed-in reads send `Cache-Control: private`.

### 4.6 Writes

Every state-changing request takes an `Idempotency-Key` header. A repeat with the same key and the same body returns the stored response and has no second effect. The same key with a different body is refused with type `idempotency_key_reused` (standard section 9). Stored responses are kept for 24 hours.

### 4.7 Versions

The path carries the major version, `/v1`. Within a version only additive changes are made: a new field, a new resource, a new enum value. Clients must treat an unknown enum value as unknown and show it, never map it to a known one (standard section 7). A breaking change is `/v2`, and `/v1` keeps running until its last caller is gone.

## 5. Resources

Grouped by the service that owns the answer. The gateway owns none of this data. `Entitlement` is from section 8.

### 5.1 Public reads

| Method and path | Answers | Owner | Entitlement | Phase |
|---|---|---|---|---|
| `GET /v1/instruments` | Every instrument in the registry, filterable by issuer, grade and quarantine | Registry | public | 1 |
| `GET /v1/instruments/{mint}` | Identity, grade, decoded prerogatives with their sentences, the live multiplier and the field it came from, unknown extensions, quarantine, and the capture slot | Registry | public | 1 |
| `GET /v1/instruments/{mint}/prerogatives/history` | Every change to decoded prerogatives, effective dated | Registry | public | 1 |
| `GET /v1/instruments/{mint}/corporate-actions` | Scheduled and effective corporate actions and multiplier changes | Registry | public | 2 |
| `GET /v1/findings`, `GET /v1/findings/{slug}` | Published findings a visitor can reproduce by running one command, each with what it does not establish stated beside it: the multiplier survey, depth at size | Registry, Liquidity | public | 1 |
| `GET /v1/instruments/{mint}/observations` | Observations by source over a range, with pruned ranges named | Market State | public, range limited; api for full range | 2 |
| `GET /v1/instruments/{mint}/depth` | Depth at size as a curve, per direction, with each quote's age and expiry. Selling reports `unavailable` until it is measured | Liquidity | public | 1 |
| `GET /v1/instruments/{mint}/admissibility` | The policy decision for this instrument, with reasons, version and digest | Policy | public | 1 |
| `GET /v1/policies/{version}` | A policy document, as data | Policy | public | 1 |
| `GET /v1/reason-codes` | Every reason code and its fixed meaning | Policy | public | 1 |
| `GET /v1/alloys`, `GET /v1/alloys/{address}` | An alloy's recipe, supply, each leg's ledger, pending and unclaimed balances, and held-back legs, read from chain | Basket | public | 1 |
| `GET /v1/alloys/{address}/strike-cost?shares=n` | What a strike of n shares takes per leg, rounded up | Basket | public | 1 |
| `GET /v1/alloys/{address}/melt-proceeds?shares=n` | What a melt of n shares returns per leg, rounded down, and what the Hall keeps | Basket | public | 1 |
| `GET /v1/alloys/{address}/nav` | Off-chain NAV with the weakest evidence it contains, or refused when any constituent lacks an acceptable observation | Basket, Market State | public | 2 |
| `GET /v1/hall/demonstration?cluster=simulator\|devnet` | The demonstration transcript for that cluster: every scenario, its steps, actors, results, reasons, and, on devnet, transaction signatures, per `HALL.md` section 7 | Basket | public | 1 |
| `GET /v1/receipts/{serial}` | The public body, its inclusion proof, its batch root and the anchor transaction | Receipt and Audit | public | 1 |
| `GET /v1/batches/{root}` | A sealed batch, its leaves' public digests and its anchor | Receipt and Audit | public | 1 |
| `GET /v1/anchor-keys` | The published list of keys allowed to anchor a root, with rotation dates | Receipt and Audit | public | 1 |
| `GET /v1/evidence/{sha256}` | A raw payload by its content address | Observation | see below | 1 |
| `GET /v1/status` | Seametry's own freshness: ledger lag, observer age per instrument and source, seal backlog, in the same evidence shape as any source | Gateway | public | 1 |

**Raw payloads are published by source.** Solana account data is public chain state and is served to anyone. A payload from a commercial provider, such as a Jupiter quote, is served only once that provider's terms have been read and allow it; until then its digest is public and its bytes are not. This is open in section 14.

The receipt endpoints are shaped so the verification ritual needs nothing else: the proof JSON they return is what the Explorer verifies offline (`EXPLORER.md` section 3.1).

### 5.2 Signed-in reads and writes

| Method and path | Does | Owner | Phase |
|---|---|---|---|
| `POST /v1/auth/challenge` | Returns a sign-in message with a single-use nonce for a wallet address (section 7) | Identity | 2 |
| `POST /v1/auth/session` | Verifies the signed message and opens a session | Identity | 2 |
| `DELETE /v1/auth/session` | Ends the session | Identity | 2 |
| `GET /v1/me` | The account, its linked wallets, plan and usage | Identity | 2 |
| `POST /v1/me/wallets` | Links another wallet by a second signed message | Identity | 2 |
| `DELETE /v1/me/wallets/{address}` | Unlinks one | Identity | 2 |
| `GET`, `PUT`, `DELETE /v1/me/watchlists/...` | Watched instruments and alloys | Identity | 2 |
| `GET`, `PUT`, `DELETE /v1/me/formulas/...` | Saved formulas for the Terminal workbench | Basket | 2 |
| `GET /v1/me/receipts` | The account's receipts, newest first | Receipt and Audit | 2 |
| `GET /v1/me/receipts/{serial}/private` | The private body with its salt, to its owner only | Receipt and Audit | 2 |
| `GET`, `POST`, `DELETE /v1/me/api-keys/...` | Create, list and revoke API keys. The secret is shown once | Identity | 3 |
| `GET`, `PUT /v1/me/alerts/...` | Alert subscriptions and channels | Alert | 2 |
| `DELETE /v1/me` | Deletes the account and its linked data. Receipts stay, because they are never deleted (standard section 12), and are detached from the account | Identity | 2 |

### 5.3 Execution

Execution builds transactions and never signs them (standard section 11). The flow is four steps, each its own request, so the synchronous path stays short.

| Method and path | Does |
|---|---|
| `POST /v1/intents` | Records what the caller wants (`strike`, `melt`, `withdraw`, `allocate`) with their limits, and returns the plan, the expiring quotes it rests on, and the policy decision |
| `POST /v1/intents/{id}/approval` | Binds the approval digest over instrument version, market state snapshot, quote, policy version, wallet and message, simulates, and returns the unsigned transaction and the simulated balance changes. Any program outside the allowlist is refused here, before a wallet sees anything |
| `POST /v1/intents/{id}/submission` | Takes the signed transaction, checks quote expiry and the approval digest again, and submits it |
| `GET /v1/intents/{id}` | The intent's state through confirmation and settlement, and its receipt serial once issued |

On devnet this runs against the Hall from step A7 of section 12. Allocations on mainnet are product phase 2. The Hall on mainnet is product phase 3 and waits on the legal read and the audit in `PRODUCT_ARCHITECTURE.md` section 9.

## 6. Streaming

Live change reaches clients over server-sent events.

- `GET /v1/stream` carries public events. `GET /v1/me/stream` adds the account's own: intent progress, receipts sealed, claims ready.
- Events are the outbox events in `SERVICE_CATALOG.md` section 7, with the same payloads, which are part of the contract like any response.
- Each event's `id` is its outbox sequence. A client reconnecting with `Last-Event-ID` resumes from there. If that point has been pruned, the stream says so before resuming from the oldest retained event, rather than skipping silently.
- A stream is a hint to refetch or apply a change, never the only record. Every event's state is also readable from a resource.

## 7. Identity, sessions and keys

**Sign-in is by wallet, following Sign In With Solana (CAIP-122), the standard Phantom documents.** No email and no password, matching `MOBILE.md`'s onboarding.

1. The client asks for a challenge for an address. The server returns a message naming the domain, the address, a statement, the URI, a nonce, the issue time and an expiry of five minutes.
2. The wallet signs it. The client sends the message and the Ed25519 signature.
3. The server checks the signature against the address, the domain against its own, the nonce against its store (single use, deleted on first check), and the times. Then it opens a session.

Signing in proves control of an address. It grants a view of that address's data and moves nothing (`SERVICE_CATALOG.md` section 3.9).

| | Web | Mobile | Integrators |
|---|---|---|---|
| Credential | Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to the API's parent domain | Bearer session token in the platform's secure storage | API key as a bearer token |
| Stored as | A random session id, hashed | A random token, hashed | A random 32 byte secret, stored only as its SHA-256; a short prefix is kept for display |
| Lifetime | 30 days idle, revocable | 30 days idle, revocable | Until revoked |

**CORS.** Public reads allow any origin without credentials. Credentialed requests are allowed only from the web client's own origin.

**What this stores about a person.** A wallet address linked to an account is personal data. From the first signed-in release there is a privacy notice, the deletion endpoint in section 5.2, and a statement of what is kept after deletion (receipts, detached) and why.

## 8. Entitlements, limits and metering

| Entitlement | Who | Reaches | Limit |
|---|---|---|---|
| `public` | Anyone, no credential | Section 5.1, with observation history range limited | Per IP, at the edge |
| `account` | A signed-in wallet | Adds section 5.2 and execution | Per account |
| `pro` | A Terminal subscription | Adds full observation history, formula workspaces, depth monitoring and alert volume (`PRODUCT_ARCHITECTURE.md` section 8) | Per account, higher |
| `api` | An integrator with a key, or no account at all, paying per call | Section 5.1 at full range, metered | Per key, by plan; unmetered per call under x402 |

- Limits are enforced in the gateway, per identity and per key (standard section 19), and answered with `429` and `Retry-After`.
- Usage is counted per key per day in the Identity schema and returned by `GET /v1/me`. Metering records calls, not bytes, because the assay is what is sold.
- **Payment is x402, settled in USDC on Solana.** A request to a metered resource with no valid entitlement gets `402 Payment Required` and an `X-Payment-Required` header naming the price, the asset, and the pay-to address. The caller retries with an `X-Payment` header carrying a signed transfer; the gateway verifies it against a facilitator (a public one to start, per `github.com/x402-foundation/x402/go`) before serving the resource. No card ever reaches Seametry or its host, so Cloudflare's terms (section 2.2.1(h)) on card processing and PCI scope both stop applying.
- **Two shapes of the same mechanism.** A metered call pays once, per request, with no account and no key: this is what an agent calling the API directly uses. A `pro` subscription pays once for a stated period; the gateway records the entitlement against the account with an `expires_at`, the same way a decision carries one, and the account reaches `pro` resources until then with no further payment. `api-keys` (section 5.2) remain for an integrator who wants a stored balance and one invoice instead of paying per call.

## 9. Storage

### 9.1 Postgres

One database, one schema per service, each service connecting as a role granted only its own schema (`SERVICE_CATALOG.md` section 4). PostgreSQL 18, the current stable major (current minor 18.6 on postgresql.org's versioning page, checked 27 September 2026). PostgreSQL 19 is in beta with general availability aimed at the end of October 2026, as reported; the move to it waits until it is released and a restore has been tested on it.

| Schema | Holds |
|---|---|
| `registry` | Instruments, mints, effective-dated prerogative and multiplier records, corporate actions, quarantines |
| `observation` | The index of raw payloads (digest, source, adapter version, the three timestamps, object key) and normalized observations |
| `market_state` | Snapshots, freshness per source, sessions and calendar versions |
| `liquidity` | Quotes with their expiry, depth curves |
| `policy` | Policy documents by version, issued decisions with their digests |
| `basket` | Alloys as last read from chain, saved formulas, allocations |
| `execution` | Intents, approvals and their digests, simulations, submissions, confirmations |
| `receipt` | Receipts, the serial allocator, batches, proofs, anchors |
| `alert` | Subscriptions, rules, delivery attempts |
| `identity` | Accounts, linked wallets, sign-in nonces, sessions, API keys, plans, usage |
| `gateway` | Stored idempotent responses |

Every schema that emits events has its own `outbox` table, written in the same transaction as the change it describes (standard section 10). One dispatcher in the process reads them all and feeds the stream and Alert.

- **Queries** are written in SQL and compiled by `sqlc` (v1.31.1) into typed Go over `pgx` (v5.11.0). No ORM (standard section 15).
- **Migrations** are plain SQL files run by `goose` (v3.28.0), one directory per schema, expand and contract, each reversible or gated by a decision record (standard section 10). Atlas (v1.3.0) was considered and set aside: its declarative diffing is the opposite of reviewing each step by hand, which expand and contract needs.

### 9.2 Object storage

Raw payloads, content addressed by SHA-256, as the standard requires (section 5). One interface, two implementations, one shared contract test:

- **Local development:** a directory on disk. MinIO was the usual local stand-in and is excluded: its repository is archived (checked on GitHub, 27 September 2026) and it is reported to have stopped publishing images in 2025.
- **Deployed:** Cloudflare R2, which is S3 compatible (`SERVICE_CATALOG.md` section 4).

Retention runs as a scheduled job reading the retention policy, promoting anything a decision, approval or receipt references to cold before any prune (standard section 5.1).

## 10. Inside the process

```
server/cmd/seametry          configuration, wiring, HTTP server, schedulers, shutdown
server/internal/gateway      routing, the envelope, errors, limits, caching headers, SSE
server/internal/gateway/api  generated from the contract, never edited
server/internal/identity     sign-in, sessions, keys, entitlements, usage
server/internal/<service>    one per service in SERVICE_CATALOG section 3
server/internal/store        pgx pools per role, the outbox dispatcher, the object store interface
server/migrations/<schema>   goose SQL files
server/queries/<schema>      sqlc SQL files
```

`amount`, `canonical`, `merkle`, `solana` and `transport` are libraries that any service may import. They own no tables.

A test enforces the boundaries. It lists every package's imports and fails when a service imports another service's internals, or when a service's SQL names another service's schema. `SERVICE_CATALOG.md` has said the boundaries are enforced by tests; this is the test.

## 11. Deployment

The topology and hosts are owned by `SERVICE_CATALOG.md` section 4. What the API adds:

- `server/deploy/Dockerfile` builds one static binary into a minimal image. `server/deploy/compose.yaml` runs it with Postgres and a volume, the same file used locally, on Fly, and later on Oracle.
- The host is Fly.io, on Storm's legacy plan allowance, until an Oracle account exists (`SERVICE_CATALOG.md` section 4). Fly terminates TLS and exposes the process at its own address; Cloudflare sits in front for DNS and edge caching, proxied rather than tunneled, since nothing here runs on a machine with no public address of its own.
- Public reads are cached at Cloudflare's edge by the headers in section 4.5.
- Secrets come from the host's environment, never from the repository (standard section 19).
- A nightly `pg_dump` goes to R2. A CI job restores the latest dump into a fresh Postgres and runs a read against it, so the backup is known to restore.
- `/metrics` and the health check are reachable only from Storm's own network, not publicly. What the public needs to know about Seametry's freshness is `GET /v1/status`.

## 12. Build order

Each step ends the way every step in this repository does: the command and its output pasted, a test watched failing for the right reason, the tree clean, then CI read from GitHub for the pushed commit, every job named.

| Step | Builds | Proven by | Unlocks |
|---|---|---|---|
| **A0, built** | The boundary test (section 10). `contracts/openapi/` with the envelope, amount, observation and problem types and `GET /v1/status`, and every resource the Explorer's own pages read (docs/prd/EXPLORER.md section 3). Generation for Go and TypeScript, and the drift check in CI | The boundary test fails when a deliberate cross-service import is added, naming both packages. The drift check fails when a generated file is edited by hand. `contract_test.go` caught a real YAML syntax error in the document while it was being written | A contract clients can build against |
| **A1** | `server/cmd/seametry` serving `/v1/status`. Compose with Postgres 18. goose, one role per schema, the grants. CI gains a Postgres service | A role reading another schema is refused by Postgres, in a test. `/v1/status` answers in the envelope | A running process with a database |
| **A2** | Observation persisted: raw to the object store before anything else, the index and normalized rows in Postgres, adapters for Solana accounts and Jupiter. The capture and depth programs become scheduled jobs inside the process, at the cadence in policy data | Replaying stored raw payloads reproduces normalized rows byte for byte. Ingestion fails when the object store is unavailable (standard section 5) | Evidence that accumulates on its own |
| **A3** | Registry, Market State, Liquidity and Policy behind the public reads in section 5.1: instruments, prerogatives, depth, admissibility, policies, reason codes, evidence. `as_of` on each | Each figure in a response traces to a stored raw digest. A late observation changes a recomputed snapshot and leaves an issued one intact (standard section 4) | The Explorer and Terminal can read live data |
| **A4** | Receipts in Postgres: the serial allocator under a unique constraint, batches, proofs, anchoring the root as a devnet memo from a memo-only key. Receipt, batch and anchor-key endpoints | The public-artifact scan finds no signature, wallet or exact amount. Verification passes with no credentials configured (standard section 12) | The verification ritual against real anchors |
| **A5** | The Hall read from chain: alloys, strike cost, melt proceeds. The outbox dispatcher and `GET /v1/stream` | Strike cost and melt proceeds equal what the program took and credited in the devnet transcript. A duplicated event is applied once (standard section 9) | The Terminal's cost views, live updates |
| **A6** | Identity: sign-in, sessions, watchlists, saved formulas, deletion, private receipt bodies | A reused nonce, a signature over another domain, and an expired message are each refused. Deletion leaves receipts intact and detached | Signed-in Terminal and mobile |
| **A7** | Execution on devnet: intents, approval digests, the program allowlist, simulation, submission, confirmation, receipts issued on settlement | Changing any bound input invalidates the approval. An unlisted program is refused before handoff. An expired quote is refused at submission (standard section 11) | Strike, melt and withdraw from the Terminal on devnet |
| **A8** | Entitlements, limits and metering, API keys, and x402: the `402` challenge, verifying a payment against a facilitator using `github.com/x402-foundation/x402/go`, and granting the `pro` entitlement an `expires_at` on a subscription payment | A key past its limit gets `429` with `Retry-After`. A revoked key is refused. A request with no valid payment gets `402` with the price and asset named; a verified payment is served once and not replayable. Usage counts match calls made in the test | The metered API, and per-call access with no account |
| **A9** | Deployment: Dockerfile, compose on the host, edge caching, backups and the restore job | The restore job passes in CI against the latest dump | Online, at no cost |

A0 to A5 need no account and no signing. They are what the clients build against first.

## 13. What the API never does

- Recommend a direction, size, timing or suitability, in any field or message.
- Describe a value as true, correct, fair, safe, guaranteed or pure.
- Average sources into one figure.
- Send an amount as a floating point number.
- Hold, receive or log a private key or seed phrase, or sign a user's transaction.
- Present a partial answer as complete, or an old value as current.

## 14. Open

- **The API's domain.** Which of Storm's domains carries the API and the web client. The session cookie's scope depends on it.
- **Provider payload publication.** Whether Jupiter's terms allow its quote payloads to be republished (section 5.1). Not read yet.
- **Saved formula storage.** `TERMINAL.md` asks whether formulas are stored. This document provides the resource. Whether the free-tier storage budget allows it for `account`, or only for `pro`, is a cost decision against `ENGINEERING_STANDARD.md` section 5.1.
- **Oracle's idle reclamation.** Whether a pay-as-you-go account exempts Always Free instances from reclamation (`decisions/2026-09-27-repository-layout.md`). It decides whether the host needs a keep-busy job.
