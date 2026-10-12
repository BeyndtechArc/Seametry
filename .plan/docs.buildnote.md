Surface:     Explorer (the web app's public pages; the docs live in clients/web at /docs)
Template:    new: a reading page with a page tree, an on-page contents rail and search. No existing template carries a tree of pages; Glossary term and Hallmark are single reads. Justified in .plan/docs-site.plan.md.
Question:    What does Seametry do, what does each word on a screen mean, and how do I check it myself?
Sections:    Phase 0 only: one MDX page (what the docs are and how they are organised), its title and contents rail, the page tree, and a search endpoint. Phase 1 adds the shell (sidebar, search field, previous and next).
Components:  Page header pattern without the Network badge (docs act on no cluster); Rule; Text action for cross-references. New components (Docs page tree, Docs contents rail, Docs search) are added to components.md in phase 1, before they are built; phase 0 renders plain semantic lists so it adds no unnamed component.
Data:        MDX under clients/web/content/docs, compiled by fumadocs-mdx 15.4.5 through its macro, indexed by fumadocs-core 16.15.15 (pinned to releases at least two weeks old on 12 October 2026). No market figure appears in phase 0.
States:      default (page renders); unknown slug (the house 404, as every route); search with no match (an empty result list, which phase 1 states in words); loading and error are the route's own boundaries, since pages are server-rendered from compiled MDX.
Ceremony:    None.
Names:       Docs (navigation); page titles in sentence case from the register in foundations.md.
Assumptions: The per-request nonce policy in proxy.ts is the constraint: phase 0 is done when tests/csp.spec.ts covers /docs and passes. Migrated pages redirect with 307, not the 308 the plan first said, following next.config.ts: a 308 is cached by browsers for good.
