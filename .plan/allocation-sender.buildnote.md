Surface:     Explorer (clients/web): Allocation purchases and Positions sales
Template:    Existing Order sheet and execution Activity
Question:    What does landing this purchase or sale cost, who bears it, and did it settle?
Sections:    Existing order terms, signature approval and persistent Activity; no new section.
Components:  Existing QuoteBlock fees, OrderSheet, Timeline, Toast and Activity.
Data:        PreparedLeg.landing, tipLamports, routingFeeBps (charged) and tipOffsetBps (taken off the tier); signed message, signature, expiry and block height remain the execution authority.
States:      Sender endpoint present: the holder's transaction carries the tip, the routing fee line names the lowered rate and the reduction, and a SOL line names the tip. No endpoint or an oversized route: paced RPC submission, with the lowered fee kept. Uncertain submission: watch the signature until a chain outcome, never claim not sent from an ambiguous receipt.
Ceremony:    Existing wallet signing only; one signature, no extra approval modal.
Names:       Allocation, Sell All, "Seametry routing fee, N%, M% lower to cover the landing tip", "Landing tip to Helius Sender".
Assumptions: Storm, 14 October 2026: the tip is paid inside the holder's own signed transaction and Seametry absorbs it by lowering the routing fee, with no Seametry wallet or key that could run dry unseen. The tip's worth comes from one Jupiter quote of 1 SOL in USDC, reused for a minute; Jupiter takes whole basis points, so the reduction rounds up and stops at zero fee. A sale's reduction is sized by one extra quote at the full tier, since its fee comes from USDC that is unknown until quoted. A route that falls back to the RPC after being quoted keeps the lowered fee rather than being quoted again. The plan preview before quoting still shows the tier, the ceiling. No typography, layout or theme changes.

## Verification, 14 October 2026

Commands run from clients/web unless the repository root is named.

- `npx playwright test --config=playwright.config.ts`: `210 passed (3.0m)`.
- `npx playwright test --config=playwright.sender.config.ts`: `13 passed`.
- `npx tsc --noEmit` and `npx eslint src tests`: exit 0, no output.
- Repository root `npm run design:lint`: `Design lint clean.`
- Live, read-only, against mainnet for the holder's wallet (nothing signed or
  sent): holder-tipped NVDAx buys at 0 and 4 basis points composed to 511 and
  544 bytes with one signer and simulated clean; a sale of the wallet's
  0.001076 MU at 19 and 0 basis points composed to 551 and 518 bytes and
  simulated clean. Jupiter quoted 1 SOL at 104110696 USDC atoms, a tip worth
  521 atoms.
- The first zero-fee probe failed with Jupiter's `platformFee must be greater
  than 0 when feeAccount is set`; the fee account is now left out of the swap
  request when the fee is zero.

Failure evidence before restoration (restored by edit, since the files carry
uncommitted work a checkout would erase):

- Rounding the reduction down: `Expected: 8`, `Received: 7`.
- Recognising a tip from any account, not only the fee payer: `Expected:
  false`, `Received: true`, on the non-holder case.

Limits: no live Sender submission or mainnet spending. CI not yet run for this
commit. RPC fallback pacing is per execution, not a shared global rate limiter.
