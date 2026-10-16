# Activity record and the GTM Admin

Plan, 16 October 2026. Storm's decisions the same day: record trades and the
funnel; Admin opens by Google sign-in allowlist; backfill from the fee
account; remember the first-touch source on a wallet's first trade.

## Why

Nothing Seametry does is recorded by Seametry. Execution records live in each
visitor's browser (`clients/web/src/lib/execution/store.ts`), the submit route
returns a signature and forgets it, and the Go server's tables hold account
links, observations and receipts, no trades. The only record of volume, fees
and wallets is the fee account's public history on chain
(`J3obWpydMEgZpX2BoZvNBpZ4VKXceYVV8yuRDcEuXw8h`), read by hand on 16 October:
44 fee credits since 11 October, 0.069144 USDC, every one from a single
wallet. That record also misses a leg whose tip took the whole fee, because
such a leg is sent without the fee account.

## The shape

**The wallet is the subject, the account is a grouping.** Every record is keyed
by the public wallet address, signed in or not. When an account links a wallet
(`seametry_wallet_link`, owned by the account authority), the account's views
read that wallet's records. Signing in moves nothing and migrates nothing; it
adds cross-device history, saved plans and the Admin.

**Execution owns the record.** `SERVICE_CATALOG.md` section 3.6 already gives
Execution "submission; confirmation and finality tracking". The record lives
in the existing `execution` schema in the Oracle PostgreSQL, through the Go
Gateway. The Next.js routes on Vercel remain the place a trade is prepared and
sent; they report to Execution, and Execution confirms against the chain.

**Three trust levels, stored with every row.**

| Source | Written by | Trusted for |
|---|---|---|
| `server` | the Vercel routes that prepared or sent the leg, over a service secret | what was quoted, refused, approved and sent |
| `chain` | Execution's reconciler, or the backfill | what landed, failed or dropped, and what actually moved |
| `client` | the visitor's browser, through a Vercel route | funnel steps only the browser sees: wallet connected, review opened, declined in wallet |

A `client` row is never counted as volume, a fee or an outcome. Only `chain`
rows are. A `server` row says what Seametry offered and sent, and nothing about
what settled.

**Recording never blocks a trade.** Every report runs after the response, with
Next.js `after()`, with one retry. A Go outage loses the report, not the
trade; reports that fail are counted in Vercel logs, and the reconciler still
finds a sent leg's outcome from the chain once its signature is known.

## Data model (execution schema, migration 00002)

Amounts are integer atoms plus scale, never floating point (AGENTS.md). Token
amounts are `NUMERIC(20,0)` because a u64 exceeds `BIGINT`.

- `execution.wallet`: address (PK), network, `first_seen_at`, `first_source`
  (referrer host, landing path, utm_source, utm_medium, utm_campaign,
  utm_content, utm_term; each nullable and length-capped), `first_source_at`.
  First write wins; later sources are ignored.
- `execution.quote`: id (uuid), wallet, kind (buy, sell), subject (Allocation
  or basket name), template id, plan size, requested USDC atoms or token
  atoms, `prepared_at`, outcome (`prepared`, `refused`), refusal code and
  text, deployment (production or preview), source `server`.
- `execution.leg`: id, quote id, wallet, mint, symbol, direction, in atoms
  and scale, expected out, floor, quoted routing fee bps and atoms, tip offset
  bps, tip lamports, landing (sender, rpc), last valid block height, signature
  (unique, set when sent), `submitted_at`, submit result (`sent`,
  `refused_not_sent`, `uncertain`) with its refusal text; then, written only
  by the reconciler: chain outcome (`landed`, `failed`, `dropped`), slot,
  block time, chain error, network fee lamports, actual USDC and token deltas
  for the wallet, actual routing fee credited, `reconciled_at`, source.
- `execution.funnel_event`: id, wallet (nullable before connect), kind (closed
  set below, an unknown kind stored as `unrecognised` with the raw value, never
  dropped), quote id when there is one, `at`, source `client`.

Funnel kinds: `wallet_connected`, `review_opened`, `signature_requested`,
`signature_declined`, `signature_failed`, `sheet_abandoned`.

## Ingestion

- **Contract.** `contracts/openapi/openapi.yaml` gains `/internal/activity`
  (quote, leg-sent, funnel batches) under a `serviceSecret` security scheme, and
  `/admin/*` under the account token plus the admin check. The drift check
  (`node shared/tools/spec/generate.mjs --check`) covers both. They are
  excluded from the public API's published reference.
- **Server reports.** `prepare-batch` and `sell/prepare` report the quote and
  its legs, or the refusal with its code. `submit` reports the signature and
  submit result. `ACTIVITY_INGEST_SECRET` is set on Vercel and on the Go
  server; a missing secret disables reporting with one log line, never a
  failed trade.
- **Client reports.** A new route `/api/activity/funnel` accepts the closed set
  of kinds, rate-limited per IP, and forwards with the service secret. It
  attaches no cookie and stores no IP; the country gate's country code is
  already processed and is not stored.
- **Attribution.** On first page load the browser stores, in its own storage,
  the first-touch referrer host, landing path and UTM tags if none are stored.
  They are sent once, with the first quote for a wallet, and only then. A
  visitor who never trades sends nothing.

## Reconciliation and backfill

- **Reconciler**, a Go loop in the Gateway process: every 30 seconds, legs with
  a signature and no chain outcome go to `getSignatureStatuses` in batches of
  up to 256; a final status reads `getTransaction` once for the fee, error and
  the wallet's and fee account's token deltas. A leg past its last valid block
  height plus 20 with no status becomes `dropped`, the rule the browser watcher
  already uses (`DROP_MARGIN_BLOCKS`). Budget: one status call per 30 seconds
  plus one transaction read per settled leg, inside Helius Free's 10 requests a
  second.
- **Backfill**, a one-shot Go command (`server/cmd/activity-backfill`): reads
  the fee account's signatures since 11 October, and for each records a
  `chain` leg with its wallet, mint, direction and deltas, and a quote marked
  `imported`. Idempotent on signature. The 3 September deposit and withdrawal
  are not trades and are skipped by rule: a transaction without a Jupiter
  route instruction is not a leg.
- **Zero-fee legs.** Recorded through the server reports, so the gap in the
  chain-only record closes going forward.

## Admin

**Access.** The account authority's service token gains `email` and
`email_verified` claims (`server/auth/src/service-token.mjs`;
`internal/identity` verifies them). The Go Gateway admits `/admin/*` only for a
verified email in `ADMIN_EMAILS`. Everyone else gets 404, so the Admin's
existence is not advertised. The web Admin at `/admin` reads only through
these endpoints.

**Definitions** (owned by a new `docs/prd/ADMIN.md`, the one place these
words mean something):

- Volume: USDC notional of `landed` legs, chain-measured. A buy counts the USDC
  that left the wallet; a sale counts the USDC that arrived.
- Fee revenue: routing fee atoms credited to the fee account by `landed` legs.
  Tip cost: tip offset bps times notional, the fee forgone to cover tips.
- Wallet states: seen (first quote), activated (first landed leg), returning
  (landed legs on two or more UTC days), active in a period (a landed leg in
  it). Linked: has an account link.
- Funnel: quote requested, prepared, review opened, signed, sent, landed,
  per wallet and per quote, with each drop's recorded reason.
- Reliability: landed over sent, by landing path; failures by refusal code,
  chain error and venue.

**Views.** Overview (volume, fee revenue, tip cost, activated and active
wallets, conversion, each with its period and source); Funnel; Wallets (first
seen, source, trades, volume, fees, linked or not, exportable as CSV for
outreach); Baskets and instruments (what is bought and sold, published,
remixed or custom); Reliability; Sources (activated wallets and volume by
first-touch source). Every figure carries its source and age; the Admin is
held to the same provenance standard as the product. No recommendations are
printed (AGENTS.md, Language): it states conditions, the reader decides.

**Surface.** Built under the `seametry-design` skill with its build note; the
existing App shell, Figure, Tabs, List and Table components. No new visual
language.

## Signed-in utility (after the Admin)

Holdings and Activity read the server record for every wallet linked to the
signed-in account, merged with the browser's device-local records, so history
follows the person across devices. Signed out, nothing changes from today.

## Privacy

`/privacy-policy` changes in the same pull request as the first recording, not
after: execution and funnel records are kept for every wallet that uses
Seametry, signed in or not, keyed by the public wallet address; what each
record holds; first-touch source sent once with a first trade; no cookies for
it; retention (execution records kept as the trade history they are; funnel
events deleted after 24 months, an assumption stated here for Storm to
confirm); and that deleting an account unlinks its wallets but cannot remove
public chain history.

## Documents

- `docs/decisions/2026-10-16-activity-record.md`: why device-local only was
  reversed, the trust levels, and what was rejected (a Vercel-side database, a
  second managed Postgres, third-party analytics).
- `docs/SERVICE_CATALOG.md` 3.6 Execution: owns the activity record and the
  reconciler. 3.9: the token's email claims.
- `docs/prd/ADMIN.md`, new, owner of the Admin and its metric definitions;
  `docs/README.md` map row.

## Pull requests, in order

1. **Record.** Migration, contract, Go ingest handlers and tests (including the
   service secret refusal and the unknown funnel kind kept as
   `unrecognised`), Vercel reports in prepare, sell prepare and submit, the
   funnel route, attribution capture, privacy policy, decision record,
   catalog. Acceptance: a Playwright purchase and sale against fixtures
   produce the expected rows through a test Gateway; a trade succeeds with the
   Gateway down.
2. **Reconcile and backfill.** Reconciler with tests against recorded RPC
   answers, backfill command, run once against mainnet, and the job that
   deletes funnel steps older than 24 months, which the privacy policy states
   from PR 1. Acceptance: the
   backfill's totals equal the hand count of 16 October (44 credits, 69,144
   atoms) and its rerun adds nothing.
3. **Admin API.** Token claims, admin check, aggregate endpoints with tests
   for every definition above on a seeded database. Acceptance: a non-admin
   account gets 404; each metric reproduces from its seed by hand.
4. **Admin UI.** Build note, views, design lint, Playwright with fixture
   Gateway answers including empty, stale and unavailable states.
5. **Signed-in history.** Holdings and Activity merge server and device
   records for linked wallets.

Each pull request: `gofmt`, `go vet`, `go test ./server/...`, the spec and
receipt checks, the web suite, design lint, red checks for each new rule, CI
read from GitHub, merged only on Storm's word.

## Free tier

PostgreSQL on the existing Oracle host; no new provider. Vercel `after()` adds
no blocking time to a trade. Helius usage described under Reconciliation.
Jupiter is not called by any of this.

## Assumptions to confirm

- Funnel events kept 24 months; execution records kept as trade history.
- `ADMIN_EMAILS` holds Storm's Google email only, at first.
- Preview deployments report with `deployment = preview`, so the Admin
  separates them from production rather than mixing test trades into volume.
