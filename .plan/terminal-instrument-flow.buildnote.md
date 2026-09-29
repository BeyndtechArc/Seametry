Surface:     Terminal
Template:    Instrument desk and instrument assay, following the existing workbench rail and evidence-table composition
Question:    Can an authorized participant move from the persisted instrument register into the policy and buy-depth evidence without the client recomputing any result?
Sections:    Workbench rail: where am I; desk plate: which evidence services are present; instrument register: what has a persisted capture; identity assay: which mint and grade; admissibility: what did policy decide and why; buy depth: which stored input sizes have routes; issuer powers: what can affect the instrument; missing register: which evidence is absent
Components:  ThemeControl, Digest, Stamp, Rule, TextAction, TerminalFrame, InstrumentRegister, InstrumentAssay
Data:        GET /v1/instruments, GET /v1/instruments/{mint}, GET /v1/instruments/{mint}/admissibility, GET /v1/instruments/{mint}/depth?direction=buy through a server-side proxy
States:      loading keeps the source names visible; empty renders an empty register; stale remains in the API envelope; unavailable names the missing Gateway configuration; partial lists every missing response part; error preserves the Gateway title and detail
Ceremony:    None; this cut establishes navigation and evidence flow before execution exists
Names:       Seametry, Terminal, Formula, Alloy, Hall, Grade, Prerogatives, Good Delivery
Assumptions: SEAMETRY_API_URL names the Gateway root and remains server-only. Formula evaluation, sell depth, NAV, share price and execution are outside this cut because their API handlers are not built.
