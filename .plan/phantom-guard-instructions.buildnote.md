Surface:     Explorer (clients/web), the Allocation and sale signing path.
Template:    None changed. No screen is redesigned; a refusal's words change.
Question:    May a leg the holder's wallet signed be sent when the wallet added
             its own guard instructions?
Sections:    None.
Components:  Toast and Activity show the refusal text as before.
Data:        The approved transaction travels back with each submission so
             the server can compare the signed message with it; the approval
             token still binds the approved message's digest.
States:      a leg the wallet left alone or only guarded: sent; a leg the
             wallet changed beyond its guards: stopped before sending, the
             refusal naming the first instruction that differs.
Ceremony:    None.
Names:       Allocation, leg, approval (foundations section 3).
Assumptions: 1. Phantom adds Lighthouse guard instructions (program
                L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95) and may change
                compute-budget instructions on a transaction it can simulate,
                and leaves a batch it cannot simulate alone. Seen by Storm on
                24 October 2026: a one-stock buy showed no warning and was
                refused as changed; a two-stock buy warned and landed. The
                exact instructions Phantom writes were not observed; a
                refusal now names what differs, so the next attempt shows it.
             2. Compute-budget changes are not material: they set the network
                fee the holder sees and approves in the wallet. The approval
                binds the trade (payer, blockhash, signer, every other
                instruction with its accounts, writability and data, in
                order), which must be exactly as approved.
