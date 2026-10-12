# Seametry docs: one place that explains everything

Status: approved by Storm, 12 October 2026, with the decisions recorded at
the end. Phases 0 and 1 done (12 October 2026); phase 2, the generated
reference, is next. Not done from phase 1: cutting product Info notes to one
line plus a docs link waits for the pages those links would point at.

## Decision

Docs live inside the web app at `/docs`, on `fumadocs-core` (headless: MDX
pipeline, page tree, table of contents, static search index) with every
visible element drawn by `@seametry/ui` and tokens. Langfuse's docs
(github.com/langfuse/langfuse-docs, MIT, Next 16 on Fumadocs) are the
reference for information architecture and reading patterns, not a code
dependency.

Why headless rather than `fumadocs-ui` or a separate Nextra site:

- The web app sends a per-request nonce policy
  (`clients/web/src/proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`,
  `style-src 'self' 'nonce-…'`). `style-src` without `'unsafe-inline'`
  refuses every inline `style` attribute, and packaged docs themes write them
  and inject an unnonced theme script. `tests/csp.spec.ts` would fail, and it
  should. The Explorer was split out on 27 September 2026 over exactly this
  class of conflict (`docs/decisions/2026-09-27-explorer-stays-separate.md`).
- A packaged theme is a second design system. Ours fails the build on a
  violation; a borrowed one would need overriding forever.
- Inside the app, a page can mount the real components and read the real
  evidence. A separate site can only screenshot them, and screenshots go
  stale.

Proven in phase 0 (12 October 2026): `fumadocs-core` 16.15.15 with
`fumadocs-mdx` 15.4.5, pinned exactly as the newest pair public for at least
two weeks (27 and 25 September; the mdx package declares `fumadocs-core
^16.15.3`, so the differing majors are a designed pair). They build under Next
16.3.6 from the TypeScript `next.config.ts` through the `fumadocs-mdx/macro`
API, with no generated source folder. `/docs` passes `tests/csp.spec.ts` with
no policy violation or console error, and `/api/docs/search` answers from the
compiled pages. npm held back esbuild's install script; the build does not
need it.

## Reader and job

For buyers, sponsors and anyone checking our work: what Seametry does, what
each word on a screen means, what happens to their money at every step, and
how to verify a claim without asking us. Engineering docs in `docs/` keep
their reader (whoever changes the code) and their owner map in
`docs/README.md`; nothing moves out of `docs/`.

## Ownership changes (one subject, one owner)

| Today | Becomes | Old URL |
|---|---|---|
| `/how-it-works` (5 sections) | `/docs/how-it-works` | 307 to new |
| `/the-key` (4 sections) | `/docs/the-key` | 307 to new |
| `/thesis` (13 sections) | stays at `/thesis`, linked from Papers | unchanged |
| `/papers/the-exit` | `/docs/papers/the-exit` | 307 to new; 308 only after the read-through, since browsers cache a 308 for good (next.config.ts) |
| Info notes in the product that explain mechanics | one sentence plus a Text action to the exact anchor | n/a |
| `docs/prd/SITE.md` owns "how it works, the Key" | SITE.md hands those to a new `docs/prd/DOCS.md`, which owns the docs product | n/a |

`/patterns` (the component bench) stays where it is: it is a tool for us, not
an explanation for readers. Terms and privacy stay legal pages.

Every redirect gets a test in `tests/public-site.spec.ts`, so no inbound link
dies silently.

## Information architecture

Sidebar groups, in reading order. Each page names the one question it
answers, as every section in the product does.

1. **Start**
   - What Seametry is: direct-wallet baskets and Alloys, in one page
   - Your first basket: connect, choose an amount, sign once, see it settle
   - Words on the screen: the register (Allocation, Alloy, Grade, Stamp,
     Claim, Melt, Strike), generated from `foundations.md` section 3
2. **Baskets (Allocation)**
   - Published baskets and how they are chosen (methodology rule 0.1)
   - Buying a basket: preflight, one wallet approval, independent legs,
     partial settlement and what to do about it
   - Building your own
   - Fees and slippage: the routing fee schedule, from `lib/allocation/rules`
   - Holding and exiting: holdings, Sell All, attribution
   - Phones: the wallet hand-off and why the plan travels in the URL
3. **The assay**
   - What we capture and why: mint bytes, issuer powers, depth at size
   - Grades: Entitlement, Certificate, Interest, Ungraded
   - Stamps: ALLOW, WARN, BLOCK, and every reason code
   - Capacity: how a lot's purchase ceiling is measured
   - Scaled UI multipliers and why a wallet may show a different number
4. **The Hall and Alloys**
   - The mechanism: Strike, Melt, Claims, delivery
   - The Key: what the Hall can never do
   - Sponsoring an Alloy
5. **Verify it yourself**
   - Receipts and hallmarks: what is sealed and how to check one
   - The Explorer: what it shows and what it cannot claim
   - Recapturing our evidence: the commands, no credentials needed
6. **Papers**: the thesis, the exit
7. **Changelog**: dated entries, real dates only

## Artifacts

An artifact is a working instrument on the page, fed by the same code or
evidence the product uses. If it is not fed that way, it does not ship.

| Artifact | Page | Fed by | Interaction |
|---|---|---|---|
| Purchase replay | Buying a basket | the real `AllocationMotion` and leg phases, scripted | step through preflight, approval, settle, a refused leg, a partial outcome |
| Depth at size | Capacity | `shared/fixtures/jupiter/*` for every captured lot | pick a lot, read the rate at 100, 1,000 and 10,000 USDC against the 100 basis point ceiling |
| Stamp bench | Stamps | `server/internal/policy` reason table, generated to JSON | toggle issuer powers and depth facts, watch the Stamp and reasons change |
| Reason code reference | Stamps | generated from `policy.go` (38 codes today) | anchors the product links to from every refused row |
| Fee calculator | Fees | `routingFeeBps`, `routingFeeAtoms`, `splitEvenly` | amount and constituent count in, exact atoms out, no floating point |
| Basket plate | Published baskets | `BasketPlate` | change constituents and admission, see sockets fill |
| Strike and Melt machine | The mechanism | Hall program constants | isometric figure: deposit legs, strike a share, melt one back (the anatomy skill, once installed) |
| Receipt check | Receipts | `shared/tools/spec/verify-receipts.mjs` logic, in the browser | paste or pick a sealed receipt, see each check pass or fail |
| Multiplier explainer | Scaled UI | `amount.FromFloat64Exact` boundary, captured multipliers | raw atoms against what a wallet displays |

Every figure an artifact shows carries source, age and evidence state, as the
product does. Charts follow the dataviz skill and our tokens.

## Generated, not written

Following "prefer a generated artifact to a written one": the register of
words, the reason codes, the fee table, the admitted-lot list and the depth
tables are emitted from code or evidence at build time. A CI step fails if
the generated docs differ from their sources, as the admissions drift check
does today.

## Reading surface

From Langfuse's docs, adapted to our system: a left page tree, an on-page
contents rail, full-text search (`fumadocs-core` static index, no third-party
service), "Was this page useful" omitted (no data store for it yet), previous
and next links, copy-link anchors on every heading, and code blocks with a
copy action. Callouts use existing components: Info note, Stamp, Claim line.
Display serif for page titles, `size.readable` measure for prose, both modes
complete.

This is also where the requested surface steps land: docs need a sunken
surface (code, artifact wells) and a feature surface (page heroes, the paper
openers). They are added to the token file as named steps with measured
contrast, in the same change that first uses them, not as unused tokens.

## Phases

0. **Proof under our policy.** `fumadocs-core` and `fumadocs-mdx` in
   `clients/web`, one MDX page, search, the page tree, built and served under
   `proxy.ts`. Done when `tests/csp.spec.ts` covers `/docs` and passes. If it
   cannot pass, stop and report; the fallback is MDX through `@next/mdx`
   with our own tree and a build-time search index.
1. **Shell and migration.** Docs layout, sidebar, contents rail, search,
   the four migrated pages with redirects and their tests, `DOCS.md` and
   the SITE.md ownership edit, Info notes cut to one line plus a link.
2. **Generated reference.** Words, reason codes, fees, admitted lots, with
   the drift check in CI.
3. **Artifacts.** In the order above; each lands with its page and a test.
4. **The rest of the tree.** Remaining pages, changelog, then a read-through
   by Storm before the old pages' redirects ship to production.

Each phase is one reviewable change with its own build note, gate answers
and CI run read back from GitHub.

## Decided (Storm, 12 October 2026)

1. `/thesis` stays a standalone page. The docs link to it from Papers; it is
   not migrated or redirected. The ownership table above is amended to match.
2. The Explorer stays on Cloudflare Pages. Docs link to it, and embed an
   Explorer view only where a page needs the reader to see the evidence in
   place; otherwise a link, or a redirect where a docs URL would duplicate it.
3. No API section while the API is incomplete (`docs/prd/API.md`: step A0
   built, the rest specified). It is added when the public API ships.
