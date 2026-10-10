Surface:     Mobile app wallet disclosure
Template:    existing App shell wallet state
Question:    Which wallet app opens this page for signing?
Sections:    wallet choices name each available in-browser wallet; phone handoff names each wallet app and its destination.
Components:  Wallet state, wallet glyph, quiet wallet choice; no new component.
Data:        documented Phantom and Solflare browse links, each carrying the current page URL.
States:      default shows an icon and label for each handoff; loading names wallet detection; empty names the unavailable browser wallet; stale does not apply to static wallet destinations; unavailable names a missing signing wallet; error remains in the disclosure.
Ceremony:    none; connecting and opening a wallet app do not sign a transaction.
Names:       Phantom, Solflare, Allocation, wallet.
Assumptions: The requested icon is the existing neutral wallet glyph in a separate cell, not a new or unverified vendor mark. The wallet names remain text beside it.
