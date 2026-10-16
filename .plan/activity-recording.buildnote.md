Surface:     Explorer (clients/web): Allocation purchases, Holdings sales, the site wallet provider, the privacy policy
Template:    Existing Order sheet, Holdings, Paper (privacy policy); no layout change
Question:    What did Seametry quote, refuse and send for this wallet, and where did the holder stop?
Sections:    No new section. The privacy policy gains section 03, what is recorded when you trade, and renumbers the rest.
Components:  None added or changed. Reports leave from the routes and from lib/funnel.ts and lib/first-touch.ts, which render nothing.
Data:        Execution's activity record through the Gateway's /v1/internal/activity endpoints: quotes, legs, submissions and funnel steps by wallet. The prepare routes return quoteId on every leg so funnel steps can name their quote.
States:      Recording is invisible to the holder in every state. A Gateway that is down, refuses, or is unconfigured costs the record and never the trade: each report leaves after the response and is dropped with a log line after one retry.
Ceremony:    None. The wallet signature remains the only ceremony.
Names:       Privacy policy wording: "Trades through Seametry are recorded by wallet." Funnel kinds are code names, never shown.
Assumptions: Storm, 16 October 2026: record trades and the funnel, keep first touch on a first trade, backfill from chain later. Funnel steps are deleted after 24 months, stated in the policy; the deletion job is built with the reconciler. Only mainnet pages report wallet_connected, so the devnet Hall demo stays out of the record. The unused single-leg /api/allocation/prepare route is not instrumented; nothing calls it.
