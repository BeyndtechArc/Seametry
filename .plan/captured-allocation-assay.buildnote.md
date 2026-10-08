Surface:     Explorer
Template:    Lot (constituent) assay
Question:    What captured evidence exists for this stock when the live Gateway has no persisted record?
Sections:    Instrument identity and capture provenance; captured policy decision and reasons; issuer powers
Components:  Lot mark, Digest, Stamp, assay fact ledger, back link
Data:        Admission.instrument capture, mint, symbol, prerogatives; Admission.issuer, capacity_decision and policy version. Live Gateway assay remains primary when available.
States:      Default live assay as before; loading names the Gateway; captured record on live 404 for a known admission; unknown mint keeps the Gateway boundary; other errors remain boundaries; age derives from the captured timestamp and no current depth is claimed
Ceremony:    None
Names:       Instrument assay, Captured allocation record, Back to allocation, Captured decision, Issuer powers
Assumptions: Allocation and the live Gateway are separate evidence stores. A known admission with no live record should remain inspectable, labelled by its captured source. The snapshot-level as_of predates some constituent captures, so the fallback cites the constituent captured_at and does not claim a live quote or snapshot-wide observation time. The device-connection work is tracked separately in issue 9.
