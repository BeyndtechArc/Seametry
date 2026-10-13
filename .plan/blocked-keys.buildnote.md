Surface:     Explorer (clients/web app) and clients/packages/ui
Template:    Existing pages: Allocation, Alloy actions, Positions, Compose
Question:    When the Key I need cannot run, why not, and what do I do about it?
Sections:    No new section. Every Key that has a reason to give stays pressable and explains on press; the Allocation flow adds a funding dialog.
Components:  Key gains a blocked state (components.md, Key); BlockedKey in packages/ui renders it with a Process dialog. Process dialog (existing) for the funding case.
Data:        Reasons are the flow's own: login, held-back legs read live by the Gateway, wallet signing support, empty sale, expired quote. Funding figures come from the server's 402 refusal: USDC held against the Allocation total, and now SOL held against the summed SOL every leg needs.
States:      blocked Key (reason beside it, press opens the dialog with a resolving action where one exists: "Melt instead", "Adjust amount", "Copy wallet address"); busy Key stays disabled; funding dialog (nothing prepared, no leg marked failed, amount field editable on "Adjust amount").
Ceremony:    None.
Names:       Key, Melt, Strike, Allocation, Claim.
Assumptions: Storm, 13 October 2026: a button must not go dead before it can explain itself; when funds are short, direct the reader to fund the wallet or adjust the amount. A 402 from preflight means nothing was prepared, so it is no longer recorded as a failed leg. The total SOL check is new: each leg checked only its own SOL, so a short wallet could settle some legs and fail the rest.
