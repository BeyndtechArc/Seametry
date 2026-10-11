Surface:     Explorer and mobile web instrument identity
Template:    Existing Lot mark in catalogue rows, constituent lists and holdings
Question:    Which tokenized instrument is this when issuer-provided logo capture fails or a mirrored asset cannot load?
Sections:    Instrument identity row (mint-specific mark + symbol); capture state and reasons remain in the evidence manifest, not invented in UI.
Components:  Lot mark (client image failure fallback); existing wordmark/letter tile.
Data:        Mint-address-keyed captured image path, symbol, logo capture state from shared/evidence/instrument-logos.json.
States:      Captured image renders; no metadata/no image/unsupported shows two-letter tile; broken asset URL falls back to the same tile; no image loading spinner; reason resides in evidence; keyboard unaffected.
Ceremony:    None. Logos are stable UI identity, not loading animations.
Names:       Stock/instrument symbol unchanged; never infer another issuer's instrument from the same ticker.
Assumptions: Prefer fail-closed rather than using arbitrary remote logos. Allow an unused SVG xmlns:x declaration during capture while continuing to refuse namespaced image reference attributes, script, event handlers and external URLs. Re-run capture separately to publish INTC artwork only after successfully validating its real issuer bytes.
