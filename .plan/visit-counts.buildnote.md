Surface:     Explorer (public site and app shell; nothing drawn changes)
Template:    none: the change is the privacy policy's wording and a report the root layout sends, not a view
Question:    How many entries to the site did each page and referral channel receive each day?
Sections:    Privacy policy, section 03: one new paragraph stating what the count keeps. No other section changes.
Components:  none added or changed
Data:        landing_path and ref_code per entry, sent to POST /api/activity/visits, forwarded to the Gateway's /v1/internal/activity/visits; counted in growth.visit_counts for production only
States:      default: an entry is reported once, as a beacon, without waiting.
             loading, empty, stale: not applicable, nothing is shown.
             unavailable: a Gateway with no count configured answers 503 and the web route logs it; the page is unaffected.
             error: a report that fails to send is lost, never retried into the visitor's way.
Ceremony:    none
Names:       none new in the interface
Assumptions: An entry is a page load whose referrer is not this site; nothing is kept in the browser to tell a reload from a new visit, because the 2026-10-16 activity-record decision left device storage for counting visits to a consent decision. A dm-<handle> referral code is counted as dm. The policy's effective date moves to 31 October 2026, the date this ships.
