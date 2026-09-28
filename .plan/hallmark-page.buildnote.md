Surface:     Explorer
Template:    Hallmark (references/patterns.md section 2, "Hallmark")
Question:    Is this record vouched for, by whom, and when, and can I check
             it myself without trusting Seametry?
Sections:    Hallmark row, large (is this record vouched for, by whom, when)
             Public record (what does the sealed body actually say)
             Seal status, then the verification ritual prefilled with this
             serial (can I check this myself)
             Links: alloy or allocation, policy version, evidence (where do
             I go next)
Components:  Hallmark row (components.md "Hallmark row"), Punch (deferred,
             see Assumptions), Serial, Stamp (reused from .stamp, already
             in explorer.css for ALLOW/WARN/BLOCK and done/todo), Verification
             ritual (components.md "Verification ritual"; reuses verify.js
             and verify.html's existing steps 1-4 unmodified)
Data:        server/internal/receipt.Proof, read from
             shared/evidence/demo-batch/batch.json: serial, kind, month,
             basket, constituents (ticker, mint, grade, issuer_can),
             weakest_evidence, size_band, venues, policy_version,
             settlement, office, private_commitment, path, root
States:      default (a sealed proof exists for this serial): the only
             state this page can be in, since it is generated once per
             serial that exists in the batch at build time. unsealed,
             verification pending, does not match, and stale all belong to
             the ritual it embeds (verify.js's own run()), not to the
             static shell around it. empty/unavailable: no page is
             generated for a serial that is not in the batch, so those
             states cannot be reached by navigation, only by a mistyped
             URL, which is a 404, not a page state.
Ceremony:    None. The Strike belongs to the moment a hallmark is issued in
             a live product; this is a published record after the fact.
             The Seal (seal glyph fills once) belongs on this page when a
             batch root is anchored on chain (EXPLORER.md 3.1: "Once it is,
             step 4 also checks it against the Solana memo transaction").
             Until then the page states plainly that the root is not yet
             written on-chain, which is the existing verify.html copy,
             unchanged.
Names:       Hallmark, serial, seal, weakest evidence, Good Delivery
             register terms throughout; "kind" (strike/allocation) shown as
             its literal value since Strike/Allocation naming for kind is
             not yet in the register table as a rendered field label.
Assumptions: 1. Punches (sponsor's mark, grade, office, date) have no drawn
             geometry yet (design audit issue 14). Rendered instead as
             plain-text .stamp badges reusing the existing ALLOW/WARN/BLOCK
             visual language, never as invented punch shapes: composing
             from what exists rather than inventing a new illustrative
             component outside the skill's own process.
             2. URL shape is flat (hallmark-<serial>.html, served at
             /hallmark-<serial> under Cloudflare's automatic clean-URL
             behaviour), not nested under /hallmark/<serial>/, so every
             existing relative asset path (tokens.css, explorer.css,
             fonts/, batch.js) keeps working unchanged. A future move to a
             nested path is a routing change, not a template change.
             3. Auto-run on load (no click needed) since the serial is
             already fixed by the URL; verify.html's free-entry form stays
             exactly as it is for a visitor who does not yet have a serial.
             4. Alloy/allocation and evidence links point at existing pages
             (hall.html, evidence.html) by anchor where one exists; there is
             no per-alloy page yet, so "alloy or allocation" links to
             hall.html's cost table section instead of a page that does not
             exist, named as what it actually is rather than implying a
             page this build does not have.
             5. OPEN, for Storm: the Hallmark row is specified as four punches,
             the second being "the weakest grade present"
             (BRAND_AND_WORLD.md section 8, MOBILE.md). No document defines an
             order between grades, and BRAND_AND_WORLD.md section 2 says grades
             never imply quality, so an order would contradict it. This page
             lists the grades present, in the order first met, and ranks
             nothing. If a "weakest" is wanted, it needs a definition that
             survives that rule first.
             6. OPEN, for Storm: the first punch is the sponsor's mark, and
             receipt.PublicBody has no field for one. The page says so in a
             row rather than omitting it, since a silently absent mark cannot
             be told from one that does not exist. Adding a field changes what
             the seal commits to, which is a decision about what the world may
             know about a holder (receipt.go says so), so it was not made here.
