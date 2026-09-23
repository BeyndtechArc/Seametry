# Engineering Standard

**Status:** living document. This file owns the rules that hold regardless of
which service, surface, or language is in front of you. It does not own product
scope (`PRODUCT_ARCHITECTURE.md`) or service boundaries (`SERVICE_CATALOG.md`).

**Last substantive change:** 23 September 2026.

---

## 1. Purpose and enforcement

Seametry's product claim is that its numbers carry their provenance. A system
that is casual about representation, time, or determinism cannot make that
claim, whatever its interface says.

Every rule below is enforced by a test, a CI check, or a type, and the
enforcement mechanism is named with the rule. A rule with no enforcement is a
preference, and preferences belong in review comments, not here.

**Exceptions require a decision record** in `docs/decisions/`, stating what was
relaxed, where, and what makes it acceptable. An undocumented exception is a
defect.

## 2. One implementation decides

Domain logic, policy evaluation, basket arithmetic, and every decision are
computed in the Go core. Clients render decisions. Clients never compute them.

Determinism is a property of one implementation, or of several implementations
bound by shared vectors. The first is simpler and removes an entire class of
divergence.

The one unavoidable second implementation is the Hall program in Rust. It is
bound to Go by shared vectors in `spec/recipe/vectors/`, loaded by both test
suites. Any divergence is a failing test, not a negotiation.

TypeScript types are generated from the versioned contract. A hand written
TypeScript type describing a server shape is a defect.

**Enforced by:** CI fails if a decision function appears outside the Go core;
contract drift check regenerates clients and fails on diff.

## 3. Money, quantity, and arithmetic

**No `float64`, or any binary floating point type, for a price, quantity, fee,
multiplier, ratio, or divergence. Anywhere. Including tests, fixtures, and
example payloads.**

- **Representation.** An integer amount in atomic units plus an explicit scale.
  The pair travels together and is never separated. A bare integer without its
  scale is meaningless and a bare decimal string without its source scale is
  worse, because it looks usable.
- **In Go.** Integer types for atoms, `math/big` or a checked 128 bit type for
  intermediates that can exceed 64 bits. Exact decimal arithmetic where a
  decimal is genuinely required, for example multipliers.
- **On the wire.** Amounts serialize as a string of integer atoms plus an
  integer scale. Never as a JSON number, which is a double in most parsers and
  silently loses precision above 2^53.
- **Rounding is explicit per operation and stated in the contract.** Where a
  rounding direction advantages one party, it is documented and it consistently
  favours the protocol or the house, never the counterparty.
- **Percentages and divergence** are exact decimals or basis points. Never a
  float, never a pre rounded display value reused as an input.
- **Display formatting happens once, at the surface,** from exact values. A
  formatted string never re enters the domain.

**Enforced by:** a CI lint banning float types in domain packages and contract
definitions; golden vector tests with exact expected values.

## 4. Time

Four timestamps, all UTC, all distinct, never conflated:

| Field | Meaning |
|---|---|
| `source_event_at` | when the provider says the thing happened |
| `received_at` | when we received it |
| `persisted_at` | when we durably stored it |
| `effective_from` / `effective_to` | the window during which a record is the applicable one |

- **Provider time is never arrival time.** A system that conflates them cannot
  answer what it knew and when, which is the question every receipt, replay,
  and dispute turns on.
- **A late arriving observation changes history, correctly.** It is inserted at
  its `source_event_at` with its true `received_at`, and any snapshot computed
  after it reflects it. Snapshots already issued are not silently rewritten.
- **Freshness is derived, never stored as a boolean.** Age is computed against
  the policy window at read time, from the two relevant timestamps.
- **Market sessions, holidays, and early closes are versioned data,** owned by
  Market State, with the calendar version recorded on every decision that used
  it.
- **Wall clock is for records, monotonic clocks are for durations.** Never
  measure an elapsed interval by subtracting wall clock readings.

**Enforced by:** schema constraints requiring all four fields on external
records; a replay test in which a late arriving observation changes a
recomputed snapshot and leaves the originally issued one intact.

## 5. Evidence and raw capture

- **Raw before normalized.** The unmodified provider response is written to
  content addressed storage, keyed by SHA-256 of its bytes, before any parsing
  that the system depends on.
- **Durability is not acknowledged if raw capture failed.** An observation
  whose raw payload is not stored does not exist as far as the pipeline is
  concerned.
- **Normalization is reproducible.** Replaying stored raw payloads through the
  recorded adapter version reproduces the normalized observation byte for byte.
- **Adapter version is recorded on every observation.** When an adapter's
  interpretation changes, old observations remain interpretable under the
  version that produced them.
- **We never depend solely on our own interpretation.** Anything we assert
  about a source can be re derived from bytes the source actually sent.

**Enforced by:** a replay test per adapter asserting byte identical
renormalization; an ingestion test asserting failure when the object store is
unavailable.

### 5.1 Retention

"Retain everything forever" is not a policy, it is an unpriced liability.
Observation volume grows with cadence times instruments times sources, and it
does so whether or not anyone is using the product. At a modest 20 instruments
across 5 sources every 5 minutes, normalized rows reach roughly 870MB per month
and raw payloads roughly 8.6GB per month, which exceeds every free database and
object storage tier inside the first month.

Retention is therefore **policy data, versioned like any other policy**, with
three tiers:

| Tier | Holds | Default window |
|---|---|---|
| Hot | Normalized observations, full fidelity, in Postgres | 30 days |
| Warm | Raw payloads, content addressed, in object storage | 90 days |
| Cold | Daily aggregates plus every observation referenced by a decision, an approval, or a receipt | Indefinite |

Three rules make this honest:

1. **Evidence that was used is never pruned.** Any raw payload or observation
   referenced by a decision, an approval snapshot, or a receipt is promoted to
   cold and kept, because the receipt's verifiability depends on it. Pruning is
   only ever allowed to remove evidence nothing points at.
2. **Pruned is not the same as never observed.** A window that has aged out
   reports as `pruned` with its date range, distinctly from `unavailable`. A
   replay that reaches beyond retention says so rather than returning a
   shorter history as though it were complete.
3. **Cadence is a policy value, not a constant.** Lowering observation cadence
   is the first lever when storage cost binds, and it is changed in policy data
   with the change recorded, never by editing a scheduler.

**Enforced by:** a test asserting that an observation referenced by a receipt
survives a prune pass; a test asserting a pruned range reports as pruned and
not as unavailable.

## 6. State, versioning, and point in time

- **No mutable "latest value" is the authoritative record.** A latest view is a
  cache over an append only history and is always reconstructible from it.
- **Every state is reproducible as of a timestamp.** "What is true now" and
  "what did Seametry hold as true at time T" are both answerable for every
  instrument, and both are tested.
- **Records that describe a period are effective dated,** with explicit
  `effective_from` and `effective_to`, rather than overwritten.
- **Derived state is rebuildable.** Every table derived from chain or provider
  history can be dropped and rebuilt from retained evidence. That is a test
  that runs, not an assumption.

## 7. Unknown values stay observable

- **An unrecognised value is never mapped to a known one.** Not to a default,
  not to the nearest neighbour, not to `OTHER` where `OTHER` is discarded
  downstream.
- **Enums are open at the edge and closed in the core.** The edge preserves the
  raw value alongside its parsed form. The core switches exhaustively and
  handles the unknown case explicitly.
- **Unknown is surfaced, not swallowed.** A Token-2022 extension we do not
  implement appears in `unknown_extensions` and reaches the interface as a
  stated fact about the instrument.

This rule exists because the failure it prevents is silent. A mapped unknown is
indistinguishable from a recognised value at every layer above it.

**Enforced by:** decoder tests asserting an unrecognised extension survives to
the output; exhaustive switch linting in the core.

## 8. Determinism and digests

- **Decision functions are pure.** Arguments in, value out, no clock read, no
  network call, no database access, no randomness.
- **Canonical JSON is RFC 8785.** One canonicalization, used everywhere a
  digest is computed.
- **`input_digest`** is SHA-256 over the canonical JSON of every input,
  including the policy version and every referenced record version. Identical
  inputs produce byte identical digests on every machine and every run.
- **Every decision records the policy version** that produced it. A decision
  whose policy version is unknown is not reproducible and is therefore not a
  decision, it is an opinion.
- **Reason codes are versioned and stable.** A reason code's meaning never
  changes. A new meaning is a new code.

**Enforced by:** golden decision vectors in `spec/policy/golden/`; a digest
stability test run in CI on more than one platform.

## 9. Idempotency

- **Every state changing request takes an idempotency key.** Replaying a
  request with the same key returns the original result and performs no second
  effect.
- **Every ingested external record has a natural key.** For chain events:
  signature plus instruction index plus inner instruction index. Replaying the
  source rebuilds the same state.
- **Every event consumer is idempotent.** Delivery is at least once. Consumers
  are written accordingly.

**Enforced by:** a duplicate delivery test per consumer; a unique constraint on
every natural key.

## 10. Data ownership and schema change

- **No service reads or writes another service's tables.** Access goes through
  the owning service's interface or contract. Enforced by package boundaries
  and by review.
- **The outbox is the only cross domain event path.** Events are written in the
  same transaction as the state change they describe, which is what makes
  "state changed but the event was lost" impossible.
- **Migrations are expand and contract.** Add the new shape, backfill, move
  readers, move writers, then remove the old shape, as separate deploys. No
  release contains both a writer change and a destructive change to the same
  column.
- **A migration is reversible or it is gated.** An irreversible migration
  requires a decision record and a tested restore path.

## 11. Execution safety

- **Seametry holds no user key.** No private key or seed phrase enters any
  Seametry system, process, log, or backup. The backend builds unsigned
  transactions. Wallets sign.
- **Quote expiry is enforced server side,** at build and again at submission. A
  client is never the authority on whether a quote is still valid.
- **Approval binds an immutable digest** over instrument version, market state
  snapshot, quote, policy version, wallet, and message. Any material change
  invalidates the approval and the user is asked again.
- **Programs and accounts are allowlisted.** A transaction touching a program
  outside the allowlist is refused before wallet handoff, not detected
  afterwards.
- **Simulate before every signature request,** and show the simulated balance
  deltas, not the plan's claims about them.
- **The synchronous execution path stays short.** Everything that can be done
  after submission is done after submission.

**Enforced by:** tests asserting that mutating any bound input invalidates the
approval, and that an unlisted program is refused before handoff.

## 12. Receipts, redaction, and sealing

A receipt is the artifact that outlives the session. It is called a hallmark in
the interface and `Receipt` in code.

- **Serial.** `MMYY` plus seven Crockford base32 characters, allocated
  monotonically under a unique constraint. Never reused. Never deleted.
- **The private body** contains the full record: intent, approval, simulation,
  submission, settlement, balance changes, fees, deviations, and a 32 byte
  cryptographically random salt. The salt exists because trade amounts occupy a
  small space and an unsalted digest of one can be recovered by hashing
  candidates.
- **The public body is constructed separately,** not filtered from the private
  one. It omits the transaction signature, the wallet address, and exact
  amounts. A transaction signature is public on chain and reveals the wallet and
  every amount, so a public artifact containing one is not redacted whatever
  else it omits.
- **Leaf and interior construction,** with domain separation in the style of
  Certificate Transparency:

  ```
  leaf     = SHA-256( 0x00 || H(public_body) || H(private_body_with_salt) )
  interior = SHA-256( 0x01 || left || right )
  ```

- **Sealing** anchors the Merkle root on chain on a policy cadence, from a
  dedicated key that can only write memos and holds a minimal balance.
  Inclusion proofs are stored. Status moves from unsealed to sealed and both
  states are shown honestly.
- **Verification requires no Seametry credentials.** Anyone recomputes the
  public body's digest, checks its inclusion proof against the root, and checks
  the root against its anchor transaction, signed by a key on the published
  anchor key list. The owner, and only the owner, can prove the private body by
  revealing it with its salt.
- **Receipts are never deleted or mutated.** A correction is a new record that
  references the original.

**Enforced by:** a test that scans every public artifact for a transaction
signature, a wallet address, or an exact amount and fails on any hit; a
verification test that runs with no credentials configured.

## 13. Degradation

- **A source that stops answering becomes `stale` with its age, or
  `unavailable` by name.** It never becomes a fabricated continuation of its
  last value, and it never silently disappears from a response.
- **An incomplete answer says which parts are missing.** A partial result
  presented as complete is the most expensive defect this system can ship,
  because it is indistinguishable from a correct one at the point of use.
- **Our own freshness is evidence held to the same standard.** Ledger lag,
  observer age, and seal backlog are returned in the same envelope, with the
  same four states, as any external source.
- **Failure is typed.** A service that cannot answer returns a typed
  degradation, never an empty success.

## 14. Asynchrony

- **Short synchronous path.** Read, decide, build, respond.
- **Asynchronous by default:** ingestion, normalization, reconciliation,
  receipt enrichment, sealing, alerting, and any provider call not required to
  answer the request in hand.
- **Alert delivery failure never affects ingestion, state, or execution,** and
  that isolation is tested by disabling delivery entirely and asserting the
  rest of the system is unchanged.

## 15. Dependencies

A new dependency requires a stated category (rented or owned), a stated failure
mode, and a statement of why nothing already present suffices. In the pull
request, not afterwards.

**Present and settled:** Go with a pinned toolchain; PostgreSQL; S3 compatible
object storage; ConnectRPC and Protobuf internally; OpenAPI at the public edge;
pgx and sqlc; server sent events; OpenTelemetry.

**Deliberately absent, with the trigger that would admit them:**

| Not used | Would be admitted when |
|---|---|
| Redis | The Postgres outbox is measured as the bottleneck, not assumed to be |
| Kafka or NATS | Event volume exceeds what Postgres delivery sustains under measurement |
| Kubernetes | Operational need exceeds a small number of container processes |
| ClickHouse | Observation density or replay genuinely hurts Postgres, measured |
| An ORM | Never. Financial queries stay visible, which is why sqlc is used |

Node exists as a build tool for the frontends. It does not run the backend and
it does not hold financial state.

## 16. Language boundary and style

These apply to code, comments, identifiers, copy, documentation, and commit
messages.

- **Never write `true`, `correct`, `fair`, `safe`, `guaranteed`, or `pure`
  about a value, a price, or a source.** Write the source, the age, the
  verification state, the grade, the prerogative.
- **Never recommend.** No direction, size, timing, or suitability. State
  conditions and their classification.
- **A number carries its provenance in the same breath.** A bare figure with no
  source and no age is not shippable output.
- **Name what is missing.** An unavailable source is listed as unavailable, not
  omitted from the response.
- **Never write an em dash** in code, comments, copy, or documentation.
- **Grades and prerogatives are described, never judged.** The same sentence
  applies to every issuer holding the same control.
- **Interface names and code names are different, deliberately.** World names
  live in the interface, literal names live in code and in every external
  contract, because a standard others build against must be boring. The mapping
  is in `BRAND_AND_WORLD.md` section 4 and is the only source for it.

**Enforced by:** a CI lint for the banned vocabulary and for em dashes across
source and documentation.

## 17. Testing and evidence of done

- **Golden vectors** for every deterministic surface: policy decisions, recipe
  arithmetic, digest computation. Language neutral, with integer string
  amounts, shared across implementations.
- **Property tests** for arithmetic invariants over random operation sequences.
- **Replay tests** for adapters and for derived state rebuilds.
- **Contract drift check.** Regenerate from the contract, fail on any diff.
- **Race detection** on every Go test run in CI.
- **A test that fails for the right reason before it passes.** A test written
  after the code it covers is verified by breaking the code.
- **Evidence of done is the command and its output, pasted.** "It should work"
  is not evidence. This applies to agents and humans equally.
- **A vector is never edited to make code pass.** A vector that looks wrong is
  escalated, not adjusted.

## 18. Observability

Structured JSON logs with a request or event correlation identifier on every
line. OpenTelemetry traces across service boundaries. Prometheus compatible
metrics.

Metrics that double as user visible evidence are first class, not debug output:
ledger lag in slots and seconds, observer freshness per instrument and source,
seal backlog, quote rejection rate, provider error rate per adapter.

Alert on: ledger lag, seal backlog, provider error rate, outbox depth,
execution failure rate.

**No secret, key, seed, or full raw payload is ever logged.** Raw payloads are
referenced by digest.

## 19. Security

- **The backend cannot move user funds, by construction,** and that property is
  asserted in tests rather than trusted to discipline.
- **Secrets live in the host's secret manager.** No secret is committed, and
  the shipped mobile application contains none.
- **The anchor key writes memos and nothing else,** holds a minimal balance,
  and is rotated on a published schedule. Verification ignores any root not
  signed by a key on the published list, so compromise produces junk memos
  rather than a false proof.
- **Rate limits per identity and per API key,** enforced at the edge.
- **Serials are monotonic under a unique constraint.** Receipts are never
  deleted.
- **Dependency and container scanning in CI,** with a documented response path
  for a finding.
