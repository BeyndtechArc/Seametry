Surface:     Mobile
Template:    Alloy record, with the Order sheet's exact-terms block
Question:    What quantities enter or leave my wallet for the share amount I typed?
Sections:    Alloy identity; one-share holdings; Strike and Melt with live quantity terms; on-chain facts
Components:  Field, Key, Melt panel, Process dialog, Alloy quantity terms (registered in components.md)
Data:        Gateway strike-cost and melt-proceeds for typed share atoms, with Meta source, age, completeness. No price or USD quote.
States:      Default shows exact per-leg atoms; loading says terms are being read; empty amount asks for shares; stale prior terms disappear when amount changes; unavailable and error name the missing Gateway terms; a held-back leg (read live by the Gateway) disables the Strike Key with its reason before any signature, and the Strike route refuses the same on chain state before minting, while Melt stays open and marks that leg "held as Claim".
Ceremony:    Existing Strike or Melt signature; no extra ceremony.
Names:       Alloy, Strike, Melt, Claim, shares, devnet stand-ins.
Assumptions: The Hall moves exact quantities, not USDC. This order sheet does not claim a market price or automatic purchase.
Fix (13 October 2026): the Strike or Melt Key reopened a finished action's outcome on every press, so after one Strike the sheet and Melt were unreachable. Only a running action reopens its progress now; a finished one is cleared and the sheet opens.
