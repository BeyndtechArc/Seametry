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

**Exists:** a TypeScript scaffold. A deterministic preflight package with
tests, typed xStocks and Jupiter adapters over public endpoints, Chainlink and
Stork coverage adapters that distinguish configured, unavailable, and
credential blocked states, a Hono gateway with health and coverage endpoints,
an Expo shell with four screens, and a Next.js console reading a generated
coverage snapshot.

**Does not exist:** the Go core these documents specify. The contract in
`api/openapi/`. Any CI. Any of the shared vectors in `spec/`. The Terminal.

**Known conflict:** `packages/preflight` computes decisions in TypeScript,
which `ENGINEERING_STANDARD.md` section 2 forbids. It is retired in principle
and still present in fact. It goes when the Go core replaces it, in one change,
so the repository never shows two authorities.

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
npm install
npm run coverage      # live source coverage probe, writes evidence/
npm test              # preflight determinism tests
npm run typecheck
npm run dev:web       # public console
npm run dev:api       # gateway
npm run dev:mobile    # Expo
```

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
