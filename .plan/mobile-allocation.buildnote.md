Surface:     Mobile (Expo, iOS and Android), the Allocation; and GET /api/allocation/offer on the web app, which it reads
Template:    the web Allocation's stepped flow (Choose, then Buy), in native components
Question:    Which admitted stocks go in this basket, how much, and is each purchase the one I mean to sign?
Sections:    Step track (Choose, Buy); Choose: search and the admitted lots, each with its Mark line; Buy: the amount
             and its split, the order summary, each purchase to preview and sign; a step bar pinned to the bottom
Components:  native counterparts of Step track, StepBar, Mark line, Lot mark, Field, Key, Quiet action, Route action,
             drawn from the same generated tokens (clients/packages/ui/src/generated/tokens.ts)
Data:        GET https://www.seametry.xyz/api/allocation/offer (the lots, stamps, fee schedule, slippage and whether
             this request may buy, built by the same function as the web page); POST /api/allocation/prepare,
             /submit and GET /status for each leg, unchanged; the wallet from Phantom Connect
States:      offer loading (a rule and a sentence naming what is loading), unavailable (the server's reason),
             error (what failed and that nothing was bought); per leg the web flow's phases; signed out (sign-in
             unavailable without a Phantom app id, said in words)
Ceremony:    none in this slice
Names:       Choose, Buy; Set amount; Preview purchase; Approve and sign; Back
Assumptions: Storm, 7 October 2026: both platforms, iOS tested first, Allocation first, consumer-grade.
             clients/mobile is its own npm project, outside the workspace: Expo 57 pins React 19.2.3 and the web app
             runs 19.3.0, and one workspace would let the app resolve the web app's React.
             Phantom Connect needs an App ID from Phantom Portal, which only Storm can register; until it is set,
             signing is unavailable and the app says so rather than pretending.
             Signing uses the wallet's signTransaction and Seametry's /submit, as the web app does, so the server
             still refuses any transaction other than the one it simulated.
