Surface:     Terminal (clients/web). No Terminal template exists in
             references/patterns.md (design audit issue 14, 27 September
             2026): only Explorer and Mobile are templated. Composed from
             Explorer organisms (Lot header, Condition report, Decision row,
             Melt panel, Order sheet's Key-in-tray pattern) rather than
             invented from nothing, per the workflow's "compose, don't
             invent". A real Terminal template is Storm's next skill import
             to add, not this build's to invent.
Template:    new, justified above
Question:    Can a stranger watch the Hall's first guarantee hold, live: the
             melt always works, delivery is each issuer's?
Sections:    The alloy (what is it, what does it hold, what can nothing do
             to the share mint)
             Strike (create n shares: required inputs, then the Key)
             The issuer's hand (freeze one constituent; a Decision row per
             action, since these are the Office acting, not the holder)
             Melt (redeem: burn shares, a claim appears for every leg)
             Withdraw (each leg, one Key each: unfrozen arrive, the frozen
             one refused with its reason, the claim stays visible)
             Release (the issuer thaws; withdraw the remaining claim)
Components:  Figure (constituent ledger amounts, supply, tabular, sourced
             "read from chain" with the slot), Condition report (the share
             mint's absent prerogatives, and each mock stock's present
             ones), Key (one per action: Strike, Melt, Withdraw x2, never
             more than one live at once, the rest quiet), Decision row
             (each issuer action: actor "the Office", action, Stamp, reason
             when refused, link to the transaction), Claim line (what a
             melt leg gives, one sentence), Stamp (ALLOW/WARN pattern reused
             for succeeded/refused, never red), Serial-style digest display
             for every signature (Fragment Mono, truncated middle, full on
             focus, matching the Digest atom)
Data:        Every figure read from the connected RPC after each
             transaction confirms: Alloy account (supply, per-leg ledger),
             Claim account (entries), mint account (freeze/pause state).
             Nothing hardcoded. The founding transaction's inputs (mock
             stock extensions, genesis deposit) are logged as what the demo
             set up, labelled as such, never presented as a market fact.
States:      default (nothing connected: explains what this is and that it
             is devnet), loading (a step's transaction is in flight: the
             rule-line skeleton naming what is loading, never a spinner),
             empty (not applicable, an alloy always exists once founded),
             stale (not applicable to a live chain read taken at submit
             time), unavailable (RPC read failed: named, with a retry, never
             a blank card), error (a transaction was refused: shown as a
             Decision row with its real on-chain reason, in Fragment Mono,
             never paraphrased into something friendlier)
Ceremony:    None chosen for this build. The Strike ceremony (foundations.md
             section 8: four punches, heavy haptic) belongs to a hallmark
             being issued in the live product; this is a devnet
             demonstration of five raw instructions, not a hallmark issuance,
             and the punch has no drawn geometry yet regardless (design
             audit issue 14). Every step instead gets a plain Decision row.
Names:       Alloy, Strike (create), Melt (redeem), Claim, Withdraw. "Formula"
             is not shown; this alloy has no named formula page. "Sponsor"
             is the funding key, never shown as a person. "The Office" names
             the mock issuer's actions (foundations.md section 3: issuer
             control language is stated, never personified as an
             adversary). Devnet Hall. Key still in hand. (voice.md standard
             phrase, shown once, at the top.)
Assumptions: 1. A fresh alloy per page load, not one shared alloy. Two
             presenters running this at once on a shared alloy would freeze
             or thaw each other's demo mid-sentence; devnet-demo's own code
             already founds a fresh alloy per scenario for the identical
             reason (main.rs's own comment: sharing one alloy produced "a
             melt refused for insufficient funds ... an artifact of the
             sharing, not of anything the scenario was meant to show").
             2. The mock issuer authority is never persisted. It is
             re-derived deterministically per alloy id from one server-only
             seed (HKDF over the alloy id), so a stateless serverless
             function can sign a later freeze/thaw for the same alloy
             without a database, matching Storm's free-tier, minimal
             infrastructure constraint. This is the "local signer only for
             demo" option the task offered outright; a second wallet the
             presenter must also hold and switch to mid-demo was rejected as
             friction the flow does not need on a deadline.
             3. Fee payer and mint/freeze authority are different signers on
             every server-built transaction. The funding key pays every fee
             and rent; the derived issuer key only ever provides the
             authority signature its instruction needs. The issuer key never
             needs its own SOL.
             4. The connected wallet is the holder for the whole flow: it
             signs create, redeem and withdraw itself, and needs its own
             devnet SOL for the claim account's rent (queried, not assumed,
             matching devnet-demo's own comment about the exact rent
             failure it hit first). The page states this before the first
             Key.
             5. Maximums on create are set to the exact required amounts (no
             slippage tolerance), since a demo has nothing to slip against;
             stated as a sentence, not left implicit.
             6. Two mock stocks, matching HALL.md section 3's cited real
             extension set exactly: PermanentDelegate, FreezeAuthority (via
             the mint's own freeze authority), Pausable, TransferHook
             initialized and disabled. No DefaultAccountState or
             TransferFee extension, since neither step in this flow
             exercises them and HALL.md section 4.6's fuller table is out of
             this build's scope.
             7. The Anchor IDL (chain program `hall`) is generated by
             `anchor idl build` in `chain/` (chain/target/ is gitignored, so
             it cannot be a build-time fetch the way clients/web/fonts is)
             and committed at clients/web/src/lib/hall/idl.json, the same
             pattern as generated design tokens: regenerated deliberately,
             checked for drift.
