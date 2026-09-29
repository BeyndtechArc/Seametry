Surface:     Terminal
Template:    Alloy, from references/patterns.md.
Question:    What backs Alloy No. 1 now, what evidence is missing, and why can
             a strike not yet be prepared from this surface?
Sections:    Workbench rail (where am I and which mode is active); Lot header
             (which alloy and which Hall); valuation boundary (which market
             observations exist); Formula ledger (what backs each share);
             Condition report (which issuer powers affect delivery);
             Provenance line (through whose hands the claim passes); action
             rail (what becomes available when execution is connected).
Components:  Theme control, Figure, Stamp, Grade, Digest, Key, Rule,
             Provenance line, Condition report and Formula ledger. Formula
             ledger is added to components.md before implementation.
Data:        Labelled fixture projection from shared/evidence/hall-demo/
             transcript-devnet.json. Supply, locked genesis shares, program
             ID, constituent ledgers and transaction signatures come from the
             recorded devnet run. The recording entered the repository in
             commit 559c6984c80dfa6f4f66d09076b8f30524fd5755 at
             2026-09-28T20:58:13+01:00. NAV and share price remain absent,
             matching docs/prd/TERMINAL.md and the API contract.
States:      default: the recorded founding state. unavailable: NAV, share
             price, whole-alloy Good Delivery and execution state their missing
             producers. loading, empty, stale and error remain reachable in the
             Pattern Register because this static fixture performs no request.
Ceremony:    none. No transaction is prepared, signed or simulated here.
Names:       Terminal, Workbench, Alloy No. 1, STORM, Formula, Condition,
             Provenance, Strike, The Hall and The Key follow the register.
Assumptions: 1. The route is /terminal/alloys/storm until an alloy address can
             be read through a live gateway handler.
             2. Mock stocks A and B stay named as mock constituents. No real
             issuer identity is inferred from the Token-2022 extension set.
             3. The one Key is disabled. Its tray establishes the action's
             place without implying that execution or wallet signing exists.
             4. The formula amounts stay as integer atoms plus scale. The page
             computes no NAV, weight, quote or execution plan.
             5. The unrelated deletion of the repository-root CLAUDE.md is
             preserved and not included in this work.
