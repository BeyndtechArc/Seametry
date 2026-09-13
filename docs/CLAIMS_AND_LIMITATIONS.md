# Claims and Limitations

## Claims supported by reproduced evidence

- A permissionless Solana route can remain executable while an xStocks asset-level halt is active.
- At least one Jupiter-mediated UNHx transaction settled during the reproduced 12 September 2026 state split.
- Public interfaces can display raw and multiplier-adjusted Token-2022 supply differently.
- Routability alone does not communicate issuer state, corporate-action context or instrument rights.
- A size-specific executable quote and a market reference observation are different objects.

## Claims Seametry does not make

- Every weekend tokenized-stock trade is mispriced.
- Every oracle disagreement is an arbitrage opportunity.
- The issuer observation is always the economically correct executable price.
- Chainlink or Stork represents universal truth.
- Jupiter, Phantom, Solscan or a DEX violated a specification in the reproduced case.
- The observed user necessarily suffered a loss.
- An issuer halt automatically makes permissionless secondary trading illegal.
- Non-custodial wallet connection eliminates securities, solicitation, routing, distribution or adviser obligations.
- An `ALLOW` result means safe, profitable, suitable or legally available to every user.

## Known unresolved questions

1. Confirm directly with xStocks whether the top-level halt flag is intended to stop all integrator secondary-market execution or a narrower issuer/RFQ path.
2. Confirm exact overlapping xStocks, Chainlink and Stork coverage for the live demo asset.
3. Determine whether connected-wallet flows on major interfaces show warnings that were absent from public pre-login surfaces.
4. Measure source divergence with synchronized timestamps before claiming magnitude.
5. Separate reserve definitions from wallet/explorer circulating-supply definitions before describing any discrepancy.
6. Obtain jurisdiction-specific advice before charging execution fees or broadly distributing the trading feature.

## Availability

Seametry must respect issuer restrictions and must not imply that tokenized stocks are available in every jurisdiction. Eligibility gating is a product control, not a legal conclusion.

## Oracle limits

- A cryptographically verified report proves origin and integrity under the provider's network; it does not prove that the methodology fits every use.
- A source can be honest and still be stale, session-limited or based on a different market.
- Provider support can change.
- Offchain verification in the gateway is weaker than atomic verification inside an onchain transaction and is described accordingly.
- If a feed is unavailable, Seametry exposes the absence rather than substituting another source under its name.

## Execution limits

- A route is valid only for its amount, direction, mints and expiry.
- Slippage limits control minimum output; they do not eliminate price movement, failed landing or adverse selection.
- Simulation cannot guarantee landing.
- Network priority fees and account-creation rent can change.
- Permissionless liquidity can be thin or manipulated.

## Mobile limits

- Android is the guaranteed install target for the hackathon.
- iOS device distribution depends on signing and TestFlight access; the native iOS implementation can still be demonstrated through simulator/device recording.
- Push delivery is not guaranteed by the operating system, so critical state is refreshed whenever the app opens.
- Cached values are informational and cannot authorize execution.

## Status vocabulary

- `Live`: fetched from the named source during the current session.
- `Fixture-backed`: immutable captured evidence replayed locally.
- `Unavailable`: the adapter ran but the provider did not return a valid supported observation.
- `Planned`: code or integration is not present and cannot be shown as working.

