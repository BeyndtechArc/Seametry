Surface:     Mobile, in the App shell on web
Template:    Today for holdings; Order sheet for a sale; Activity for submitted signatures
Question:    What admitted instruments does this wallet hold, and what can it receive by selling one of them now?
Sections:    Wallet source and observed time (whose balance is this?); Holdings ledger (what is held?); Sale terms (what changes if signed?); Activity (what happened after signing?)
Components:  Page header, Network badge, Figure, Lot mark, Quote block, Field, Key, Quiet action, Purchase outcome, Holdings ledger
Data:        Mainnet RPC token accounts for the connected wallet; admissions snapshot for symbols and token programs; Jupiter quote and simulated deltas; Solana signature status
States:      default shows observed holdings and sell terms; loading names the RPC or route; empty names the wallet with no listed holdings; stale keeps the last reading and its age; unavailable names the missing RPC or route; error names the refused request and next action
Ceremony:    Wallet signing is the one custody-changing ceremony; status remains a ledger entry
Names:       Allocation, holdings, Lot, Mainnet, sell, hallmark only when a durable receipt exists
Assumptions: This first exit surface shows only instruments in the admissions snapshot, including ones no longer admitted for buying. It does not claim issuer redemption. Local activity can resume on this device, but is not a sealed hallmark or cross-device account record. A sale, single or Sell All, is prepared in one request for every leg (15 October 2026): a request per leg let Vercel spread Sell All across instances whose Jupiter calls together passed the plan's ten in ten seconds on every attempt, and the sheet showed Jupiter's raw 429. Preparing a large Sell All therefore takes longer before review, about a second for each Jupiter call past the first ten.
