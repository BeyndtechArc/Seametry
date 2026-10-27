# The GTM Admin

Owner of the Admin at `/admin` and of what each of its figures means. Where
another document uses one of these words for the Admin, it means what this
page says. Plan of record: `.plan/activity-record-and-admin.plan.md`.

## Who may open it

Signed in with Google, with an email Google verified, that the Gateway's
`SEAMETRY_ADMIN_EMAILS` names (comma separated, compared without case). The
decision is the Gateway's: the account authority's service token carries
`email` and `email_verified`, and `AdminGate` in
`server/internal/gateway/admin.go` admits `/v1/admin/*` only for that pair.
Everyone else, signed out included, gets the same 404 as a path that does not
exist, from the Gateway and from the web page, so the Admin's existence is not
advertised. An empty or unset allowlist admits no one.

The web page reads only through `/v1/admin/*`, on the server, with the
account token it exchanges for the visitor's session cookie. No token, figure
source or secret is sent to the browser, and the page adds no cookie, no
analytics and nothing collected from the visitor.

## Every figure

Each figure is read for a period, `[from, to)` in UTC, by default the 30 days
to now, at most 366 days, and for one deployment (`production` by default).
Preview and development trades are never mixed into production figures.
Amounts are USDC atoms at scale 6, never floating point.

Only rows the chain answered for count as money or an outcome. `server` rows
say what Seametry offered and sent; `client` rows are funnel steps a browser
reported, and are counted only in the funnel.

- **Volume.** The USDC a `landed` leg moved for its wallet, by its block
  time: what left the wallet on a buy, what arrived on a sale. A leg whose
  delta points the other way counts 0.
- **Fee revenue.** Routing fee atoms credited to the fee account by `landed`
  legs, as the reconciler or the backfill read them from the transaction.
- **Tip cost.** For each `landed` leg, its quoted tip offset bps of its
  volume, rounded down: the fee forgone to cover tips. A leg found only on
  chain carries no quoted tip offset and adds nothing.
- **Seen.** A wallet's first quote in the deployment falls in the period.
- **Seen and activated.** Of the wallets seen in the period, those with a
  landed leg by its end; conversion is this over seen, printed as the two
  counts.
- **Activated.** A wallet's first landed leg falls in the period.
- **Active.** A wallet has a landed leg in the period.
- **Returning.** A wallet has landed legs on two or more UTC days before the
  period's end.
- **Funnel.** Per quote Seametry prepared in the period: requested, prepared,
  refused, then the browser's review opened, signature requested, declined,
  failed and sheet abandoned (matched by quote id), then sent (a leg sent)
  and landed (a leg landed). Refusals are grouped by their HTTP status.
- **Reliability.** Legs sent in the period by landing path (sender, rpc, or
  unrecorded for a leg found only on chain): landed, failed, dropped, and
  unanswered, which means the reconciler has not yet written an answer.
- **Source.** The first-touch ref code a wallet's first quote carried, or
  `unknown` when none was kept. Sources show seen, activated and active
  wallets, volume and fee revenue per code.
- **Recent activity.** The 50 newest rows of the record before the period's
  end, each labelled `server`, `client` or `chain`. Only a `chain` row whose
  event is `landed` says something settled.
- **Email opt-ins.** Consents given in the period, live and withdrawn,
  counted by the page that asked and the ref code. The 20 newest live ones
  are listed with the address masked in the Gateway (`s***@g***.com`); no
  full address leaves the consent record.
- **Age.** Every view prints when the Gateway read it and when the
  reconciler last wrote a chain answer, so a stalled reconciler shows.

No recommendation is printed: the Admin states conditions and the reader
decides (AGENTS.md, Language).

## Not built

- Baskets and instruments view.
- Wallet CSV export for outreach, and the linked-or-not column, which needs
  the account authority's links and is not in the Gateway's record.
- Prospects import (the plan's later section).
