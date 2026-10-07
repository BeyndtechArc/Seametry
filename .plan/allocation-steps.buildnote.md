Surface:     Mobile and desktop web, Allocation; the shape the mobile app follows
Template:    Allocation, now a stepped flow beside a persistent order sheet on wide screens
Question:    One question at a time: which constituents, how much, then is this the purchase to sign?
Sections:    Step track (Choose, Buy) on one dashed trace; the current step's content; a step bar pinned to the view's bottom
             (Back, the plan in one line, Continue). Review carries the order sheet inline on a narrow screen.
Components:  Step track and Continue (new, added to components.md first); Filter bar; Mark line; Field; Order sheet; Key
Data:        unchanged: admissions snapshot, the user's choices, prepared legs from /api/allocation/prepare
States:      each step current, finished (a way back) or ahead (inert); Continue unavailable with its reason in the bar;
             Back unavailable once a purchase has started; Review only reachable with a valid plan
Ceremony:    none here; signing keeps the Key
Names:       Choose, Amount, Review; Set amount; Review purchases; Back
Assumptions: Storm, 7 October 2026: steps for Allocation everywhere so web and mobile share one shape; Compose stays one page.
             Nothing starts chosen: choosing is the first step's whole question, and 23 preselected stocks fought it.
             The phone's order sheet dialog is gone: the Review step shows the sheet where signing happens.
             The step bar's old 112px phone offset assumed a bottom navigation the shell does not have; it pins to 0.
             Revised the same day at Storm's direction: two steps, Build (choose, with the amount in the bar beside the
             list it divides) and Review; the underlined track becomes numbered marks on a dashed trace, solid behind
             a finished step; the bar's padding tightens.
             Revised again: Storm meant the amount and the purchase reviews as one step. Steps are Choose and Buy,
             the amount at the head of Buy with each purchase under it; the footer is plain Back, plan and Continue.
