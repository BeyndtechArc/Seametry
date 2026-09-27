# One Next.js app, hosted on Vercel and Fly, paid for in x402 and USDC

**Decision record. Historical, append only, not a living document.**
Recorded 27 September 2026.

The living authorities are `../SERVICE_CATALOG.md` section 4 for hosting,
`../prd/API.md` for payment mechanics, `../prd/SITE.md` for the business
pages, and `../prd/EXPLORER.md` for the evidence layer's narrowed scope.

---

## Context

`decisions/2026-09-27-repository-layout.md` split the repository by runtime
and, in its D5, chose a hosting shape built entirely from services with no
free commercial allowance at the time: Oracle for the process (an account
Storm could not yet open), local Docker through Cloudflare Tunnel as the
interim, and Cloudflare Pages for a web client that did not exist yet. That
same review excluded Vercel Hobby and Fly.io by their general terms, without
checking what Storm's own accounts already have.

Since then, the Go static Explorer generator was found to have drifted from
the design system's own page templates, and to be showing content that is not
evidence: business positioning and an engineering status table that belongs to
the README, not to a page a stranger verifies a receipt on. Storm also pointed
out that the API, once built, makes the static build's reason for existing (no
server to compute figures) go away, and asked why the Explorer and Terminal
were not simply one Next.js app.

## Decisions

**D1. One Next.js app, `clients/web`, holds three areas: business pages, the
Explorer, and the Terminal.** Each gets its own layout and route group, so the
Explorer's chrome never carries marketing copy and the Terminal's carries
neither. Full information architecture and page-by-page composition are
`prd/SITE.md`'s and `prd/EXPLORER.md`'s to own; this record does not restate
them.

**D2. The Go static Explorer generator is retired once every page it renders
exists in the Next app.** Until then it becomes a publish step: it writes the
same figures as data conforming to the OpenAPI contract (`prd/API.md` section
3), rather than HTML, and the Next app renders from that data. When the API
exists, each page's data source switches from the published file to a live
call with no change of shape, since both follow the same contract.

**D3. The Explorer narrows to evidence only.** The catalogue, instrument
pages, published findings, the Hall demonstration, hallmarks, and
verification. What Business Content it carried (why an ETF, the moat, the
admission standard) moves to the business pages, and the engineering status
table it carried is deleted outright: the README already owns build status,
and a second copy of it inside the evidence layer is the same defect as two
documents disagreeing about anything else. `prd/EXPLORER.md` is edited to this
narrower scope directly, since a living document is edited, not layered.

**D4. The web app is hosted on Vercel, Hobby now, Pro at the first paid
feature.** This reverses D5's exclusion of Vercel Hobby in the earlier record.
Hobby's own terms have not changed: Vercel's fair use guidelines still
restrict it to "personal, non-commercial use," and Pro is 20 USD a month with
20 USD of included usage credit, both figures checked again on 27 September
2026. What changed is the basis for the decision. Storm has run commercial
work on Vercel Hobby before (`rugburn.io`) without enforcement, and reports
that Vercel's own review has moved toward reading a deployment's actual
content rather than only classifying accounts. Seametry takes no payment
today, so nothing about the app is commercial yet by Vercel's own definition,
which turns on processing payment or advertising a product for sale. The
trigger to move to Pro is fixed here and is not revisited case by case: the
first commit that ships a paid feature (x402 payment handling, per D6) is also
the commit that moves the project to Pro.

**D5. The Go process and Postgres are hosted on Fly.io, on Storm's existing
legacy plan allowance, until an Oracle account can be opened.** This
reverses D5's exclusion of Fly.io in the earlier record, which was checked
against Fly's terms for a new organization; Storm already holds an account
from before Fly stopped offering plans on 7 October 2024, and Fly continues to
honor that allowance for as long as the account is not converted to pay as you
go or has its payment method removed. Checked on Fly's own documentation, 27
September 2026, that allowance is up to three `shared-cpu-1x` machines at 256
MB of memory each, 3 GB of persistent volume storage in total, and 100 GB a
month of outbound transfer in North America and Europe. The shape: one machine
runs the Go process, a second runs PostgreSQL 18 on a volume within the 3 GB
total, a third is spare. Fly's Managed Postgres is excluded, as it was before:
its Basic plan is 38 USD a month plus 0.28 USD per GB, the same shape of cost
the repository has excluded since the reconciliation decision. Storm has
observed that invoices under 5 USD are waived on their account; Fly's current
documentation states no such policy, so this is recorded as Storm's own
observation of their account, not as a documented term to rely on generally.
Whether the account's legacy status survives indefinitely is not settled by
this record; if Fly changes how it treats these allowances, the fallback is
the same local Docker interim the previous record describes.

**D6. Payment is x402, settled in USDC on Solana, for both metered API calls
and subscriptions.** A caller with no valid entitlement gets an HTTP `402`
naming the price and the pay-to address, and retries with a signed transfer;
the gateway verifies it against a facilitator before serving the resource.
This is the same mechanism whether the payment covers one call, made by an
integrator or an agent with no account at all, or a subscription period,
recorded against a signed-in account as an entitlement with an expiry. The
exact mechanics, the resource shapes, and the Go module used to verify a
payment (`github.com/x402-foundation/x402/go`) are `prd/API.md`'s to own.

**Why this removes a constraint rather than adding one.** No card number is
ever collected, stored, or transits Seametry's servers under this scheme, so
Cloudflare's Self-Serve Subscription Agreement section 2.2.1(h), which forbids
processing or collecting payment card information on a property receiving its
free services, stops being a constraint on anything Seametry runs there, and
the PCI compliance scope that card handling would otherwise carry does not
apply at all.

## What this does not settle

Which provider takes payment for anything that is not x402 payable, if such a
thing arises. Which of Storm's domains carries the web app and the API,
tracked as open in `prd/API.md` section 14. Whether Fly's treatment of legacy
allowances changes. What real evidence opens the business pages' landing
hero, which `prd/SITE.md` leaves as an open question for Storm to answer
directly rather than guessing.
