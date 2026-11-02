Surface:     Explorer (every public page's foot; the header wallet chip; every Key)
Template:    none: three fixes to existing components
Question:    Does the house name close the page leanly, does the wallet panel close once nothing is held, and does a blocked Key read as one unavailable control?
Sections:    none added or changed
Components:  Closing wordmark (letters as fine stripes), Wallet state (panel closes when nothing is held), Key (blocked icon cell), Connect modal (Google's own mark; a Google sign-in that does not start is shown in words with Try again)
Data:        none rendered
States:      Key blocked and busy change; Wallet state signed out with no wallet changes; the rest unchanged.
Ceremony:    none
Names:       none new
Assumptions: "Chopped in a very lean way, the stripes are tiny" is read as thin horizontal lines with wider gaps: a 1.5 unit line every 6 units of the 1600-wide frame, about 1.2px every 4.8px at 1280 wide, in the middle disc's green so thin lines still read in dark mode. "The popup" is the header wallet panel: once a wallet is disconnected with no session, or a session ends with no wallet, its chip opens the connect modal instead of toggling, so the open panel could not be closed; it now closes itself. "Form buttons with a light icon" is the blocked Key, found by scanning every public and app route in both modes for icons under 3:1 against their cell: Send feedback and Keep my address on /feedback, the only hits; the fix is in the Key, so every blocked Key changes. The modal's Google row takes Google's four-colour G as a static file, as wallets show their own marks, because Google's branding requires it; the Phosphor glyph it replaces had no other use and is removed. The modal discarded the result of starting Google sign-in, so a failure showed nothing; a problem now records whether a wallet or Google stopped, and Try again repeats that way. The /sign-in page's Google action is unchanged.
