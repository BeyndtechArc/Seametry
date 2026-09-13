# Seametry: Product, Business and Hackathon Master Brief

**Decision date:** 12 September 2026  
**Hackathon:** Stocklana  
**Submission deadline:** 18 September 2026, 4:00 PM ET / 9:00 PM WAT  
**Early submission target:** 16 September 2026  
**Demo and polish day:** 17 September 2026

## Product decision

Build Seametry as a native mobile application that helps a self-custodial user understand and execute a tokenized-stock trade on Solana.

> Seametry reveals the seam between the instrument, its external market observations, and the liquidity that can execute right now.

V1 has three inseparable parts:

1. A native mobile experience designed for repeat use.
2. A deterministic preflight engine that turns attributed facts into `ALLOW`, `WARN`, or `BLOCK` with reason codes.
3. A public web proof console where judges can reproduce evidence, inspect live status, and access builds.

Seametry is not positioned as an oracle, exchange, issuer, broker, or universal price authority. It is the decision surface immediately before a user-authorized transaction.

## Problem

A familiar stock symbol can hide several different states:

- the token provides economic exposure but may not confer direct share ownership or voting rights;
- the underlying market can be closed while secondary token liquidity trades continuously;
- a corporate action can change the token's scaled economic quantity;
- issuer issuance or redemption can be paused while a permissionless pool remains routable;
- independent market-data providers can publish different values, timestamps, sessions, and methodologies;
- two pools can offer materially different output for the same trade size;
- a reference observation can be current but non-executable;
- an executable route can be live but thin, expensive, or about to expire.

The job is therefore:

> Before I sign, identify the instrument, show the current source states, tell me what my chosen amount can execute for, and enforce the minimum I approved.

## Target user

The first user is a non-restricted, self-custodial Solana user who already holds USDC or an xStock and checks positions from a phone.

They return because watched instruments change state: market sessions open and close, reference sources age, corporate actions approach, routes gain or lose depth, and their own transactions settle. Seametry turns those changes into factual, user-configured alerts and a fast path back to preflight.

## Product loop

1. **Watch:** Select an instrument and optional factual alert thresholds.
2. **Notice:** Receive a native notification when a public state changes.
3. **Inspect:** Open a synchronized issuer, oracle and execution view.
4. **Preflight:** Enter an amount and see a fresh size-specific route.
5. **Approve:** Confirm the exact instrument, route, fees, minimum output and active warnings.
6. **Sign:** Hand the transaction to the user's wallet.
7. **Verify:** Return to a receipt comparing approved conditions with settlement.
8. **Revisit:** Keep the receipt and continue monitoring the instrument.

Alerts remain factual. The user chooses the asset and thresholds. Seametry does not rank opportunities for an individual or tell them to buy, sell, hedge, or hold.

## What the user sees

### Instrument identity

- issuer and token symbol;
- mint and network;
- legal form and rights summary;
- Token-2022 multiplier and any forward multiplier;
- corporate-action state;
- issuance/redemption and restriction context;
- reserve observation with source and timestamp.

### Market observations

- xStocks issuer reference when available;
- Chainlink Data Streams RWA/equity report when supported;
- Stork signed observation when supported;
- value, timestamp, age, session/market status, verification state and methodology label for every source;
- pairwise divergence as a measurement, never a verdict about truth.

### Executable route

- input and output mints;
- trade size;
- expected output;
- minimum output;
- slippage tolerance;
- price impact;
- route venues, AMM addresses and split;
- network, priority, venue and optional integrator fees;
- quote expiry;
- simulation result.

## Product states

`BLOCK` is reserved for a concrete invalid or unenforceable transaction:

- mint or network mismatch;
- issuer halt that the published integration contract says applies to trading;
- active multiplier discontinuity where the integration guidance requires trading to stop;
- no route;
- expired quote;
- failed simulation;
- inability to enforce the displayed minimum output;
- malformed or unverifiable transaction instructions.

`WARN` communicates material context while leaving the user in control:

- underlying market closed;
- one reference source unavailable or old;
- source disagreement beyond a displayed threshold;
- limited issuance/redemption;
- elevated price impact;
- thin or single-venue route;
- reserve data old or defined differently;
- upcoming public corporate action outside the blocking window.

`ALLOW` means the deterministic checks passed. It does not mean the trade is profitable, appropriate, legally available everywhere, or free of market risk.

## V1 asset scope

Support one excellent USDC ↔ xStock path. Choose it through a coverage probe:

1. confirmed xStocks metadata and current multiplier;
2. matching Chainlink equity/RWA stream;
3. matching Stork asset ID;
4. live Jupiter Metis route;
5. sufficient depth for a very small demonstration trade.

UNHx remains the historical discontinuity replay even if another asset becomes the live execution path. SPYx remains the normal control candidate. Exact oracle stream IDs must come from provider discovery and must not be invented.

## Native mobile requirement

V1 is an Expo/React Native development build, not a responsive site packaged as an app. It uses native navigation, secure local storage, app links, wallet handoff and push notifications. The Android install artifact is mandatory for judge access. An iOS simulator or TestFlight build is produced when signing access permits.

The judge-facing web console remains necessary because installation friction should not hide the evidence. It is a companion surface with replay, status, receipt and download links; it is not the main product.

## Business shape

The first business is a consumer execution companion for tokenized assets. Its recurring value comes from state monitoring and repeat transaction preflight, not a one-time warning screen.

Potential revenue after the experiment:

1. A clearly disclosed integrator fee on user-directed swaps where permitted.
2. A subscription for multi-asset alerts, longer history, cross-venue replay and professional exports.
3. A paid SDK/API for wallets, tokenized-asset venues and issuers that need normalized preflight and receipt evidence.

Instrument identity, source timestamps, fee disclosure and transaction minimums remain available without a subscription. The hackathon build charges no Seametry fee.

## Defensibility hypothesis

The interface can be copied. The potentially compounding asset is the normalized history:

`instrument state → issuer state → oracle observations → executable routes → user-approved bounds → settlement`

This can improve source health scoring, route-quality history, incident replay and integration testing. It is a hypothesis until real usage produces repeated observations and transactions.

## Hackathon proof

The submission must prove:

- the reproduced gap is real and precisely stated;
- the mobile flow works end to end;
- the source comparison is attributed and timestamped;
- the user explicitly approves every transaction;
- the minimum output is enforced;
- one transaction settles on Solana;
- the public repository lets a judge distinguish live, fixture-backed and planned behavior.

## Naming note

Seametry is the selected working product name. Formal trademark, domain and app-store clearance remain a post-hackathon company task; known unrelated design/hospitality uses should be assessed before commercial launch.

