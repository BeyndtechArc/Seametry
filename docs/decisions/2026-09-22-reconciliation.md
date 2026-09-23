> **Decision record. Historical, append-only, not a living document.** Recorded 22 September 2026.
> Its decisions are absorbed into `../PRODUCT_ARCHITECTURE.md`, `../SERVICE_CATALOG.md`, and `../ENGINEERING_STANDARD.md`, which are the living authority. Read this for why a decision was made, never for what is currently true.
> **Superseded in one respect:** decision D9 deferred the Terminal behind mobile. The Terminal is now the primary product.

# Seametry: Reconciliation Record

Decision record, revision 4, 22 September 2026. Where this conflicts with `seametry-01-architecture.md` or `seametry-prd-0-core.md`, this document wins.

---

## 1. What was compared

- **Public repository**, `main`, three commits. TypeScript monorepo: `packages/domain`, `packages/preflight`, a Hono gateway described as a small TypeScript service, Expo shell, Next.js console.
- **Server documents**: README, ENGINEERING_STANDARD, SERVICE_CATALOG, PRODUCT_ARCHITECTURE (15 September 2026). A Go service-oriented monorepo with `cmd/gateway`, `internal/domain`, `internal/policy`, `internal/store`, migrations. Not yet pushed.
- **Revision 3**: world, architecture, PRDs 0 to 2, build pack.

---

## 2. Decisions

### D1. One authority: Go

Domain, policy, basket arithmetic and every decision are computed in the Go server only. Clients never compute a decision; they render the server's. The TypeScript `packages/preflight` is retired. TypeScript types are generated from the versioned API contract, never hand-written.

Why: determinism is a property of one implementation, or of several implementations bound by shared vectors. The first is simpler and removes a whole class of divergence.

The one unavoidable second implementation is the Hall program in Rust. It is bound to Go by shared recipe vectors in `spec/`, loaded by both test suites.

### D2. Modules, not services

The service catalog's doctrine replaces revision 3's topology. Revision 3 proposed five services, two workers and Redis on day one, which is precisely the distributed-services costume the catalog forbids.

- **Core process** (`cmd/gateway`): Registry, Market State, Liquidity, Policy, Basket, Identity, Gateway.
- **Worker process**: Observation, Receipt sealing, Alert.
- **Executor process**: Execution, isolated, because the catalog requires isolation before public execution and the demo's mainnet transaction is public execution.

A module becomes a service only when one of the catalog's five extraction tests is measured.

### D3. Postgres only

Redis is dropped. Cross-domain events use the transactional outbox the catalog already specifies, delivered by polling or `LISTEN/NOTIFY`. One fewer rented dependency, and atomicity between state and event comes for free.

### D4. The engineering standard is adopted wholesale

Each of these closes a gap in revision 3:

| Standard | Gap it closes |
|---|---|
| Integer atoms plus explicit scale; floats forbidden | Revision 3 never specified NAV representation |
| `source_event_at`, `received_at`, `persisted_at`, `effective_from/to` | Revision 3 had one timestamp; hallmarks and replay need "what did Seametry know then" |
| Raw evidence captured before normalization, addressed by digest | Revision 3 kept only normalized observations |
| Approval binds a digest of instrument version, snapshot, quote, policy, wallet, message; invalid on material change | Revision 3 simulated but did not bind approval |
| Unknown enum values stay observable | Essential for prerogatives: a new Token-2022 extension must surface as `unknown`, never vanish |
| Corporate-action mismatch quarantines the instrument and blocks builds | Exactly the right response to the stale multiplier field |
| Idempotency keys on every state change | Revision 3 covered events, not requests |

### D5. Two additions to the catalog

**Basket domain.** Owns alloys, allocations, recipe simulation, Good Delivery evaluation, and off-chain NAV. Does not own prices (Market State) or routes (Liquidity).

**The Hall.** An external protocol consumed by Execution and Receipt. It is not a service; it is a program Seametry deploys and then gives up.

### D6. Registry absorbs the research findings

Registry owns grade, decoded prerogatives, and the live multiplier. Prerogatives are decoded from mint data on every refresh, never trusted from a list, with unknown extensions kept observable. The live multiplier is resolved from the effective timestamp, never from the field named `multiplier` alone.

### D7. Public receipts: a correction to revision 3

The standard says public receipts are separately redacted artifacts, not views over private records. Revision 3's hallmark verification violated that in two ways.

**The transaction signature is not redactable.** A signature is public on-chain and reveals the wallet and every amount. A public receipt that includes it is not redacted, whatever else it omits. The public artifact therefore omits signature, wallet and exact amounts. An owner may choose to publish the full record.

**Hashing private data without a salt leaks it.** Trade amounts live in a small space and can be guessed by hashing candidates. The private body carries a 32-byte random salt.

Leaf construction, with domain separation in the style of Certificate Transparency:

```
leaf     = SHA-256( 0x00 || H(public_body) || H(private_body_with_salt) )
interior = SHA-256( 0x01 || left || right )
```

Anyone verifies the public body against the sealed root. The owner proves the private body by revealing it with its salt.

### D8. Oracles are adapters

Chainlink and Stork stay as Observation adapters, as the catalog says, returning typed `UNAVAILABLE` or credential-blocked states. They are off the critical path.

### D9. Surfaces for the hackathon

Per the product architecture's own rule that the submission is a narrow release of the system: native mobile, Explorer (the public console), and one read-only context endpoint. The Terminal follows.

### D10. Contract first

`api/openapi/v1.yaml` is the source of truth for every external shape. Go server interfaces are generated with oapi-codegen; the TypeScript client with openapi-typescript. A change to a shape is a change to the contract first.

---

## 3. Repository layout

```
api/openapi/v1.yaml        the contract
cmd/gateway                core process
cmd/worker                 observation, sealing, alerts
cmd/executor               isolated execution
internal/registry
internal/observation
internal/marketstate
internal/liquidity
internal/policy
internal/basket
internal/execution
internal/receipt
internal/alert
internal/identity
internal/gateway
internal/store
migrations/
programs/hall              Rust, Anchor
spec/recipe/vectors/       shared by Go and Rust
spec/policy/golden/        golden decisions
fixtures/mainnet/          captured account data, slot recorded
apps/mobile                Expo, generated client
apps/explorer              Next.js, generated client
packages/client            generated TypeScript client
packages/ui                design system
scripts/devnet/            mock issuers and scenarios
```

---

## 4. Open items

- **Backpack's dividend mechanism**: multiplier or minted tokens. Settled by the Registry fixture capture.
- **Deadline**: the page header and rules still disagree. Confirm in the hackathon channel.
- **Public repository**: push the Go server and retire `packages/preflight` in the same change, so the repository never shows two authorities.
