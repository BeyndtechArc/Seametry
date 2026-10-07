Surface:     Mobile and desktop web, the Allocation page header
Template:    the existing Allocation builder; no new template
Question:    What are this page's terms, for someone who wants them before acting, without making everyone read them first?
Sections:    page header (group, title with Info note, network); then unchanged: amount, constituents, purchases, order sheet
Components:  Info note (new, added to components.md first), Page header (gains the optional note), Order sheet (gains a slippage line)
Data:        ROUTING_FEE_BPS and SLIPPAGE_BPS from src/lib/allocation/rules.ts; nothing new fetched
States:      note closed (default) and open; every other state unchanged
Ceremony:    none
Names:       "About Build a basket" as the glyph's accessible name; "Slippage tolerance" on the order sheet
Assumptions: Storm, 7 October 2026: the subtitle and the terms panel are not needed on the page itself, since the
             order sheet and the flow carry their meaning; the terms move behind an info glyph beside the title.
             A disclosure (details element) rather than a hover tooltip, so a tap opens it on a phone and it needs no script.
             The slippage figure was stated only in the removed terms panel, so it becomes an order sheet line:
             a cost may sit behind the glyph only if it is also stated where it acts.
