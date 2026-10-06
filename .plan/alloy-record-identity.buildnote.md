Surface:     Explorer
Template:    Alloy (patterns.md section 2), rebuilt from the live Hall record so its first screen names the share before it shows the ledger
Question:    What is this Alloy, what does one share hold, and what can I do with it?
Sections:    identity: artwork, name, symbol, network and one sentence on what a share is; holdings: "One share holds", each stock's lot mark, symbol and amount with its delivery state; actions: Strike and Melt, held with their reason; figures: shares outstanding, genesis locked, legs held back; details (closed by default): addresses, the per-leg ledger and the per-share terms
Components:  Lot mark, Figure, Stamp, Key, Digest, Text action; native details disclosure for the technical register
Data:        Gateway Alloy (metadata on the Alloy and each leg, from the share and constituent mints); shared/evidence/alloys/index.json from scripts/record-founding.ts for the artwork and for mapping each devnet stand-in to the captured xStock whose logo it shows; strike-cost and melt-proceeds for the per-share terms
States:      default as above; loading and unavailable unchanged (rule line, Hall boundary); an Alloy with neither metadata nor a record is titled "Alloy <id>" and its legs by number with lettered marks; a leg without a record shows its own symbol with a lettered mark
Ceremony:    none
Names:       Alloy, Formula, Strike, Melt, Claim, Hall, share
Assumptions: Storm asked on 6 October 2026 where the names, symbols and avatars were and what the action is. The name's source (share mint or founding record) is stated beside it, since the record is the fallback until the Gateway on the Oracle VM is redeployed. Artwork renders only from this site's own origin, because the CSP loads images from it alone; a sponsor's off-site artwork waits for the content-addressed upload already deferred. Strike and Melt for register Alloys are step 4 and stay held here.
