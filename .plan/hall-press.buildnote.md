Surface:     Explorer (the public landing, clients/web)
Template:    Landing, hero
Question:    What does an open creation and redemption loop actually do, and what happens when an issuer freezes one constituent?
Sections:    The hero's right column: the Hall's press (does Strike take exact quantities and Melt always work?), its controls, a live readout and a caption.
Components:  Hero instrument (new, added to components.md first); built with the vendored anatomy kit in clients/web/src/lib/iso.
Data:        lib/hall/recipe.ts (replays shared/spec/recipe/vectors.json); an illustrative Formula of 2 AAPLx, 1.5 NVDAx and 0.25 TSLAx per share at six decimals, the same one the docs' frozen-leg bench uses, labelled illustrative in the caption.
States:      rest with the top share lit; striking; melting; Strike refused while a leg is frozen (HALL.md 4.6, create fails); Melt with a frozen leg (the leg's chit stays filed as a Claim, the others are withdrawn); reduced motion (actions jump to their end, no idle tour); offscreen (tour paused); touched (tour stops).
Ceremony:    None. Motion runs only while an action runs or the idle tour plays on screen.
Names:       Strike, Melt, Claim, Formula, Alloy share; "Issuer freezes NVDAx".
Assumptions: Storm, 12 October 2026: heroes use the anatomy skill. Its kit is vendored as the geometry and SVG writers only; its stylesheet, page builders and blurred halo are cut because they break the design system, and tones map onto surface, text and line tokens. The old Open AP field is removed with its styles and its four layout assertions; the new tests exercise the instrument's behaviour instead. The lid counters were tried and removed: at the canister's size they were illegible, and the readout states quantities exactly.
