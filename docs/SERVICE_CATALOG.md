# Service Catalog

**Status:** living document. This file owns service boundaries, data ownership,
inter service contracts, deployment topology, and the criteria under which a
module becomes a separately deployed service. It does not own product scope
(`PRODUCT_ARCHITECTURE.md`) or engineering rules (`ENGINEERING_STANDARD.md`).

**Last substantive change:** 23 September 2026.

---

## 1. Boundary is not topology

A **service** here is a boundary: it owns a set of tables, exposes a contract,
and may not be reached any other way. A **process** is a deployment unit. These
are different decisions and conflating them is how a small team acquires the
operational cost of a large one without the benefit.

We define real boundaries now, and we run few processes.

Every service below is a Go package under `internal/<name>`. A service becomes
its own process only when an extraction criterion in section 5 is measured, not
anticipated.

## 2. The rules

1. **A service owns its tables.** No service reads or writes another service's
   tables. Cross boundary reads go through the owning service's Go interface in
   process, or its contract across a process boundary.
2. **A service owns its meaning.** If two services need to agree on what a
   value means, one of them owns the definition and the other consumes it. A
   shared understanding maintained in two places is a future incident.
3. **Cross domain events go through the outbox.** Written in the same
   transaction as the state change they describe. No other event path exists.
4. **Adapters are modules, not services.** A provider adapter lives inside
   Observation until that specific provider's load or failure profile justifies
   isolation.
5. **Failure is contained at the boundary.** A service that cannot answer says
   so in typed form. It never returns a fabricated value, and it never takes a
   neighbour down with it.
6. **Extraction is measured.** Section 5.

---

## 3. The services

### 3.1 Registry

**Purpose.** The canonical instrument graph. The defence against assuming that
similarly named symbols are the same economic product.

**Owns.** Underlying securities; tokenized products; mints and token programs;
issuers and custodians; provider identifiers per source; oracle feed addresses;
grade; redemption path; jurisdiction exclusions; dividend mechanism; corporate
actions; effective dated multiplier records; trading and redemption
restrictions; decoded issuer prerogatives.

**Does not own.** Prices, quotes, routes, or any observation of value.

**Grade** is the legal shape of a claim and nothing else. It never implies
quality, safety, or preference:

| Grade | Meaning |
|---|---|
| `entitlement` | redeemable one to one into a security entitlement via a regulated broker |
| `certificate` | a tracker certificate; a claim on the issuer that settles to cash |
| `interest` | a proportional interest in a vehicle holding private shares |
| `ungraded` | not classified; blocks execution by default |

**Prerogatives** are decoded from live mint account data on every refresh and
never trusted from a published list. A published list is evidence of intent,
not a statement of current state.

| Field | Source |
|---|---|
| `freeze_authority` | mint freeze authority |
| `permanent_delegate` | PermanentDelegate extension |
| `pausable`, `paused` | Pausable extension |
| `transfer_hook` | hook program, or `initialized_disabled`, or absent |
| `default_account_state` | DefaultAccountState extension |
| `permissioned_burn` | where present |
| `scaled_ui_authority` | ScaledUiAmount authority |
| `mint_authority` | mint authority |
| `unknown_extensions` | every extension the decoder does not recognise |

`initialized_disabled` is reported distinctly from absent. A hook that exists
and is switched off can be switched on. `unknown_extensions` is never empty by
convention and never silently dropped: an extension we have not implemented is
a fact about the instrument, not a gap in our model.

**Live multiplier resolution.** Scaled UI Amount carries `multiplier`,
`new_multiplier`, and `new_multiplier_effective_timestamp`. The live value is
`new_multiplier` once the effective timestamp has passed, otherwise
`multiplier`. Reading the field named `multiplier` alone leaves a reader one
corporate action behind. Multipliers are exact decimals and never pass through
a float. UI amounts are computed with the Token-2022 library helper for the
resolved multiplier, never reimplemented.

**Quarantine.** A mismatch between an expected corporate action and the
observed multiplier state quarantines the instrument. A quarantined instrument
blocks transaction builds and says why.

**Depends on.** Observation, for chain reads. Nothing else.

**Failure.** Registry unavailable means no instrument can be resolved, so
nothing downstream can proceed. It is the hardest dependency in the system and
its data changes slowly, which makes it the best caching candidate.

### 3.2 Observation

**Purpose.** Everything that must be observed from outside and preserved
exactly as it arrived.

**Owns.** Provider adapters; raw payload capture; normalized observations;
adapter versions; provider health and degradation state.

**Adapters, as modules.** Issuer endpoints (xStocks and others); Chainlink;
Stork; Solana accounts and programs; Jupiter; venues added later. Chainlink and
Stork return typed `UNAVAILABLE` or `CREDENTIAL_BLOCKED` rather than failing
ingestion, and they sit off the critical path.

**Every observation records.** Provider event time; local receipt time;
persistence time; source identifier; adapter version; verification state; raw
payload hash; canonical instrument binding.

**Raw before normalized.** The unmodified provider response is written to
content addressed object storage before any interpretation. Ingestion is not
acknowledged as durable if raw capture failed. Replaying stored raw payloads
must reproduce normalized observations byte for byte, and that is a test, not
an aspiration.

**Does not own.** What an observation means in context, whether it is fresh
enough to act on, or how two observations relate. That is Market State.

**Depends on.** Registry, for instrument binding. Object storage.

**Failure.** A provider timeout records the attempt and exposes `UNAVAILABLE`
for that source. It never relabels an old observation as fresh, and it never
takes other adapters down with it.

### 3.3 Market State

**Purpose.** Versioned, point in time snapshots describing the relationship
between independently meaningful states. It never selects a correct price.

**Owns.** Market sessions, holidays, and early closes as versioned data;
freshness per source; the four evidence states; reference observations;
executable observations; divergence in exact decimals; liquidity state;
corporate action state; conflict classification; snapshots.

**The four evidence states**, carried as an explicit field, separate from
source state, transport state, and session state:

| State | Meaning |
|---|---|
| `verified` | signed or cross confirmed, and fresh |
| `unverified` | a real value, not independently checked |
| `stale` | observed, but past its window. Always carries its age |
| `unavailable` | the source said nothing. Named, never omitted |

**Two questions, both answerable.** What do we know now, and what did Seametry
know at time T. A late arriving observation changes history correctly and both
answers remain reproducible.

**Depends on.** Registry, Observation.

**Failure.** Missing sources produce an incomplete snapshot that says which
sources are missing. A partial snapshot presented as complete is the failure
mode this service exists to prevent.

### 3.4 Liquidity

**Purpose.** Executable discovery. What would actually happen at this size,
right now, in this direction.

**Owns.** Route discovery and normalization; quotes at policy defined notional
sizes; depth at size curves; price impact; fee decomposition; quote expiry;
simulation inputs.

**A quote is an expiring proposition,** bound to instrument, direction, and
size. Expiry is enforced server side by every consumer. An expired quote is
rejected, never refreshed silently and never reused.

**Does not own.** Whether a quote is acceptable. That is Policy.

**Depends on.** Registry, Observation.

**Failure.** No routes available means no new plans and no execution. Market
State continues, observations continue to age visibly, and every surface says
quotes are unavailable rather than showing the last one as current.

### 3.5 Policy

**Purpose.** The deterministic decision engine. Pure. No input or output
outside its arguments and return value.

**Owns.** Policy documents as versioned data (staleness windows per source,
quote sizes, price impact ceilings, divergence thresholds, drift bands,
delivery rules, seal cadence, alert thresholds, market calendar version);
reason code definitions; the decision function.

**Inputs.** A market state snapshot, a quote, user declared limits, a
transaction intent, and applicable product or jurisdiction restrictions.

**Outputs.** One decision (`ALLOW`, `WARN`, `BLOCK`), versioned reason codes,
human readable facts, an input digest, the policy version, and an expiry.

**Policy is data, not code.** A consumer who wants different thresholds
receives a file, not a fork. Every decision records the policy version that
produced it, and identical inputs produce byte identical digests on every
machine.

**Does not own.** Recommendations. Policy states conditions and their
classification. It never expresses a view on direction, size, timing, or
suitability.

**Depends on.** Nothing at runtime. It is a function.

**Failure.** A pure function's failure is a bug, caught by golden vectors in
`spec/policy/golden/`.

### 3.6 Execution

**Purpose.** Turning an approved intent into a transaction the user's wallet
signs, and knowing exactly what happened to it.

**Owns.** Intents; transaction construction; program and account allowlists;
approval snapshots; simulation results; submission; confirmation and finality
tracking.

**Guarantees.** Quote expiry is checked at build and again at submission. The
approval binds an immutable digest over instrument version, state snapshot,
quote, policy version, wallet, and message; any material change invalidates it
and the user is asked again. A transaction touching a program outside the
allowlist is refused before it ever reaches a wallet. Simulation runs before
every signature request and the simulated balance deltas are what the user is
shown, not the plan's claims about them.

**Never.** Holds a user key, signs a user transaction, or moves user funds.
This is structural, not procedural.

**Depends on.** Registry, Market State, Liquidity, Policy, Basket.

**Failure.** Isolated by deployment (section 4) because it is the only surface
that can cost a user money.

### 3.7 Receipt and Audit

**Purpose.** Reconciling what was intended, approved, simulated, submitted, and
settled, and producing an artifact that outlives the session.

**Owns.** Receipts (the hallmark, in brand language); serial allocation;
private and public bodies; Merkle sealing and inclusion proofs; anchor
transactions; certificate rendering; reconciliation records.

**Serial.** `MMYY` plus seven Crockford base32 characters, allocated
monotonically under a unique constraint, never reused, never deleted.

**Public and private bodies are constructed separately.** The public artifact
omits the transaction signature, the wallet, and exact amounts, because a
signature is public on chain and reveals all three. A public receipt containing
one is not redacted, whatever else it omits. The private body carries a 32 byte
random salt, because trade amounts occupy a small space and an unsalted hash of
one can be recovered by guessing. Leaf and interior construction is specified
in `ENGINEERING_STANDARD.md` section 12.

**Verification requires no Seametry credentials.** Anyone recomputes the public
body's digest, checks the inclusion proof against the sealed root, and checks
that root against its on chain anchor. The owner, and only the owner, can prove
the private body by revealing it with its salt.

**Depends on.** Execution, Market State, Registry. Object storage. Chain write
access for the anchor key only.

**Failure.** An unfunded or unavailable anchor key pauses sealing. Receipts are
still issued and are shown as unsealed, honestly, until sealing resumes.

### 3.8 Alert

**Purpose.** Turning meaningful state transitions into delivered notifications.

**Owns.** Subscriptions; rules; delivery attempts and retries; channel
adapters for push, email, webhook, and in product notification.

**Consumes transitions, not tables.** It reads outbox events. It does not poll
every table looking for change.

**Depends on.** The outbox. Identity, for delivery targets.

**Failure.** Total and permanent alert failure must leave ingestion, state, and
execution completely unaffected. This is tested by disabling delivery and
asserting the rest of the system is unchanged.

### 3.9 Identity and Entitlements

**Purpose.** Who is asking, what they may see, and what it costs.

**Owns.** Users and teams; linked public wallet addresses; sessions; API keys;
plans; permissions; saved workspaces; watchlists; usage metering and quotas.

**Wallet linking is identity evidence, not custody.** Proving control of an
address grants a view of that address's data. It grants no ability to move
anything.

**Depends on.** Nothing. It is the entry point.

**Failure.** Degrades to public entitlements only. Public surfaces stay up.

### 3.10 Gateway

**Purpose.** The read and write edge. The Terminal must not make eight
synchronous calls to render one screen.

**Owns.** Public REST and OpenAPI endpoints; server sent event streams for live
change; surface specific aggregation for Terminal and mobile; precomputed
workspace snapshots; rate limiting and entitlement enforcement at the edge.

**Health is observational.** Our own freshness is returned in the same envelope
as any other evidence: ledger lag, observer freshness per instrument, seal
backlog. Seametry's own staleness is held to the standard it holds sources to.

**Depends on.** Every service. Owns none of their data.

**Failure.** Returns typed degradation, never a blank or a stale value
presented as current.

### 3.11 Basket

**Purpose.** Alloys, allocations, recipe simulation, delivery standard
evaluation, and off chain basket valuation.

**Owns.** Alloy records; recipes as fixed quantities per share, never weights;
allocations and their weighting schemes; drift detection; delivery
assessments; off chain NAV.

**Does not own.** Prices (Market State) or routes (Liquidity). No Basket
function reads a price for recipe arithmetic. Recipe arithmetic moves
quantities only.

**Refuses partial answers.** A basket valuation where any constituent lacks an
acceptable observation is not produced. A partial valuation looks complete and
is worse than none. Every valuation reports the weakest evidence it contains.

**Depends on.** Registry, Market State, Liquidity, Policy.

### 3.12 The Hall (external protocol)

Not a service. An on chain program Seametry deploys and then gives up control
of, consumed by Execution and Receipt. It is price blind: no price, quote, or
oracle is ever an input to any instruction, which is what makes minting immune
to price manipulation and keeps the basket working when every price source is
down. Specified in `prd/HALL.md`.

Because it is external and immutable, it is the one dependency with no
degradation path and no failover: whatever is deployed is what exists, forever,
for whoever keeps using it. That is the point of it, and it is why the Rust
implementation is bound to the Go core by shared vectors before deployment
rather than tested against it afterward.

---

## 4. Deployment topology

**One process.** `cmd/seametry` runs every service in section 3, with
background work on internal schedulers. The boundaries in section 3 are
enforced by package structure and tests, not by network hops, which is what
makes splitting later a configuration change rather than a rewrite.

This follows the rule in section 5 rather than anticipating it. A single
operator with no traffic gains nothing from three processes except three times
the deployment surface and an inter process network bill.

**The first split, when it comes, is Execution.** Criterion 5, isolation, is
the one that will be met first, and it is met by the existence of real mainnet
execution with real user money, not by planning to have some. Until a mainnet
transaction is imminent, execution runs in the same process behind the same
package boundary.

**Cost shape at this size.** Compute is the cheapest line. The expensive line
is retained evidence, governed by the retention policy in
`ENGINEERING_STANDARD.md` section 5, and it grows with observation cadence
times instrument count times source count, not with users. Cadence is therefore
a cost decision as much as a product one, and it lives in policy data where it
can be changed without a deploy.

## 5. Extraction criteria

A module becomes its own process when at least one of these is **measured**,
with the measurement recorded in the decision log:

1. **Divergent scaling.** Its resource curve differs from its process peers by
   an order of magnitude under real load.
2. **Divergent availability.** It must stay up when its process peers are being
   deployed, or vice versa.
3. **Blast radius.** Its failure currently takes down something that should
   have survived, and no in process containment fixes it.
4. **Divergent change rate.** It is deployed far more or far less often than
   its peers, and the coupling is slowing both.
5. **Isolation requirement.** A security, compliance, or key handling boundary
   requires it. This is the criterion that already justifies `cmd/executor`.

Anticipation is not measurement. "It will need to scale" is not a criterion.

## 6. Contracts

- **Internal contracts** are Protobuf over ConnectRPC. Generated clients, no
  hand written internal HTTP.
- **The public boundary** is REST described by OpenAPI in `api/openapi/`. It is
  the source of truth for every external shape. Go server interfaces and the
  TypeScript client are generated from it, and a contract drift check
  regenerates and fails on any diff.
- **A change to a shape is a change to the contract first.** Never a change to
  a handler that the contract learns about afterwards.
- **Live change** reaches surfaces over server sent events. The event payload
  is a contract like any other.

## 7. Events

Cross domain events are written to the Postgres outbox in the same transaction
as the state change they describe, and delivered by polling or `LISTEN/NOTIFY`.
There is no second event bus.

| Event | Emitted by | Consumed by |
|---|---|---|
| `instrument.quarantined` | Registry | Gateway, Alert, Execution |
| `prerogative.changed` | Registry | Alert, Market State |
| `corporate_action.effective` | Registry | Alert, Market State |
| `observation.degraded` | Observation | Market State, Alert |
| `divergence.crossed` | Market State | Alert |
| `session.changed` | Market State | Alert |
| `execution.settled` | Execution | Receipt and Audit, Alert |
| `execution.deviated` | Execution | Receipt and Audit, Alert |
| `receipt.sealed` | Receipt and Audit | Alert, Gateway |

Every consumer is idempotent on the event's natural key. Replaying the log
rebuilds derived state.
