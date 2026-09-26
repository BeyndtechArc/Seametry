# Seametry

**Exchange traded funds on Solana where anyone can be an authorized
participant, and where the basket keeps working when the issuers of the things
inside it do not.**

A tokenized stock is not an ordinary token. Its issuer can freeze it where it
sits, pause all movement of it, take it back from any wallet, decide who may
receive it, and change how many of them you appear to hold. All of that is
written on chain for anyone who decodes it, and almost nobody decodes it. A
basket of eight tokenized stocks is a basket of eight instruments that eight
other parties still control.

Seametry's basket is struck in a program with no key. It holds no price, so
minting cannot be manipulated by moving a market and the basket works when
every price source is down. Melting it back into its parts cannot be blocked by
anyone, including us. Delivery of an individual constituent can be blocked, by
that constituent's own issuer, and the product says so in those words instead of
pretending otherwise.

## A bundle is not an ETF

Several teams ship bundlers: one transaction, several tokens, you hold the
tokens. An ETF is a mechanism. Shares exist because someone deposited the
basket to create them, and can always be destroyed to reclaim it, and that loop
is what keeps a share's price honest.

Traditionally that loop is restricted to authorized participants, a closed list
of large banks. On Solana it can be open to every wallet. That is the product.

## Surfaces

| Surface | User | Job | Phase |
|---|---|---|---|
| **Explorer** | Public, researchers, press | Inspect instruments and evidence, watch the devnet demonstration, verify any receipt against the chain with no account | 1 |
| **Terminal** | Market makers, arbitrageurs, analysts | The creation and redemption console: NAV against share price, depth at size, assembly cost against melt proceeds | 2 |
| **Mobile** | Holders | Hold baskets, see what changed, approve and sign. Deliberately not a consumer brokerage | 2 |
| **API and SDK** | Wallets, exchanges, issuers, protocols | Buy the assay: grades, prerogatives, corporate actions, admissibility, receipt verification | 3 |

One Go core powers all four. No surface computes a decision; every surface
renders one the core produced, with the inputs and policy version that produced
it.

## The moat is the admission standard

Before a constituent enters a formula, Seametry decodes what it actually is,
live from chain rather than from any published list: its grade (the legal shape
of the claim), every issuer prerogative over it as a plain sentence, its live
Scaled UI multiplier resolved from the effective timestamp rather than the
frequently stale field, its executable depth at size, and any Token-2022
extension we do not recognise, kept observable instead of dropped.

Published as a standard, that is Good Delivery: the rules a constituent must
meet to enter a basket, and the reasons printed beside the stamp when it does
not.

Full product architecture: [docs/PRODUCT_ARCHITECTURE.md](docs/PRODUCT_ARCHITECTURE.md).

## Where the project actually stands

Stated plainly, because a README that describes intentions as though they were
code is the first thing that rots.

**Exists:**

- The Go core in `internal/`: canonical JSON, Merkle receipts, exact decimal
  amounts, Token-2022 mint decoding, the admission policy, the Hall's
  arithmetic, Jupiter depth measurement and a rate limited transport.
- `spec/`: conformance vectors shared by Go, a JavaScript receipt verifier and
  the Rust program, with a drift gate.
- `chain/programs/hall`: the Hall, an Anchor program. All five instructions are
  written and tested in litesvm. It is not deployed anywhere.
- A generated Explorer, captured mainnet fixtures and evidence, and CI.
- A TypeScript scaffold in `apps/` and `packages/` (source adapters, a gateway,
  an Expo shell, a Next.js console) that the Go core is replacing.

**Does not exist:** anything on devnet or mainnet. The contract in
`api/openapi/`. The Terminal. Oracle values read from chain and consumed by the
policy.

**Known gap:** the retired TypeScript `preflight` also flagged missing and
divergent reference prices. `internal/policy` has no counterpart, because oracle
values are to be read from chain
([decision](docs/decisions/2026-09-23-oracles-on-chain.md)) and that read is not
built.

The full gap list, including documentation gaps, is in
[docs/README.md](docs/README.md) under Open items.

## Documentation

Start at **[docs/README.md](docs/README.md)**. It carries the index, states
which document owns which subject, and explains how documents are changed.

Three foundation documents, short on purpose, read before writing code:

- [Product architecture](docs/PRODUCT_ARCHITECTURE.md): what this is, for whom,
  and how it is paid for
- [Service catalog](docs/SERVICE_CATALOG.md): boundaries, data ownership,
  contracts, deployment
- [Engineering standard](docs/ENGINEERING_STANDARD.md): the non negotiable
  rules and what enforces each one

## Run what exists today

```bash
go test ./...                              # the Go core
node tools/spec/generate.mjs --check       # conformance vectors must not drift
npm run explorer                           # rebuild the Explorer
npm run serve                              # serve it without Go
(cd chain && cargo-build-sbf --arch v0 && cargo test --locked)   # the Hall
```

The TypeScript scaffold still runs: `npm install`, then `npm run coverage`,
`npm run typecheck`, `npm run dev:web`, `npm run dev:api`, `npm run dev:mobile`.
It has no tests of its own now that `preflight` is gone.

Copy `.env.example` to `.env` only when provider credentials are available.
Public discovery works without secrets; signed oracle reads do not.

## Source roles

| Source | Used for |
|---|---|
| Issuer endpoints (xStocks and others) | Instrument identity, legal form, restrictions, multiplier, corporate actions, halt and session state, issuer reference |
| Chainlink Data Streams | Independent low latency observation, report timestamp, market status, report verification where available |
| Stork | A second signed low latency observation and source diversity check |
| Jupiter | Size specific executable routes, splits, expected and minimum output, fees, swap instructions |
| Solana RPC | Mint and account state, Token-2022 interpretation, simulation, submission, settlement |
| User wallet | Key custody, explicit connection, transaction signature. Seametry holds no key |

## The line Seametry does not cross

It does not call any value true, correct, fair, or safe. It does not average
sources into a synthetic consensus. It does not recommend direction, size,
timing, or suitability. It does not custody assets. When a source goes quiet it
is reported as stale with its age, or unavailable by name, never as a continued
last value.
