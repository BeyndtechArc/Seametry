Surface:     Mobile and Terminal
Template:    Order sheet and Alloy record
Question:    How can a holder act on a position without searching through a long page?
Sections:    Holdings balance register; trade sheet; recent transactions. Alloy hero; live balance figures; constituents; Strike and Melt sheet with Choose action and Set amount steps; request progress dialog; distinct outcome dialog.
Components:  Modal sheet, Process dialog, Process outcome, Step track, Step register, Field, Key, Quote block, Figure, Lot mark.
Data:        Mainnet wallet token quantities and quote from existing routes; devnet Hall share and constituent quantities. No summed USD balance without a priced observation.
States:      Default chooses the action; the second sheet step sets amount and reads exact quantities; loading names the read; empty holds the action; unavailable states why; error names the failed step; success is a separate outcome dialog after chain confirmation.
Ceremony:    One request at a time. The editable sheet closes before the watched request opens; the finished outcome then opens separately from progress.
Names:       Allocation, Alloy, Strike, Melt, Claim, holdings, buy, sell.
Assumptions: Buy from a holding opens the existing Allocation purchase with that instrument selected. No new single-asset buy transaction is claimed. A total portfolio USD balance is unavailable until a priced source is added.
