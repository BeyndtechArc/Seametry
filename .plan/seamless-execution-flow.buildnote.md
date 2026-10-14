Surface:     Responsive web app, with phone execution as the strictest case
Template:    Allocation order, watched process dialog, instrument catalogue, Alloy action outcome
Question:    What is happening to my allocation or Melt, what settled, and what can I safely do next?
Sections:    Allocation choice and amount; one watched execution; terminal outcome; published instrument register; Alloy Claim recovery
Components:  PageHeader, StepTrack, StepRegister, ProcessDialog, ProcessOutcome, LotMark, Field, Key, ContinueAction, QuietAction
Data:        Captured admissions and issuer listings; freshly quoted Jupiter routes; wallet-signed transaction messages; Solana signature status and blockhash validity; devnet Hall Claim state
States:      Default waits for an amount; loading names preflight, wallet approval and confirmation; empty names an empty register or selection; stale quotes are refused before broadcast; unavailable keeps a signed transaction visible while its status is reconciled; error says whether nothing moved, settlement is uncertain, or a Claim remains; success names every settled constituent
Ceremony:    One allocation decision and one batch wallet approval where supported. Melt and Delivery remain two on-chain ceremonies because the Claim exists only after Melt confirms, but they remain inside one watched request with a recovery action.
Names:       Allocation, constituent, purchase, Melt, Delivery, Claim, instrument, listing, assay
Assumptions: Independent swaps cannot be represented as atomic. A missing submit response is not failure; its signed signature is watched until the blockhash expires. Published listings are discovery records, while only assayed and admitted instruments can enter an Allocation.
