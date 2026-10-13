Surface:     Explorer (clients/web app): Allocation purchase and Positions sale
Template:    Existing pages
Question:    Did my purchase or sale land, and if it never will, what now?
Sections:    No new section. Leg rows and sale outcomes gain a dropped state.
Components:  Existing: leg rows, ProcessOutcome, Sell All signature list.
Data:        /api/allocation/status takes ?sent= (the submission time already recorded per trade) and answers expired when the cluster has never seen the signature five minutes after it was sent. Swaps now ask Jupiter for a priority fee (veryHigh, capped at 0.0005 SOL).
States:      pending (unchanged); expired: purchase leg reads "never included ... Nothing moved", retryable, and Buy again prepares a fresh quote; single sale reads "Sale did not land" with "Request current terms"; Sell All lists "not landed, nothing moved" and offers Review sell all for what the wallet still holds. Polling stops on expired.
Ceremony:    None.
Names:       Allocation, Sell All.
Assumptions: Storm, 13 October 2026: two legs of a live Sell All stayed pending indefinitely. Measured the same day: Jupiter returned a 0 lamport priority fee without a setting and 215,264 with veryHigh capped at 500,000. A blockhash from the quote stays valid about 150 slots, 60 to 90 seconds, so five minutes unseen is past landing; the rule needs no blockhash, so it also resolves trades recorded before it existed.
