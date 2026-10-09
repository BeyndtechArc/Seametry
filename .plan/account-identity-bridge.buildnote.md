Surface:     Web account and Gateway identity boundary
Template:    existing account boundary; no visible composition changes
Question:    Can the signed-in account call the Go core without exposing profile data or trusting an account ID supplied by the browser?
Sections:    no visible sections changed; Better Auth issues a short-lived subject token and the Go identity boundary verifies it
Components:  none
Data:        opaque Better Auth account subject, issuer, audience, expiry and published signing key ID; no email, name or image enters the service token
States:      valid, missing, malformed, expired, wrong issuer, wrong audience, unknown signing key and rotated signing key
Ceremony:    none
Names:       Account, wallet, Formula, Allocation
Assumptions: Google remains the account entry method already configured by Storm. A service token identifies the account only. Saved Formulas remain owned by Basket, and execution records continue to name one wallet and network.
