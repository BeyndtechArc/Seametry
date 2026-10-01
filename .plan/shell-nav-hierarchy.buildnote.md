Surface:     Explorer
Template:    Landing and App shell from references/patterns.md
Question:    Can a visitor move between the public story and the product without shell decoration obscuring navigation?
Sections:    House rail: where can I go; App top bar: what global controls are available; App sidebar: where does the room end
Components:  House rail, App shell, Wallet state, Mode control
Data:        Current public route, current product route and site-wide wallet session
States:      default: text-led public menu and outlined wallet state; loading, empty, stale, unavailable, error: unchanged because shell navigation does not render evidence data
Ceremony:    none
Names:       Home, How it works, The Key, Open app, Connect wallet
Assumptions: A complete public menu means the three primary reading destinations remain visible as text; wallet connection uses the outlined option because it changes session state but moves no custody
