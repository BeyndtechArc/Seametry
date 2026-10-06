Surface:     Explorer
Template:    Alloy record, adding its action panel; requests are watched in the Process dialog
Question:    How do I Strike new shares of this Alloy, or Melt mine back into its stocks?
Sections:    Strike card: what a Strike does, shares to Strike, the Key; Melt card: the shares this wallet holds, shares to Melt, the Key, and a Quiet action to deliver a Claim when one is outstanding; Process dialog per request
Components:  Field, Key, Quiet action, Process dialog, Step register
Data:        the Alloy from the Gateway; the wallet's share balance and Claim read from devnet; /api/alloys/strike mints the stand-ins a Strike takes; the transactions come from src/lib/alloys/hall-transactions.ts, the same builders scripts/register-strike-melt-devnet-proof.ts ran on devnet
States:      no wallet: both Keys held with the log-in reason; reading: Melt held while shares are read; none held: Melt held, saying to Strike first and that the genesis share is locked; unreadable share mint: Melt held with that reason; running, stopped and done in the Step register, each stop saying what did not happen
Ceremony:    none
Names:       Strike, Melt, Claim, share, stand-in
Assumptions: Storm chose on 6 October 2026 that a devnet Strike has the server mint the stand-ins first, as founding does. A Melt delivers every leg not held back in one signature after the Melt itself, two approvals in all; a held-back leg stays in the Claim, because delivering it in the same transaction would let it revert the others. Strikes are capped at 10 shares and 10 per address per hour, since the route mints at the funder's cost. An Alloy wider than about seven legs would exceed Solana's transaction size for a Strike; the builder refuses it by name rather than send a transaction that cannot fit.
