Surface:     Mobile and desktop web, Allocation funding guidance
Template:    Existing Allocation builder and order sheet
Question:    How much USDC and SOL should I put in my wallet before buying?
Sections:    Choose states the per-constituent floor; order sheet totals it; amount input rejects a smaller plan
Components:  Existing Order sheet facts, Field validation, quiet explanatory copy
Data:        Constituent count and exact USDC atoms; SOL rent and route fees remain checked live in prepare
States:      Default shows the floor; loading is unchanged; empty shows per-constituent floor; stale live quote may need more; unavailable and error name the cause
Ceremony:    None beyond the existing Buy action
Names:       Allocation, constituent, USDC, SOL, minimum spend, network fees
Assumptions: One USDC per constituent is an explicit platform floor, not a claim every Jupiter route fills at that amount. 0.01 SOL is a suggested demo reserve, not an enforced minimum or guaranteed cost.
