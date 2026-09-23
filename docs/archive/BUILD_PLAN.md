> **ARCHIVED, NOT BINDING.** Historical record only. Retired 23 September 2026.
> Replaced by `../PRODUCT_ARCHITECTURE.md` section 9, Phasing. Its dates are past.
> Nothing in this file has authority over a living document. Do not build from it,
> do not cite it in a decision, and do not update it. See `../README.md`.

# Build Plan: 12–18 September 2026

## Critical path

The build succeeds when a judge can install the app, inspect a real synchronized context, approve a valid transaction, sign in a wallet, return to Seametry, and verify settlement. Everything else ranks below that path.

## 12 September — Contract and repository

- Create monorepo and public README.
- Commit canonical domain types and runtime schemas.
- Capture the existing UNHx evidence as immutable fixtures with checksums.
- Implement the pure preflight function against fixtures.
- Scaffold Expo native app, API and public proof console.
- Add source status contract: `live`, `fixture`, `unavailable`, `planned`.
- Exit: UNHx replay produces deterministic reason codes in tests and renders in the native app.

## 13 September — Source coverage and mobile shell

- Probe exact xStocks, Chainlink and Stork identifiers for SPYx, NVDAx, AAPLx and UNHx.
- Select the live asset based on verified overlap and Jupiter route depth.
- Implement xStocks adapter.
- Implement Chainlink discovery/fetch/decode/verification path.
- Implement Stork REST/WebSocket/verification path.
- Build Today, Markets and Asset Lens native screens.
- Implement local watchlist and cached context.
- Exit: the phone displays attributed live observations from all available required sources and names any unsupported feed precisely.

## 14 September — Executable route and native alerts

- Integrate Jupiter Metis `/build`.
- Render route venues, expected output, minimum output, impact, fees and expiry.
- Add per-venue quote probes where liquidity exists.
- Implement source-state and user-threshold notification rules.
- Add public live context and UNHx replay pages.
- Exit: a judge can enter an amount on the phone and understand a real, unsigned transaction.

## 15 September — Wallet and settlement

- Implement Phantom encrypted deep-link connection and transaction signing.
- Requote immediately before approval and again before wallet handoff.
- Simulate transaction and enforce minimum output.
- Submit one very small mainnet transaction.
- Build local and redacted public receipts.
- Test cancellation, expiry, backgrounding and failed wallet return.
- Exit: one complete phone → wallet → phone → receipt path works on a physical device.

## 16 September — Early submission candidate

- Produce signed Android install build.
- Produce iOS development/TestFlight build if credentials permit.
- Deploy the public proof console and API.
- Add commit SHA, environment and schema version to every surface.
- Complete README, claims, limitations, architecture and source attribution.
- Record a clean backup demo.
- Tag `hackathon-submission-rc1` and submit early.
- Exit: repository, public URL, install artifact and video are valid submission links.

## 17 September — Demo and polish

- Freeze architecture and source contracts.
- Improve native hierarchy, motion, haptics and loading/failure states.
- Test on at least one real Android device and one iOS simulator/device.
- Rehearse the 90-second judge path.
- Record final product video and short technical walkthrough.
- Update the submission links and description.
- Exit: final candidate is tagged and all evidence is public.

## 18 September — Buffer

- Smoke-test links, APK download, replay and read-only live context.
- Execute only an emergency fix that protects the submitted path.
- Freeze by 12:00 PM ET / 5:00 PM WAT.

## Workstream priorities

| Priority | Workstream | Required proof |
| --- | --- | --- |
| P0 | Domain/preflight | deterministic fixture tests |
| P0 | Native flow | physical-device recording |
| P0 | Wallet execution | mainnet signature and receipt |
| P0 | xStocks + Chainlink + Stork adapters | raw captured response and verification state |
| P0 | Jupiter + Solana | route plan, minimum output and settlement |
| P1 | Public proof console | live URL and replay |
| P1 | Native alerts | one real push/local notification flow |
| P1 | Android distribution | installable signed build |
| P2 | Multiple assets | only after first path works |
| P2 | Venue history charts | only after current quote is reliable |
| P3 | Social discussion | post-hackathon |

## Scope cuts if time slips

Cut in this order:

1. Additional assets.
2. Historical venue charts.
3. Multiple wallet adapters.
4. Remote receipt accounts.
5. Advanced animation.
6. iOS distribution beyond simulator/video if signing blocks it.

Preserve the native app, three-source context, deterministic preflight, wallet approval, settlement receipt and public evidence surface.

## Proof gates

- **Coverage gate:** exact source identifiers confirmed.
- **Context gate:** live envelope validates and renders.
- **Execution gate:** fresh Metis route simulates.
- **Wallet gate:** cancel and sign both return correctly.
- **Settlement gate:** receipt matches chain deltas.
- **Distribution gate:** clean device installs the submitted artifact.
- **Judge gate:** a new viewer understands the pain and proof within 90 seconds.

