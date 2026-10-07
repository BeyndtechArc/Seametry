Surface:     Mobile and desktop web, Allocation
Template:    the existing Allocation builder
Question:    What does this basket cost Seametry's way, and does each row read top to bottom in one glance?
Sections:    unchanged; the order sheet's fee line names the plan's tier; the list's provenance line spans the list
Components:  Order sheet fee line; Lot row (marks spread down the row's height); Info note text from the fee table
Data:        ROUTING_FEE_TIERS and feeSchedule() in src/lib/allocation/rules.ts; the server charges the same table
States:      fee "Not set" before an amount; tier follows the number of constituents in the plan, live
Ceremony:    none
Names:       "Seametry routing fee, <rate>%"
Assumptions: Storm, 7 October 2026, accepting the proposed shape: 0.25% for one constituent, 0.15% for two to four,
             0.10% for five or more. The rates were the proposal's examples; Storm approved the shape and they stand
             until changed. A buyer can name a wider plan than they sign, saving at most the gap between tiers on
             the legs bought; every named lot must be admitted.
             Rows: marks align with the symbol and the reason with the row's last line (Storm: justify between).
