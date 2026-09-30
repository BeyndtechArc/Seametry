Surface:     Web app (clients/web), every public page, and the sign-in page.
Template:    House rail (components.md), extended with Wallet state; the
             sign-in page keeps its Identity boundary shape.
Question:    Is a wallet connected here, and which? And on sign-in: do I
             need an account, and what can I do with a wallet today?
Sections:    House rail: wordmark; destinations; Wallet state; Mode control.
             Sign in, reordered: 1. what is true now (no account; a
             connected wallet is enough for the Hall demo and the
             Allocation, and signs only what you approve); 2. what signing
             in will add (the existing ceremony steps, unchanged, stated as
             not built); 3. data boundary (updated: the site now remembers
             which wallet you connected, in this browser only).
Components:  Wallet state (new, contract added to components.md first);
             Quiet action; Route action; Stamp; Rule.
Data:        the site-wide wallet session (SiteWalletProvider); detected
             Wallet Standard wallets. No server call, nothing stored off
             the device.
States:      disconnected; no wallet detected; connecting; connected;
             disclosure open and closed. Loading, empty, stale and error do
             not apply: nothing is fetched, and a failed connection returns
             to disconnected with the wallet's own message.
Ceremony:    None.
Names:       "Connect wallet", "Connect <wallet name>", "Disconnect wallet",
             "Connecting". The sign-in page keeps "Sign in" for the future
             session, and no longer shows a Key that cannot be pressed.
Assumptions: 1. The disabled "Sign message" Key is removed: a Key that can
             never be pressed reads as broken, which is what a tester
             reported. The ceremony is still described, as not built.
             2. autoConnect is on (SiteWalletProvider), so a wallet the
             holder already approved on this site reconnects silently;
             wallet-adapter stores that wallet's name in localStorage, so
             the data boundary sentence changes to say so.
