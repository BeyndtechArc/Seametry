Surface:     Web app (clients/web): the product moves into an App shell at
             /app; the public site keeps only reading pages.
Template:    new: App shell (components.md), justified by a tester's report
             that the product read as marketing pages: six destinations in
             one public rail, a "Public" tag doing a nav's job, and product
             screens opening with paragraphs. Studied as cases, not copied:
             Langfuse's app layout (MIT outside ee/; one route list driving
             the sidebar, one page wrapper with a sticky header, an
             environment badge, a thin mobile top bar). Unkey's app code is
             AGPLv3 and Directus's is source-available under MSCL-1.0, so
             nothing from either is copied.
Question:    Where am I in the product, on which network, and what can I
             do here?
Sections:    Sidebar groups, each answering one question:
               Desk     /app                    what is here, and its state
               Buy      /app/allocation         what may I buy into my wallet
               Hall     /app/alloys/storm       Alloy No. 1, STORM
                        /app/alloys             every Alloy the Hall holds
                        /app/hall               watch the melt survive a freeze
               Assay    /app/instruments        which instruments pass, and why
             Reading pages last: How it works, The Key.
             Narrow: the same groups as a bottom tab bar (Desk, Buy, Hall,
             Assay), Hall opening Alloy No. 1.
Components:  App shell, Page header, Network badge, Brand mark (contracts
             added to components.md first); Wallet state and Mode control in
             the top bar; existing page bodies unchanged in logic.
Data:        unchanged per page. The Desk reads only what already exists:
             the admissions snapshot, the STORM fixture (labelled), the Hall
             program id.
States:      shell: current route; narrow; wallet disconnected, connected.
             Pages keep their own six states as built.
Ceremony:    None.
Names:       Desk, Buy (group), Allocation, Hall, Alloy No. 1, STORM,
             Alloys, Demonstration, Assay, Instruments; "Open app" on the
             public rail. Network badges: Mainnet, Devnet, Mainnet evidence.
Assumptions: 1. Old URLs (/allocation, /hall-demo, /terminal/...) redirect
             with 307, not 308: the layout is days old and may move again,
             and a permanent redirect is cached by browsers for good.
             2. No logo file exists in the repository; the Brand mark shows a
             neutral placeholder and is the one place the real mark goes.
             3. Light is the default mode, by Storm's decision on 30
             September 2026, replacing "dark is the default"; dark stays
             complete and selectable, and a stored choice is honoured.
             4. /sign-in stays a public reading page (nothing to sign in to
             yet), linking into the app.
