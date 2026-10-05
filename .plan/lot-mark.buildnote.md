Surface:     Explorer
Template:    none new; a Lot mark atom added to the existing Compose, Allocation, Instrument register, Instrument assay and The exit surfaces
Question:    Which instrument is this, at a glance, beside its symbol?
Sections:    unchanged on every surface; the mark joins the row or header that already names the symbol
Components:  Lot mark (new atom, contract added to components.md section 1 before it was built)
Data:        shared/evidence/instrument-logos.json from go run ./server/cmd/capture -logos, which decodes each fixture's TokenMetadata URI, fetches the issuer's metadata JSON and the image it names, and mirrors raster images into clients/web/public/instruments keyed by mint, with source URLs, byte count and SHA-256. 25 of 25 captured on 5 October 2026.
States:      captured shows the mirrored image; every other manifest state (no_metadata, no_image, unreachable, unsupported) and a mint with no entry show the symbol's leading letters on surface.inverse. Loading, empty, stale and error belong to the surfaces the mark sits in, unchanged.
Ceremony:    none
Names:       Lot mark (component); no new user-facing words, the image is decorative and the symbol stays as text
Assumptions: Alloy pages are left without marks: their legs are devnet stand-in mints, which carry no logo, and no record maps a stand-in to its real mint until the Stoic Crew founding record is written. The refused-lot list in Allocation carries no mint, so it stays text only rather than keying a logo by symbol. SVG logos are refused at capture, because one served from Seametry's origin could carry script.
