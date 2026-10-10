Surface:     Mobile app shell and Sponsor
Template:    existing Step track transaction composer and mobile app shell
Question:    Which network will founding use, which wallet can sign, and what balance is available?
Sections:    House rail answers wallet state; page header answers purpose and network; Step track answers progress; bottom rail answers where to go next.
Components:  Page header, Network badge, Wallet state, Figure, mobile route tabs; no new component.
Data:        devnet Hall route, wallet adapter identity, balance atoms and scale, Solana RPC observation.
States:      default shows compact wallet balance; loading names the balance read; empty shows zero; stale is not cached; unavailable names the failure in the wallet panel; error stays in the wallet panel.
Ceremony:    none; founding retains its existing signing ceremony.
Names:       Sponsor, Devnet, Phantom, Solflare, SOL, USDC.
Assumptions: The short Sponsor title applies on mobile and desktop; the browser document title matches. Exact integer balance remains in wallet details, while header strips trailing zeroes. The wallet handoff uses each vendor's documented browse universal link and transfers only the current page URL.
