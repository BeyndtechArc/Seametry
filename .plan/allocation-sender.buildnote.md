Surface:     Explorer (clients/web): Allocation purchases and Positions sales
Template:    Existing Order sheet and execution Activity
Question:    Who pays for landing this purchase or sale, and did it settle?
Sections:    Existing order terms, signature approval and persistent Activity; no new section.
Components:  Existing QuoteBlock fees, OrderSheet, Timeline, Toast and Activity.
Data:        PreparedLeg.landing and tipLamports; signed message, signature, expiry and blockheight remain the execution authority.
States:      Sender supported: landing tip disclosed as paid by Seametry. Unconfigured, unfunded sponsor or oversized route: paced RPC submission. Uncertain submission: watch the existing signature until a chain outcome, never claim not sent from an ambiguous receipt.
Ceremony:    Existing wallet signing only; no extra approval modal.
Names:       Allocation, Sell All, Landing tip, paid by Seametry.
Assumptions: User approved Sender with tips absorbed from Seametry's existing routing-fee margin, without increasing that fee. The holder still pays Solana network fees, including the additional sponsor signature. The sponsor is a separate server-only wallet; it never holds user keys. No typography, layout or theme changes.

## Verification, 14 October 2026

Commands run from clients/web unless a repository-root command is named.

- `npx playwright test --config=playwright.config.ts --workers=4`:
  `210 passed (1.6m)`. This starts and tests a production Next build against
  offline fixtures, including purchases, sales, Sell All and RPC spacing.
- `npx playwright test --config=playwright.sender.config.ts --workers=2`:
  `14 passed (1.1s)`. No web server, browser or live network.
- `npx tsc --noEmit` and `npx eslint .`: both exit 0, no output. Full lint
  initially found generated `.source` adapters; they now join the existing
  generated-output ignores. No handwritten source or rule was suppressed.
- Repository root: `gofmt -l .` and `go vet ./server/...`: exit 0, no output.
  `go test ./server/...`: exit 0; tested packages report `ok`.
- `node shared/tools/spec/generate.mjs --check`: `self-checks passed: 17
  canonical accepts, 5 rejects, 11 trees, 45 inclusion proofs, 33 tree sizes,
  CVE-2012-2459 non-collision, 103 amount cases`.
- `node shared/tools/spec/verify-receipts.mjs`: `all 5 receipts verified by an
  implementation sharing no code with the one that sealed them`.
- `npm run design:lint`: `Design lint clean.`
- `npm run design:test`: `tests 11`, `pass 11`, `fail 0`.
- `npm run tokens`: `tokens.css: 121 variables per mode`; no generated diff.
- `npm run explorer`: exit 0, `46 instruments, 5 sealed receipts, 1124 mints
  surveyed`.
- `git diff --check`: exit 0, no output.

Failure evidence before restoration:

- The inherited tip-first mutation failed the tip-last assertion:
  `Expected: true`, `Received: false`.
- Sponsor-access and same-wallet tests each failed with `Received function
  did not throw`; an incorrect one-lamport tip was wrongly recognized.
  All three now pass.
- Deliberately counting one signature failed `Expected: 10000n`,
  `Received: 5000n`; forcing the wrong Sender mode failed `Expected: "true"`,
  `Received: "false"`.
- Deliberately marking an ambiguous receipt notSent failed
  `toBeUndefined(): Received: true`. The initial subset-match assertion was
  too weak; it was strengthened before confirming this failure.
- Every intentional mutation was restored with a targeted patch, not a
  checkout that would erase the inherited uncommitted implementation.

Limits: no live Sender submission, mainnet spending, physical mobile wallet
test, deployment or push performed. CI and Linux race detection were not run
for this local work. Database-backed role tests require the separately
configured Postgres test database; the local Go pass is not evidence of those
integration checks. Concurrency does not reserve the sponsor's tip balance;
fund and monitor the dedicated wallet. RPC fallback pacing is per execution,
not a shared global rate limiter. Unrelated image changes remain untouched.
