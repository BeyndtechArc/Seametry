# Index-first launch assessment, 11 October 2026

Status: research and launch recommendation, not a deployment authorization or legal opinion.

## Decision

Lead with a small set of curated, named Alloys and make their buy, hold, and exit paths legible. Keep permissionless sponsorship as a secondary path. Do not open the Hall to public mainnet deposits today. The strongest pitch today is a working devnet Strike/Melt plus a real, separately labelled mainnet direct-allocation purchase and sale. Never describe direct allocation as an Alloy share.

The launch gate is not answered by a competitor's deployment. The Hall pools stock-linked tokens and issues a share. That is a different fact pattern from a basket of ordinary SOL ecosystem coins. It needs a jurisdiction-specific crypto-securities legal read and an independent program review before public mainnet custody. The repository's own `PRODUCT_ARCHITECTURE.md` section 9 and `prd/HALL.md` sections 8-10 make these gates explicit.

## Competitor evidence and limits

| Product | What is substantiated | What not to infer |
| --- | --- | --- |
| Basket (`basketsolana.xyz`) | User-supplied screenshots show an index catalogue, fixed-units detail, composition/price switch, mint/redeem order sheet, and displayed metrics. Its [MetaDAO profile](https://metadao.fi/companies/basket) describes one-share thematic indexes, fixed-weight and fixed-unit modes, and atomic redemption. | Screenshots are a point-in-time interface, not proof of executable depth, contract review, or the accuracy of NAV. The website was not accessible to the research browser for independent transaction and audit verification. |
| BASKET (`basketlaunch.fun`) | Its [protocol docs](https://basketlaunch.fun/docs) describe a fixed-recipe, up-to-six-coin SOL-pair reserve and one signed transaction per create/buy/sell. Its [transparency page](https://basketlaunch.fun/transparency) names a mainnet program and explicitly says no independent audit is published. | It is not a plug-in replacement for a Hall holding issuer-controlled stock-linked mints. Its SDK verifies a particular deployed BASKET program, not Seametry's program. |
| Blend (`blendy.fun`) | Its [own site](https://blendy.fun/) describes launching a coin against pools of tokenized stocks on Solana mainnet. | It explicitly says its launched coins do not represent ownership of the stocks in their pools; that is a different claim and exit mechanism from an in-kind Hall share. Its displayed activity is not independent verification. |
| Open-source vault examples | [SVS-8](https://github.com/solanabr/solana-vault-standard) is a multi-asset, oracle-weighted devnet vault. [QuickNode's managed-fund example](https://github.com/quicknode/solana-program-examples) is a teaching implementation; its own README says it is unaudited and not deployed to mainnet. | Borrow arithmetic tests, failure cases, and UI ideas, not production assurances or license to deploy copied code. |

One technical correction to the supplied comparison: 1,232 bytes is not a universal current ceiling. [Solana's v1 format](https://solana.com/docs/core/transactions/versioned-transactions) permits 4,096-byte transactions but removes address lookup tables. That may help atomic multi-leg execution, yet the exact wallet, route, account, compute and simulation constraints still have to be proven for each supported index.

The screenshots display 14 indexes and $321.85 protocol TVL, with the shown SOLB index at $6.09 TVL and two holders. These are unverified displayed values as captured on 11 October, not a current liquidity assessment. A user-facing mint/redeem path can work with in-kind assets without a deep share pool, but a liquid one-swap secondary market cannot be assumed from a catalogue or NAV.

## Product model we should explain

- **Fixed units:** a share represents specified constituent quantities. Their displayed *value weights* move when market prices move; no trade is required to restore a percentage. Seametry's Hall starts with exact quantities, then explicitly reconciles issuer mint/burn, donations, and deficits, so even “fixed units” requires a qualification.
- **Fixed weights:** a target percentage is maintained by an actual rebalance or by value-aware mint/redeem rules. This adds price-source, execution, governance, and timing risk. A pie chart of current values is not evidence of rebalancing.
- **In-kind Strike/Melt:** the Hall moves quantities without trusting NAV or an oracle. Wallet users need the constituents to Strike; Melting burns shares into per-leg claims, and a frozen leg can be delivered later.
- **USDC one-action buy/sell:** a separate router or liquid share pool must acquire/release constituents or trade existing shares. Quotes, slippage, fees, rent, signing and settlement are required. A displayed NAV is informational, not an executable bid. Without seeded share liquidity, the primary in-kind path may work while the secondary-market button cannot.

For the pitch, show one flagship index detail with the exact per-share quantities, current estimated value weights and their source/age, issuer powers, verified share mint and vaults, a clear primary in-kind action, and a separate one-action market action only when it can actually execute. The catalogue may foreground index trading; custom sponsorship belongs behind it.

## Differentiation worth defending

“A Solana basket” and “fixed units” are no longer differentiators. Seametry's defensible angle is an inspectable stock-linked Alloy: instrument admission and issuer-power disclosures, a quantity-only Hall, Melt claims that survive a constituent delivery block, an evidence trail, and a verified receipt. These are hypotheses until an external reviewer and live users can reproduce them. Present the actual edge as **honest treatment of tokenized-equity failure modes plus a usable one-share route**, not as a generic ETF or an oracle-free claim about market price.

The legal question is not closed by any incumbent. [SEC staff guidance](https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities) distinguishes tokenized securities structures and rights; [SEC Commissioner Peirce's statement](https://www.sec.gov/newsroom/speeches-statements/peirce-statement-tokenized-securities-070925) says tokenization does not change a security's nature. Which obligations apply to a Seametry share and its distribution requires counsel for the jurisdictions and issuer instruments involved.

## Mainnet readiness, checked in this repository

`chain/Anchor.toml` and `chain/programs/hall/src/lib.rs` name only the devnet/localnet Hall ID `GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE`; there is no mainnet program ID configured. The source has initialize, create, redeem, withdraw and sync instructions, and CI runs `cargo test --locked`. The repo has property/vector and issuer-power tests, but no independent audit report, mainnet deployment record, or Trident fuzz step in CI was found in this assessment. The PRD asks for fuzzing and a legal read before open mainnet deposits. Source and tests are not an audit, and a verified build is not an audit either ([Solana verified-build guidance](https://solana.com/docs/programs/verified-builds)).

The canary condition is not met by the current binary: `initialize_alloy` and `create` accept any signing wallet, and neither instruction enforces a raw-unit or share-supply ceiling. A first deposit funded with a small amount does not bound later deposits. A separate canary build must restrict entry wallets and mints and enforce per-leg raw-unit ceilings while keeping Melt, withdrawal, and reconciliation open. The exact wallets, mints, and ceilings remain operator choices; no mainnet program should be deployed before they are recorded and tested.

Before a public mainnet Hall: freeze the exact commit and binaries; commission an independent scope covering token extensions, issuer seizure/freeze, deposits, claims, supply and rounding, metadata, authority and upgrade transitions; fix findings and retest; obtain counsel's written product/distribution read; publish the report and verified build; run a bounded deployment/canary and independently check every vault/share invariant; only then enable public deposits and decide whether to finalize upgrade authority. A final upgrade-authority removal cannot be undone.

## Audit funding now

There is no verified offer of a free full audit on demand. [Areta's Solana Audit Subsidy FAQ](https://areta.market/faq) says awarded discounts are capped at 30% of a quote, not necessarily free. Submit the frozen scope there and ask Superteam/Colosseum for an introduction or sponsorship. Solana lists free static/attack-analysis tools and 45-minute consultations, but explicitly says these do not transfer security responsibility from the protocol ([Solana security program](https://solana.com/ar/news/solana-ecosystem-security)). Run these before and during procurement; do not market them as an independent audit.

## Before this evening

1. Demo the current devnet Hall end to end: sponsor a named Alloy, Strike from another wallet, Melt and withdraw, then show the Explorer's on-chain state. Rehearse the freeze/claim case and show the upgrade authority still exists on devnet.
2. Demo the *separate* mainnet direct-allocation path with a very small amount and a connected wallet. Show the resulting token in Holdings and a sell quote; do not claim it issued Alloy shares. Do not rely on a transaction that has not confirmed.
3. Prepare one flagship index page and a precise pitch: what the share holds, how exit works, what is live, and what is gated. Do not put a non-executable “Buy index” button in front of visitors.
4. Send the frozen program scope to Areta and a securities lawyer. Request review and funding; do not represent either as completed.

This is a credible pitch today. A public, audited, legally reviewed, liquid mainnet index market by this evening is not.
