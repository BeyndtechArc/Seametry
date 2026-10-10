Surface:     Mobile
Template:    Order sheet and Key within the existing Allocation flow
Question:    How can a phone holder carry an unfinished Allocation into a wallet that can sign it?
Sections:    Wallet disclosure: which signing browser is available; Allocation steps: what is chosen and what amount will be reviewed; order sheet: what must be quoted again before signing.
Components:  Existing Wallet state, Route action, Step track, Order sheet, and Key. No new design-system component.
Data:        Selected admitted mint addresses and typed USDC amount in the page URL; current wallet capability from Wallet Standard; quote and simulation from the prepare API only after connection.
States:      Default shows detected wallets; loading says wallets are being found; empty offers phone handoff; stale requires a new quote; unavailable explains the missing installed wallet or HTTPS origin; error stays in the wallet disclosure.
Ceremony:    Approve and sign remains the only custody-changing action.
Names:       Allocation, wallet, preview purchase, approve and sign.
Assumptions: Phantom's documented browse universal link is the immediate iOS and Android path. It opens the same page in Phantom's browser; it does not make Safari or Chrome sign in place. No unsigned quote, approval, or session credential is placed in the URL.
