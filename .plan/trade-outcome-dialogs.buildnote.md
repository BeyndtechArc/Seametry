Surface:     Explorer (clients/web app): Positions Trade sheet, Allocation purchase
Template:    Existing pages
Question:    What am I about to sign, and how did it end?
Sections:    Trade sheet becomes two steps (Amount, Review) with a Step track; signing moves to a centre Process dialog with a Step register (sign, then submit and confirm); the result is a centre outcome dialog. The Allocation purchase opens a centre outcome dialog when every leg has ended.
Components:  Modal sheet, Step track, Step register, Process dialog, Process outcome, Route action, Quiet action (all existing).
Data:        Unchanged: the prepared quote, the simulation, signatures and their mainnet status (including expired).
States:      Trade: amount (shortcuts, Review sale), review (quote, simulation, Sign sale, or Request current terms once expired), signing, confirming, settled, failed, did not land (Sell again keeps the amount), stopped before sending (Sell again). Allocation outcome: assembled, partly assembled, stopped, each listing every leg's state and transaction, with View holdings and sell and Start new allocation; the inline record stays.
Ceremony:    None.
Names:       Allocation, Sell All.
Assumptions: Storm, 13 October 2026: the Trade flow stuffed amount, quote, signing and outcome into one panel; it should step like Strike and end in a centre dialog. The Allocation result should show in a modal, with its messages and inline states kept. Sell All keeps its sheet for now; it was not part of the request.
