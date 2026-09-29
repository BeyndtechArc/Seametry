Surface:     Explorer
Template:    Catalogue (patterns.md section 2, "Catalogue") for index.html;
             Lot (patterns.md section 2, "Lot (constituent)") for
             instruments.html.
Question:    Catalogue: what is in this set, and which entries meet the
             standard? Lot: what is this instrument, what can its issuer do
             to it, and can I trade it at size?
Sections:    Catalogue: title and one sentence on the Good Delivery rules
             with a link to the published rule set; Catalogue table
             (components.md, "Catalogue table"); NGD entries visible, never
             hidden (composition rule 5).
             Lot, per instrument: Lot header (lot number, name, ticker and
             grade, hero figure with state); Provenance line; Condition
             report; Evidence rows; Depth at size (100, 1,000, 10,000 USDC);
             Corporate actions; Literature; Cross-issuer.
Components:  Catalogue table, Lot header, Condition report, Evidence row,
             Stamp, Grade, Figure (all components.md). No new component.
Data:        server/cmd/explorer's Instrument struct, read from
             shared/fixtures/mainnet via loadInstruments(): Symbol, Issuer,
             Note, Address, Slot, CapturedAt, Decimals, Supply, Sentences
             (issuer prerogatives), HookState, Extensions, Unknown,
             NaiveValue/LiveValue/Source/EffectiveAt/Stale/Pending (the
             multiplier), Decision/Reasons/PolicyVersion/InputDigest (the
             admission decision), Depth (server/internal/policy.DepthRow at
             100/1,000/10,000 USDC, exactly matching patterns.md's Lot
             template).
States:      default: an instrument with a decision, a multiplier and depth
             data, all present.
             stale: the multiplier's obvious field is stale; shown with its
             age, per foundations.md's evidence-state rule (dotted
             underline plus age, never colour alone).
             unavailable: three sections the Lot template names have no
             data source in this codebase today (see Assumptions): rendered
             as "no observation" rather than omitted, per composition rule
             4 (fixture/every-section-answers-a-question) and the
             components.md rule that a silent source still gets a row.
             empty: the catalogue with zero instruments (no fixtures
             captured): existing "No fixtures captured yet" card, kept.
             loading: not applicable; this is a static, build-time page
             with no client-side fetch on these two pages.
             error: not applicable for the same reason; a decode failure
             already causes the Go build itself to fail loudly
             (loadInstruments' fail() call), which is a build-time error,
             not a page state.
Ceremony:    None. Composition rule 3: the Explorer's one ceremony is the
             verification ritual, on the landing hero and the Hallmark
             page. Neither the catalogue nor a Lot page repeats it.
Names:       Lot, Grade, Ungraded, Condition report, Good Delivery, NGD,
             Depth, Provenance, from foundations.md section 3's register.
             "Corporate actions" and "Literature" are patterns.md's own
             section names, not registry terms; kept as written there.
Assumptions: 1. Grade: no code anywhere in this repository classifies an
             instrument's legal shape (Entitlement, Certificate, Interest).
             receipt.Constituent.Grade exists only as a field set by hand in
             the demonstration seal script, never derived from real mint
             data. Rather than invent a classification, every instrument
             here shows "Ungraded", which the register itself defines:
             "Not yet classified." This is not a placeholder pretending to
             be data; it is the value that literally matches what is
             actually known.
             2. Provenance line has no data source. No code decodes or
             stores a chain from company to depository to custodian to
             token to wallet. Rendered as a labelled "not available" row
             rather than fabricated or silently dropped; populating it
             for real is registry work outside this build's scope
             (2 in the handover named this as the same kind of gap).
             3. Corporate actions (scheduled and effective) has no data
             source: no calendar of corporate actions is captured or
             decoded anywhere. Same treatment as Provenance.
             4. Cross-issuer has no data source and, additionally, every
             fixture instrument today is issued by the same issuer (Backed
             Finance), so the section would always be empty even with the
             right data model. Shown as a single sentence saying so, not a
             fabricated comparison.
             5. Literature is partial: the mint address and Token-2022
             extensions decoded are real "literature" about the instrument
             (what the token itself declares); issuer terms and custody
             attestations have no data source, same treatment as above.
             6. The Catalogue's Good Delivery rule set has no published,
             linkable page yet (EXPLORER.md section 3.0's own link target
             does not exist as a route). Linked instead to hall.html,
             which is the closest existing page describing what "Good
             Delivery" and "NGD" mean in this system, with a one-line note
             that a dedicated rules page does not exist yet. Not a broken
             link, but not the ideal target either; named for Storm.
             7. index.html's survey figures block and its "obvious field is
             wrong" split highlight (both above the three named-for-removal
             sections) are also dropped, not kept alongside the Catalogue.
             The plan named three sections explicitly, but "the Explorer's
             first page becomes the catalogue" is a template replacement,
             and patterns.md's Catalogue template has no figures block and
             no evidence highlight; both duplicate evidence.html's own,
             fuller versions of the same content (one topic, one owner).
             8. index.html's removed prose ("A tokenized stock is not an
             ordinary token", "A bundle is not an ETF", "What is built") is
             preserved verbatim in this build's commit message, since
             SITE.md's `/how-it-works` (Phase 7, not yet built) needs the
             same argument restructured as a Claim grid, not this prose
             copied as-is; the commit is the retrievable copy, not a
             duplicate file living in the tree.
