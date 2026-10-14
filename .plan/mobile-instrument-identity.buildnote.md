Surface:     Mobile
Template:    Lot and catalogue choice rows
Question:    Which instrument is this, and can I add it to the basket or Formula?
Sections:    Choice list: which captured instruments are available; identity: what name, symbol and issuer identify each; selection: how many constituents have I chosen; assay: what is the full captured identity; page header: what does this page do?
Components:  LotMark, FilterBar, ContinueAction, PageHeader, InfoNote, StepBar
Data:        Admissions snapshot mint, symbol and issuer; TokenMetadata name decoded from the same captured mint fixtures; mirrored logo state; selection count and Hall maximum
States:      Default names and logos from captured records; loading preserves the existing register and assay loading messages; empty uses the existing filter and register messages; stale retains the snapshot age in context; unavailable shows a letter tile when an image was not mirrored; error retains the existing boundary message
Ceremony:    None
Names:       Instrument, issuer, Formula, Alloy, Allocation, Assay, Sponsor
Assumptions: The mint's captured TokenMetadata name is the instrument name. A missing logo keeps its mint-specific two-letter tile. A time-series chart waits for a documented source, instrument identity and observation age.
