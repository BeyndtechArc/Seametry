Surface:     Mobile web Allocation and Instruments
Template:    existing allocation builder and instrument register
Question:    Which instruments are selected for this wallet's next basket?
Sections:    search and filters for finding instruments; compact rows for identity and selection; selected count and next action
Components:  existing LotMark, ContinueAction, FilterBar and instrument detail Link
Data:        offered instrument symbol, issuer and mint; selected count from the current offered set
States:      default rows and 0/total count; loading and unavailable retain existing messages; empty offer and filtered empty retain existing states; stale source stays on instrument detail; error uses existing boundary
Ceremony:    none
Names:       Instruments, Create, Set amount
Assumptions: The builder shows identity and selection only. Admission reasons and recorded powers remain on the linked instrument detail. One basket is owned by one wallet; account linking does not aggregate wallets.
