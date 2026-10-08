Surface:     Explorer
Template:    App shell, Allocation order sheet, Catalogue table
Question:    Where do I go, what wallet is connected, and which row opens its record?
Sections:    Top bar for wallet and mode; bottom product tabs on phones; tonal registers; explicit purchase previews
Components:  App shell, Wallet state, Lot mark, Step bar, Filter bar, Decision row
Data:        Wallet RPC holdings with source and observedAt; existing live instrument and Alloy registers; allocation admission snapshot
States:      Disconnected opens detected wallets; loading says wallet; observed balance appears in header; unavailable remains readable in disclosure; empty registers keep existing copy; errors remain in their existing boundaries
Ceremony:    None
Names:       Allocation, Alloy, Instruments, Assay, Connect wallet, Build a basket
Assumptions: A wallet connection is not an account session. The cross-device account and persistent allocation model need authenticated identity and storage, so this pass does not claim either. Execution preflight stays explicit per purchase, with server policy checks still mandatory. The no-wallet phone panel must remain inside the viewport. Product opens dark unless a saved theme choice exists; public pages open light.
