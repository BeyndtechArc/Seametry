# Seametry

**See how one tokenized stock changes across issuer state, oracle observations, and executable Solana liquidity before you sign.**

Seametry is a native mobile trading application for tokenized stocks on Solana. It combines instrument identity, issuer state, independent market observations, and size-specific executable routes in one preflight. The user sees the exact conditions, approves them, and signs with their own wallet.

The first reproduced case is UNHx on 12 September 2026. During a scheduled dividend multiplier change, xStocks reported an asset-level halt and no issuer price while a Jupiter-mediated Solana route remained executable. Public interfaces also disagreed about supply representation. Seametry does not call any source the universal true price. It shows what each number represents, when it was observed, whether it is verifiable, and what the proposed transaction will actually guarantee.

## V1 surfaces

| Surface | Purpose | Distribution |
| --- | --- | --- |
| Native mobile app | Watch assets, receive factual state alerts, inspect preflight, connect a wallet, sign and retain receipts | Android install build; iOS development/TestFlight build when signing access permits |
| Public proof console | Let judges inspect live source health, replay the UNHx case, view a settled receipt, and download the app | Public web URL |
| Shared preflight engine | Normalize sources and derive deterministic `ALLOW`, `WARN`, or `BLOCK` states | Open-source TypeScript package |
| Source gateway | Protect provider credentials, verify signed observations, cache briefly, and return one typed context envelope | Small TypeScript service |

The web console is evidence and distribution. The mobile app is the product.

## Current implementation

- Native Expo shell with Today, Markets, Activity, and Settings states.
- Public Next.js evidence console reading the latest generated coverage snapshot.
- Typed xStocks and Jupiter adapters using public endpoints.
- Chainlink and Stork coverage adapters that distinguish configured, unavailable, and credential-blocked states. Live signed-value verification is not claimed yet.
- Pure deterministic preflight engine with tests for agreement, issuer halt, and missing references.
- Hono gateway with health and coverage endpoints.

## Run locally

```bash
npm install
npm run coverage
npm test
npm run typecheck
npm run build:mobile
npm run dev:mobile
```

Run `npm run dev:web` for the public console or `npm run dev:api` for the gateway. Copy `.env.example` to `.env` only when provider credentials and explicit feed mappings are available.

## The 90-second judge path

1. Open the UNHx replay and see the scheduled corporate action, issuer halt, missing issuer quote, oracle observations, and executable Solana route on one synchronized timeline.
2. Switch to the normal control asset and enter a trade amount.
3. Inspect instrument rights, source timestamps, divergence, route composition, expected output, minimum output, and all fees.
4. Approve the exact conditions, open the wallet, and sign.
5. Return to Seametry and compare the approved minimum with the settled output.
6. Open the public transaction and exported receipt.

## Source roles

| Source | Seametry uses it for |
| --- | --- |
| xStocks | Instrument identity, legal form, restrictions, multiplier, corporate actions, halt/session state, issuer reference and reserve context |
| Chainlink Data Streams | Low-latency independent RWA/equity observation, report timestamp, market status, and cryptographic report verification where available |
| Stork | A second signed low-latency observation and source-diversity check, consumed by REST/WebSocket and verified before use |
| Jupiter Metis | Size-specific executable Solana route, AMM labels, route splits, expected output, minimum output and raw swap instructions |
| Solana RPC | Mint/account state, Token-2022 interpretation, simulation, transaction submission and settlement verification |
| User wallet | Key custody, explicit connection and transaction signature |

## Repository plan

```text
apps/
  mobile/              Expo + React Native product
  web/                 public judge/evidence console
  api/                 provider gateway and receipt endpoint
packages/
  domain/              canonical types and reason codes
  preflight/           deterministic derivation engine
  source-xstocks/      issuer adapter
  source-chainlink/    Chainlink adapter and verification
  source-stork/        Stork adapter and verification
  source-jupiter/      Metis quote/build adapter
  source-solana/       RPC and settlement adapter
  ui/                  shared tokens, copy and small primitives
fixtures/
  unhx-2026-09-12/
  normal-control/
  missing-source/
  no-route/
evidence/
docs/
```

## V1 success

- One native mobile build installable by judges.
- One real, small mainnet transaction with a receipt.
- One live asset with xStocks, Chainlink, Stork, Jupiter and Solana context, or an explicit typed `unavailable` observation if a provider does not publish that instrument.
- One synchronized UNHx replay backed by captured raw evidence.
- One normal control proving that a closed underlying market alone is not an error.
- Deterministic tests showing identical inputs produce identical decisions.
- Public documentation that distinguishes observed facts, derived states and product policy.

## Language boundary

Seametry uses `issuer`, `reference observation`, `executable quote`, and `settled result`. It does not label a value `true`, `correct`, `fair`, or `safe`, and it does not recommend direction, size, timing, or suitability.

## Documentation

- [Master brief](docs/MASTER_BRIEF.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Native mobile V1](docs/MOBILE_V1.md)
- [Oracle and source policy](docs/ORACLE_POLICY.md)
- [Build plan](docs/BUILD_PLAN.md)
- [Demo and submission](docs/DEMO_SCRIPT.md)
- [Claims and limitations](docs/CLAIMS_AND_LIMITATIONS.md)
