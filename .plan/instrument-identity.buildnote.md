Surface:     Responsive web app: Instruments, Holdings, Allocation builder, every lot mark
Template:    Register page (Instruments), tabbed account page (Holdings), existing Allocation builder
Question:    Which instrument is this, who issues it, and where does each row lead?
Sections:    Instruments: Tabs by assay state with counts, a provenance line, search and issuer filter, one List, pager. Holdings: Tabs for Positions, Allocations and Activity, each one List or the Activity timeline.
Components:  Page header (title only, view Tabs as its edge), Tabs, List, Identity, Icon button, Callout, Depth chart, Filter bar (registered in components.md); Activity list
Data:        Every listing's name and metadata URI read from its mint by go run ./server/cmd/survey -listings (2,621 on 14 October 2026); logos mirrored by go run ./server/cmd/capture -logos (2,608 captured, 6 refused, 7 unreachable), rasters reduced to 128px with the issuer's digest kept; assay state from the committed admissions snapshot
States:      A condition of the whole page is a Banner with its action (no wallet, purchases closed); a fact inside the content is a Callout (nothing held, not assayed, a failed read, an empty view). Loading names what is read; empty says why (nothing matches the search, or no listing in this state); a mint whose metadata names nothing reads "No name in the mint's metadata"; a missing logo draws the lettered tile without a failed request
Ceremony:    None.
Names:       Instruments, Available, Assayed, Not assayed, Holdings, Positions, Allocations, Activity
Assumptions: The issuer's own suffix (" - Backpack Securities", " xStock") is removed from names because the issuer is shown once beside them; measured on every name in the 14 October listings. The register no longer lists the live Gateway's records separately; an instrument's page still reads the Gateway live. The Page header keeps Storm's no-subtitle rule, so the listing count sits under the list as its provenance.
