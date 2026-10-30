Surface:     Explorer (web app shell and public pages, wherever the header's account chip opens it)
Template:    Auth dialog (components.md), rebuilt in the Process dialog's language: the existing centred-dialog idiom, not a new one
Question:    Which wallet do I connect, or how do I sign in, without leaving this page?
Sections:    1. Header: register ("Account" or "Wallet") over the title, close control at the right. What is this dialog for?
             2. Lead: one sentence on what the step signs. What will this ask of me?
             3. Wallet ledger: one hairline-ruled row per wallet, its own mark, its name, and "Detected" or "Install". Which wallets can I use here?
             4. Google, after an "or" rule, signed out only. Is there a way in without a wallet?
             5. Footer: the custody sentence, Terms, Privacy policy. What am I agreeing to?
Components:  Auth dialog (rewritten contract), Status mark (@seametry/ui/timeline) for the wait and the stop, ContinueAction, QuietAction
Data:        wallet adapter names and icons from the browser; session state from lib/account-session (unconfigured, reading, signed-out, signed-in)
States:      default: the wallet ledger.
             loading: "Looking for wallets in this browser." before hydration; session reading shows the connect lead, never a signed-in claim.
             empty: no detected wallet, the install rows with one sentence; on a phone the hand-off links.
             stale: not applicable, nothing here ages.
             unavailable: account service unconfigured, the dialog connects a wallet only and says sign-in is unavailable here; the chip reads Connect.
             error: a Status mark stopped, the problem in words, Try again where it helps.
             waiting: a Status mark running beside the one action to take in the wallet.
Ceremony:    none
Names:       Sign in to Seametry, Connect a wallet, Link a wallet, Detected, Install, Continue with Google, Terms, Privacy policy
Assumptions: The dialog drops the cast shadow and backdrop blur granted on 30 October 2026, and the design lint's exception for them, because Storm judged the result on 30 October ("the new auth modal sucks") and the system's own centred dialog has neither. It dims the page like the Modal sheet and Process dialog.
             The house-mark tile is removed: the header already names the house, and a centred logo tile is the generic wallet-modal template this replaces.
             The plate takes the registration cut at its top-left corner, as the Modal sheet does, and squares its rows; on a phone it is a bottom sheet with the sheet radius, as the Modal sheet is.
             "Detected" stops using status.success: status colours belong to the Status mark and the Callout icon cell.
