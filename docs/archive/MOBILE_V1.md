> **ARCHIVED, NOT BINDING.** Historical record only. Retired 23 September 2026.
> Replaced by `../prd/MOBILE.md`.
> Nothing in this file has authority over a living document. Do not build from it,
> do not cite it in a decision, and do not update it. See `../README.md`.

# Native Mobile V1

## Product standard

The mobile build must feel like a deliberate phone product. It uses native stacks, sheets, gestures, haptics, secure storage, deep links and push notifications. A browser view wrapped in a native shell does not satisfy V1.

## Navigation

Four primary destinations are sufficient:

1. **Today** — watched assets and factual state changes.
2. **Markets** — supported xStocks and current source/route availability.
3. **Activity** — preflights, pending transactions and receipts.
4. **Settings** — wallet, notification thresholds, currency display, sources and legal availability.

The trade action lives inside an asset, not as a permanent fifth tab.

## Core screens

### 1. First run

- Explain Seametry in one sentence.
- Select jurisdiction/confirm eligibility before execution features appear.
- Choose one or more assets to watch.
- Request notifications only after the user creates their first alert.
- Wallet connection is optional until execution.

### 2. Today

Today is the retention surface. Each card names an observed change:

- `Market session changed`
- `Corporate action scheduled`
- `Issuer halt changed`
- `Reference source unavailable`
- `Venue spread crossed your 1.0% threshold`
- `Your quote depth changed`
- `Transaction settled`

Cards include source, timestamp and affected instrument. They do not use urgency language such as “opportunity,” “act now,” or “don’t miss.”

### 3. Asset lens

The asset header shows symbol, issuer, mint verification and current session. Three compact layers follow:

1. **Instrument** — what the token is and which rights it carries.
2. **Observations** — xStocks, Chainlink and Stork values with timestamps and verification.
3. **Execution** — the live Jupiter route for the user's entered size.

The default visualization is a vertical range with individually labelled source marks and a separate executable mark. Connecting lines show measurement distance without implying a consensus price.

### 4. Trade ticket

- Buy/sell direction chosen by user.
- Exact input amount.
- Expected and minimum output.
- Route venues and splits.
- Price impact and fee lines.
- Quote countdown.
- Active preflight state.

The primary button reads `Review transaction`, not `Buy now`.

### 5. Approval sheet

The sheet freezes the proposed conditions. Any re-quote that changes output, route, fees, reason codes or minimum beyond the displayed tolerance invalidates the approval.

The user acknowledges material warnings individually, then taps `Open wallet to sign`.

### 6. Wallet handoff

V1 uses Phantom mobile deep links as the first implemented adapter. Seametry creates an encrypted wallet session, sends the transaction for signing, and returns through a custom application URI. Cancellation returns to the unchanged approval state with no transaction claim.

### 7. Receipt

The receipt leads with:

- settled status;
- spent and received amounts;
- approved minimum versus actual result;
- total fees;
- signature and explorer link.

The context snapshot and reason codes remain expandable. Users can export the receipt as JSON.

### 8. Replay

The UNHx case is available offline inside the native app. A timeline scrubber shows how issuer, multiplier, oracle, interface and executable-route states changed around the dividend boundary. Replay mode is visually marked and has no trade action.

## Retention without manufactured FOMO

V1 retention comes from utility:

- local watchlist;
- user-defined divergence threshold;
- corporate-action and market-session calendar;
- factual native alerts;
- saved preflight history;
- settlement receipts;
- quick re-entry from notification to the relevant asset state;
- visible source-health history.

No streaks, leaderboards, rewards, fake scarcity, default high-frequency notifications or personalized trade prompts are included.

## Notification rules

The user must opt into each class. Notifications deduplicate by instrument, reason code and state version. A quiet period suppresses repeated alerts until the state materially changes.

Examples:

- `UNHx issuer state changed to halted · xStocks · 00:02 UTC`
- `SPYx executable/reference distance crossed your 1.0% threshold · 14:31 UTC`
- `Your USDC → SPYx transaction settled above the approved minimum`

## Offline and degraded behavior

- Watchlist, last context, receipts and replay remain readable offline.
- All cached live values show their original timestamp and `offline` state.
- Quote and execution actions are disabled without a fresh gateway response.
- A missing Chainlink or Stork observation remains visible as unavailable; it is never replaced by the other provider under the missing source's label.

## Distribution

- Android: signed installable APK through the public builds page and repository release.
- iOS: development build or TestFlight when certificates and review timing allow; video and simulator proof remain available.
- QR code on the web console opens the correct build/install route.
- Every build displays commit SHA, environment and schema version in Settings.

## Mobile acceptance criteria

- Cold launch to Today in under three seconds on the demo device after initial data cache.
- One-handed path from notification to asset state.
- Wallet cancellation and return work reliably.
- Background/foreground transitions do not preserve an expired quote as executable.
- Text remains readable at increased system font size.
- Status is never communicated by color alone.
- Reduced-motion setting removes nonessential movement.

