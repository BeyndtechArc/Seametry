Surface:     Web, /admin (business pages shell, not the Terminal)
Template:    Paper article from the business pages (site.module.css paper and storyHero), with ledger tables as in Compose; "new" only in that it stacks several ledgers under section headers
Question:    What did Seametry's record say happened in this period, and whose word is each figure?
Sections:    1 Header: the period, the deployment, when the Gateway was read and when the reconciler last wrote a chain answer.
             2 Range: from, to inclusive, deployment; a plain GET form, no script.
             3 Overview: what moved and who traded (volume, fee revenue, tip cost, landed legs as Figures; wallet states as a ledger with whose word).
             4 Funnel: how far each quote went, each step labelled Seametry sent, Browser reported or Chain answered; refusals by status.
             5 Reliability: what happened to sent legs by landing path.
             6 Sources: which first-touch ref code brought the wallets that traded, unknown for none.
             7 Wallets: the 200 most recently seen, all-time totals.
             8 Recent activity: newest rows, each with whose word it is; only a chain row says settled.
             9 Email opt-ins: counts by page and ref code, kept or withdrawn; newest kept addresses masked by the Gateway.
Components:  Figure (packages/ui) for the four money and leg figures; native table ledgers, the Compose ledger's rules copied into admin.module.css; native date and select inputs styled with tokens. No new shared component.
Data:        GET /v1/admin/overview, sources, wallets, activity, email-optins (contracts/openapi/openapi.yaml, admin tag), read on the server with the account token. Amounts are USDC atoms at scale 6 via formatAmount. Playwright data is fixture data from tests/terminal-api-fixture.mjs.
States:      default, every section read.
             loading: none shown; the page renders on the server after its reads.
             empty: each section says what is absent in a sentence.
             stale: the header names the age of the newest chain answer, and "has not written a chain answer yet" when none; nothing is called stale by a threshold, because a quiet period writes no answers.
             unavailable: a section the Gateway could not answer says so with the status and that nothing from it is shown.
             error: the Gateway refusing the range says so and reads the default 30 days.
             not admitted (signed out, not allowlisted, unverified, Gateway unreachable before admission): the site's own 404, the same as any missing route.
Ceremony:    none
Names:       Admin, Seametry's record, Volume, Fee revenue, Tip cost, Landed legs, Seen, Activated, Active, Returning, Funnel, Reliability, Sources, Ref code, Wallets, Recent activity, Email opt-ins; whose word: Seametry sent, Browser reported, Chain answered.
Assumptions: The business pages shell is used rather than the Terminal's App shell, because the App shell carries the wallet providers and the Admin needs none. Wallet addresses are public chain data and are shortened only for width, full in the title. No CSV export, linked column or Baskets view in this pass (docs/prd/ADMIN.md, Not built). The page exports no metadata so the 404 a non-admin sees carries no title naming it.
