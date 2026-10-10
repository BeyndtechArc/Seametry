Surface:     Mobile
Template:    Allocation order sheet and Process dialog
Question:    Did each wallet-signed constituent purchase settle, and what can I do if it did not?
Sections:    Purchase row: what happened to this leg; summary: what settled; dialog: which step stopped and how to retry
Components:  ProcessDialog, StepRegister, StepBar, Key, QuietAction, TextAction, QuoteBlock
Data:        Prepared quote, server refusal, signed message comparison, transaction signature and mainnet status; no fixtures in production
States:      default shows not bought; loading names quote and signing; empty has no leg; stale keeps pending signature; unavailable names missing service or wallet; error identifies unsent versus uncertain broadcast
Ceremony:    One Process dialog for prepare, sign, and confirm
Names:       Allocation, constituent, purchase, wallet, mainnet, USDC, SOL, route, quote
Assumptions: A changed signed message is never broadcast and may be retried from a fresh preparation; ambiguous submission is not retried automatically
