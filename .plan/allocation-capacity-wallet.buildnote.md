Surface: Terminal
Template: Order sheet, adapted to the application shell
Question: Which constituents can this wallet assemble at this amount, and what must happen before those constituents can enter an Alloy?
Sections: Amount, capacity-aware constituent register, per-leg preview, order sheet, Alloy handoff
Components: Field, Wallet state, Grade, Stamp, Condition report, Quote block, Quiet action, Key, Modal sheet
Data: Policy-issued capacity per instrument, captured Jupiter depth points, issuer controls, wallet adapter state, exact preview and simulation
States: Default, connecting, unavailable wallet, rejected connection, loading quote, stale quote, blocked size, partial settlement, settled
Ceremony: None in Allocation; Strike remains a Hall ceremony
Names: Allocation, constituent, capacity, Alloy, Formula, Strike, Hall, Key
Assumptions: Capacity is issued by the Go policy engine only at measured sizes. A route must satisfy both absolute quoted impact and deterioration from the smallest measured route. No mainnet Strike is implied before the Hall audit and deployment gates are met.
