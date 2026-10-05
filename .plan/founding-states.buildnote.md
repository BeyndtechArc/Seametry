Surface:     Explorer
Template:    none new; Compose's founding panel gains a Modal sheet holding a Step register
Question:    What is my founding doing right now, and if it stopped, why and what did not happen?
Sections:    sheet header: which founding; Step register: 01 prepare the stand-ins, 02 sign as the sponsor, 03 confirm on devnet; footer: try again when stopped, the Alloy record and the transaction when founded, a note that closing does not stop it while running
Components:  Modal sheet (existing), Step register (new molecule, contract added to components.md section 2 before it was built), Key, Quiet action, Text action, Digest
Data:        the founding's own progress in the browser; the server's refusal text; lib/compose/founding-problem.ts turns each stop into a plain sentence and keeps the raw message behind "Technical detail"
States:      waiting before the press; in progress (one step Now with a rule-line skeleton naming what it waits on); stopped (plain sentence first, what did not happen, raw message disclosed); founded (every step Done, links to the record and the transaction). Closing the sheet mid-run leaves a Quiet action on the panel to reopen it.
Ceremony:    none; the founding itself is the Key, which stays on the panel
Names:       Found on devnet, Founding <name>, Prepare the stand-ins, Sign as the sponsor, Confirm on devnet, Try the founding again, Technical detail
Assumptions: Storm asked for a modal for critical actions on 6 October 2026. Founding is first; Allocation's signing and the Hall demo's actions are the next candidates for the same Step register. A wallet's decline is told apart from other signing failures by its message and the adapter's error name, since Wallet Standard wallets word a decline differently.
