Surface:     Web app (clients/web), the first mainnet surface where money
             moves. No web template exists in references/patterns.md for an
             order flow; the Mobile "Order sheet" template is the nearest
             and is followed section for section, laid out as a page
             rather than an occluding sheet because a desktop reviewer
             reads it before acting.
Template:    Order sheet (patterns.md section 3), adapted to a page
Question:    Which instruments may I buy into my own wallet, and for each
             one, what exactly will I receive before I sign?
Sections:    1. Admission (which instruments may enter, and why the others
                may not): every captured instrument, admitted ones
                selectable, refused ones listed with their first blocking
                reason, all from the policy engine's snapshot with its
                decision instant.
             2. Amount (how much USDC, split how): one Field in USDC,
                split evenly across the selected lots in integer atoms,
                capped per lot at the policy's reference size.
             3. Legs (what will I receive for each): per lot, a Quote
                block: expected output, the floor ("You receive no less
                than") set larger, every fee line, route, expiry
                countdown, and the simulated balance changes for this
                wallet.
             4. Key (sign this leg): one Key per view, "Approve and sign",
                acting on the leg in front of the holder.
             5. Settlement (what happened): per leg, signed, settled, or
                refused with its reason; a partial result says which legs
                settled and that the rest were not bought.
Components:  Stamp, Grade, Field, Key, Quote block (contract exists in
             components.md; first implementation), Condition report,
             Timestamp, Rule.
Data:        shared/evidence/admissions.json (policy engine, fixed
             decision instant, CI drift checked): instrument, decision,
             decimals, token program. Live: Jupiter quote and swap
             transaction, mainnet simulation, signature status, all
             through this app's own route handlers. Nothing here is
             fixture data except the admission snapshot, which is labelled
             with its decision instant and capture slot.
States:      default (admitted lots listed, nothing selected);
             loading ("Loading quotes for 250 USDC", rule-line skeleton);
             empty (no admitted instrument: "No instrument meets Good
             Delivery at the reference size in this snapshot.");
             stale (the snapshot's decision instant shown with its age on
             every admission, always, since it is never live);
             unavailable (deployment not configured, or the visitor's
             country is excluded: the page says which, and the Key is
             disabled with that reason);
             error (quote, build, simulation or submission refused: the
             reason from the route handler, verbatim, beside the leg).
             Quote expired is its own leg state: "This quote expired.
             Refresh to see current terms." and the Key is disabled.
Ceremony:    None. The Strike belongs to the Hall; an Allocation settles as
             ordinary swaps into the holder's wallet.
Names:       Allocation (world name, beneath the operational label "Buy
             into your own wallet"), Lot, Good Delivery, Condition report,
             Grade. Buttons: "Prepare this leg", "Approve and sign" (busy:
             "Signing"), "Refresh quote". No "Submit", no "Continue".
Assumptions: 1. Execution runs in this app's route handlers, not in the Go
             Execution service ENGINEERING_STANDARD section 11 and
             SERVICE_CATALOG section 3.6 describe, because that service is
             not built (API.md A7) and the Go API is not deployed (D1).
             The section 11 rules are followed here instead: no key held,
             quote expiry checked at build and at submission, program
             allowlist before handoff, simulation before the signature
             request, an approval digest over every bound input. To move
             into Go when A7 exists.
             2. Equal split only. Custom weights need no stored data if they
             live in the page, but they are a second decision surface; left
             for the next pass.
             3. Size cap per lot is the policy's reference size (1,000 USDC
             in policy-2026.09.2), because depth is measured to that size
             and no further.
             4. Slippage is 50 basis points, stated on the page. An
             assumption, not a policy value; belongs in policy data.
             5. Country exclusion is by the host's IP country header and a
             list the operator sets from each issuer's own terms. It fails
             closed: with no list set, nothing can be bought. An IP check
             is weak against a VPN, and the page says the holder remains
             bound by the issuer's terms.
             6. The multiplier is shown as resolved at the snapshot's
             decision instant with that date, never applied to compute a
             UI amount here.
