Surface:     Web sign-in
Template:    existing public access panel
Question:    What does an account open, and which wallet owns the Allocation?
Sections:    account choice and status; account versus wallet boundary; stored data
Components:  existing ContinueAction, QuietAction, RouteAction, TextAction
Data:        authenticated session email, provider status and server configuration
States:      signed out, signed in, loading, unavailable, provider error, deletion error, wallet proof error
Ceremony:    none
Names:       Account, Allocation, wallet, Google
Assumptions: Social sign-in starts with Google once credentials and database exist. Wallet linking requires a single-use challenge and wallet signature. Saved allocations are subsequent work. The account never signs a wallet transaction.
