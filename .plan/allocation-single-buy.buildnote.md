Surface:     Mobile and desktop web, Allocation buy step
Template:    Existing Allocation builder and mobile order sheet
Question:    Can I buy the next chosen constituent from this wallet?
Sections:    Order summary answers what is being bought; purchase list answers what has settled; action tray starts the next purchase
Components:  Existing Step track, Order sheet, Quote block, Key and Step bar
Data:        Prepared quote, simulation, receipt and live mainnet status from the existing Allocation routes
States:      Default offers Buy; loading names preparation; empty asks for a constituent; stale quote is refused; unavailable names the cause; error allows a fresh attempt before signing
Ceremony:    One Buy action prepares and simulates, then opens the wallet approval; no separate preview action
Names:       Allocation, constituent, Buy, wallet, quote, mainnet
Assumptions: The user's request removes only Seametry's extra preview click. Wallet approval, simulation, eligibility and route checks remain mandatory. Each leg is still a separate transaction.
