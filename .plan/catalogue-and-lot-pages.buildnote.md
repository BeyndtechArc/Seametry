Surface:     Explorer
Template:    Verification (patterns.md section 2, the ritual) for index.html;
             Catalogue for catalogue.html; Lot (constituent) for
             lot-<symbol>.html, one file per instrument.
Question:    Front page: is this hallmark what it claims to be? Catalogue:
             which instruments were admitted, and what refused the rest?
             Lot: what can this issuer do, and can I buy it at size?
Sections:    Front page: title, one sentence, serial entry and chips, the
             four-step ritual, a four-line "what this is and is not".
             Catalogue: title and one sentence; the powers every issuer
             shares, stated once; one row per lot (number, instrument,
             multiplier field state, shortfall at the reference size,
             verdict with its first blocking reason in words).
             Lot: crumb, name, verdict line, the shortfall as hero figure;
             then What the issuer can do, Depth at size, Multiplier,
             Decision, Record.
Components:  Stamp, Figure, Condition report, Decision row, Catalogue table
             (components.md). The engraved pillars are decoration under the
             "engraved Hall" art direction, drawn from geometry in pillar.go,
             not a component.
Data:        server/cmd/explorer's Instrument, read from shared/fixtures/
             mainnet. Lot adds Admitted (decision short of BLOCK), Reason
             (reasonInWords of the first BLOCK reason), Shortfall (the depth
             row at policy.Default().DepthReferenceUSDC) and Own (sentences
             not shared by every instrument). Hallmarks from the sealed batch.
States:      default: every instrument has a decision and depth rows.
             empty: no instruments captured, one sentence; no sealed batch,
             one sentence naming the command that seals one.
             stale: the multiplier field column reads "Stale since <date>",
             the age carrying the state.
             unavailable: a depth row with no route reads "No route"; a
             missing reference-size row reads "No observation"; neither is
             ever a zero.
             loading and error: not applicable to the static pages. On the
             front page, an unparseable edit shows its parse error in the
             status line under the controls, and every control is disabled
             while a run is animating.
Ceremony:    The verification ritual, on the front page and hallmark pages
             only.
Names:       Catalogue, Lot, Admitted, Refused, Shortfall, Hallmark, from the
             register. "Admitted" and "Refused" name the policy verdict in
             words; the policy's own ALLOW, WARN and BLOCK stay on the lot
             page's Decision section.
Assumptions: 1. Verification is the first page. Every visitor type in
             EXPLORER.md section 2 arrives to check something, and the
             catalogue is one click away in the nav.
             2. WARN is admitted. policy.Warn is a condition the holder is
             told about and decides on, not a refusal.
             3. The catalogue's filter is removed: seven rows need none.
             EXPLORER.md section 3.0 says it returns past one screen.
             4. Grade, provenance, corporate actions, issuer terms and
             custody attestations have no data source for any lot. One line
             per lot page says so, instead of a "no observation" row per
             field on every page, which was the overload this build removes.
             5. The pillars are hidden at a viewport of 1279px and narrower, where the
             margin beside the page is too narrow to hold them.
             6. The Devnet badge in the nav replaces the work-in-progress
             paragraph: the Hall runs on devnet, and the footer states it has
             not been audited.
