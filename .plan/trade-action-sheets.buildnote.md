Surface:     Mobile and Terminal
Template:    Order sheet and Alloy record
Question:    How can a holder act on a position without searching through a long page?
Sections:    Holdings balance register; trade sheet with Buy and Sell tabs; recent transactions. Alloy hero; live balance figures; constituents; Strike and Melt sheet.
Components:  Modal sheet, Process dialog, Step register, Field, Key, Quote block, Figure, Lot mark.
Data:        Mainnet wallet token quantities and quote from existing routes; devnet Hall share and constituent quantities. No summed USD balance without a priced observation.
States:      Default shows tabs and amount; loading names the read; empty holds the action; stale quote expires; unavailable states why; error names the failed step; success is distinct from pending after chain confirmation.
Ceremony:    One transaction signature; the finished outcome is a separate concise state.
Names:       Allocation, Alloy, Strike, Melt, Claim, holdings, buy, sell.
Assumptions: Buy from a holding opens the existing Allocation purchase with that instrument selected. No new single-asset buy transaction is claimed. A total portfolio USD balance is unavailable until a priced source is added.
