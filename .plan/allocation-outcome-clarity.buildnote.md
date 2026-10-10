Surface:     Mobile
Template:    Allocation order sheet and Process dialog
Question:    Did this constituent purchase move funds, and what action remains?
Sections:    Plan terms: what is being bought; purchase rows: which legs settled or were not sent; outcome dialog: what happened and whether to retry
Components:  ProcessDialog, StepRegister while running, Purchase outcome inside the dialog, StepBar, QuoteBlock
Data:        Prepared quote, exact signed-message comparison, server refusal, signature and mainnet confirmation; no production fixtures
States:      default says not bought; loading shows the running step; empty hides the outcome; stale retains an unconfirmed signature; unavailable names the wallet incompatibility; error names whether anything was sent
Ceremony:    One dialog follows a single purchase, then becomes an outcome rather than keeping a stopped step list
Names:       Allocation, constituent, purchase, wallet, mainnet, USDC, quote
Assumptions: A wallet that changes instructions or accounts pauses the plan; a fresh quote cannot be presented as a fix without evidence; requested semantic state colours are scoped to outcome icons
