Surface:     Terminal
Template:    Alloy, adapted from the Explorer Alloy template into the existing Terminal workbench
Question:    Which Alloys are live in the Hall, and what would one stated share quantity require or return now?
Sections:    Hall register: which Alloys exist; Alloy plate: which exact on-chain account is open; Hall ledger: what each leg holds and owes; Strike and Melt terms: what the Gateway calculates for the stated share quantity; execution boundary: what remains unavailable
Components:  TerminalFrame, Digest, Figure, Stamp, Rule, RouteAction, TextAction, Key
Data:        GET /v1/alloys; GET /v1/alloys/{address}; GET /v1/alloys/{address}/strike-cost?shares=1000; GET /v1/alloys/{address}/melt-proceeds?shares=1000 through server-side Terminal proxies
States:      loading names the Hall read; empty links back to the devnet demonstration; stale and partial retain values with API completeness attached; unavailable and error preserve the Gateway problem and offer the public Hall record; default shows source, time and cluster on every figure group
Ceremony:    None. Execution remains disabled until a transaction plan exists.
Names:       Seametry, Terminal, Hall, Alloy, Strike, Melt, Claim, The Key
Assumptions: The Terminal identifies live Alloys by their on-chain id and address because the A5 contract carries no display name. A quote of 1,000 shares is a readable demonstration, not an execution promise. The labelled STORM fixture remains available at its old route for comparison but is no longer the primary Terminal destination.
