# Seametry records what it does for each wallet

**Date:** 16 October 2026

## Decision

Record every quote, refusal, leg and submission Seametry handles, keyed by the
public wallet address, signed in or not, in Execution's `execution` schema in
the Oracle PostgreSQL. The Vercel routes that prepare and send legs report to
the Go Gateway over a service secret, after each response. A browser reports
the funnel steps only it can see through a Vercel route. A wallet's first
quote carries where the browser first arrived. An account that links a wallet
reads that wallet's rows.

## Why this changed

Until now execution records lived only in each visitor's browser
(`clients/web/src/lib/execution/store.ts`), and the submit route returned a
signature and kept nothing. The one record of volume, fees and wallets was the
fee account's public history, read by hand on 16 October: 44 transactions
since 11 October, 43 of them fee credits totalling 0.069144 USDC and one a
failed leg, all from one wallet. (First written as 44 credits; the failed
leg was miscounted as one, and recounted on 17 October.) That record also cannot see a
leg whose tip took the whole routing fee, since such a leg is sent without the
fee account. Storm asked for persistence and a go-to-market Admin built on it,
in a form where signing in adds utility rather than changing what is known.

## Choices made

- **The wallet is the subject.** Keying by account would make every
  signed-out trade invisible and make signing in a migration. Keying by
  wallet makes an account a grouping of wallets it has proved it controls.
- **Three sources, stored on every row.** `server` rows say what Seametry
  offered and sent. `client` rows are a browser's word and never count as
  volume, a fee or an outcome. Only `chain` rows, written by the reconciler
  that follows, say what settled.
- **Reports never block a trade.** Next.js `after()` sends each report once
  the response is out, with one retry. A lost report costs the record, not
  the trade, and a sent leg's outcome is still recoverable from chain.
- **First touch is sent with a first trade only.** No cookie, no page-view
  tracking of a visitor. Since 31 October 2026 (GTM milestone 1c), an entry
  to the site reports its landing page and referral code to an anonymous
  daily count in Growth, with nothing kept in the browser for it
  (`docs/SERVICE_CATALOG.md` section 3.13).

## Rejected

- **A database reachable from Vercel** (publishing the Oracle PostgreSQL port,
  or a second managed PostgreSQL such as Neon). Rejected for the reasons in
  `2026-10-09-account-authority-on-oracle.md`: a public database boundary, or a
  second owner for data the Gateway already serves.
- **Third-party product analytics.** It would send wallet addresses and
  browsing to another processor for less than this record holds, and could
  not distinguish what settled from what a browser claimed.
- **Recording visits per visitor.** Acquisition comes from first touch on a
  first trade; following a visitor, or keeping anything in the browser to
  count one, needs a consent decision for EU visitors and was deferred.

## Cost

Every prepare and submit request makes one more outbound call from Vercel,
off the response path. The Gateway gains three internal endpoints on the
public host, guarded only by the service secret, which must be set on both
deployments. The privacy policy changed in the same pull request. Funnel steps
are kept 24 months, an assumption Storm confirms with the Admin.
