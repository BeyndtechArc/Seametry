> **Living document. Owns:** the public docs at `/docs` in `clients/web`: what they are for, how they are built, the page tree, and the pages that explain the mechanism (how it works, the Key, the exit).
> **Does not own:** the landing page and legal pages (`SITE.md`), the thesis and its standalone page at `/thesis`, linked from the tree (`../THESIS.md`), the Explorer's evidence pages (`EXPLORER.md`), naming and voice (`../BRAND_AND_WORLD.md`, `../STORM-VOICE-SYSTEM.md`), or the component contracts the docs are drawn with (`.claude/skills/seametry-design/references/components.md`). Engineering documentation stays in `docs/` and its owner map in `../README.md`.
> **Phase 1.** Ships in `clients/web`. Built in phases from 12 October 2026; the shell, page tree, search and the three migrated pages are live.

# Docs

One place where Seametry explains itself to buyers, sponsors and anyone
checking its work: what it does, what each word on a screen means, what happens
to their money at each step, and how to verify a claim without asking. Before
this document, those explanations lived on separate business pages and in Info
notes across the product, and could disagree.

## 1. How the docs are built

- **Inside the web app**, at `/docs`, so a page can mount the product's real
  components and read the same evidence the product reads. A separate docs site
  could only show pictures of them, and pictures go stale.
- **Content pipeline only from Fumadocs** (`fumadocs-core`, `fumadocs-mdx`, MIT,
  pinned exactly to releases at least two weeks old when adopted). Every visible
  element is drawn by `@seametry/ui` and tokens. A packaged docs theme writes
  inline `style` attributes, which the per-request nonce policy in
  `clients/web/src/proxy.ts` refuses; `tests/csp.spec.ts` covers every docs
  route so that stays true.
- **Pages are MDX** under `clients/web/content/docs`, with the tree in
  `meta.json`. A page whose sentences interpolate evidence stays a TypeScript
  route inside the docs layout and joins the tree as a link entry, so no
  generated figure is ever retyped into prose (the exit, below).
- **Search** runs on an index built from the compiled pages inside the
  deployment (`/api/docs/search`). No query reaches a third-party service.
- **Generated, not written.** A page stating figures that come from data is
  generated from that data, with a drift check in CI, as the admissions
  snapshot has today.

The docs components (page tree, contents rail, search) are specified in
`components.md`.

## 2. Pages

### How it works (`/docs/how-it-works`)

Answers, in order: what a tokenized stock actually is (a claim, not the
underlying), why a bundle of them is not an ETF, and how the Hall's open
authorized participant set differs from a closed one. Each claim must be
literally true of the shipped product, per `foundations.md` section 1, law 5.

### The Key (`/docs/the-key`)

A still page, no motion at all, naming the program ID, the upgrade authority,
and either the transaction that made the program final or the words "Key still
in hand." The program ID is the register Hall the product reads
(`REGISTER_HALL_PROGRAM_ID`), from one constant that feeds both the stated fact
and the link to inspect it. The upgrade authority is read from devnet on every
visit (`clients/web/src/lib/hall/authority.ts`, the upgradeable loader's
programdata account), shown with its slot, time and source; when devnet does
not answer the page says "No observation" and why, and never falls back to a
written state (Storm, 12 October 2026). The same observation fills a
`solana program show` block a reader can run to compare, and an upgrade bench
that models the loader's rule against the observed authority. The Hall's three guarantees are stated word for word
from `HALL.md` section 1, matching how `MOBILE.md` section 10 requires the same
sentence in the app's own About screen. One sentence, the same everywhere it
appears, is what makes it a guarantee rather than a claim that drifts by
surface.

### The exit (`/docs/papers/the-exit`)

Answers what happens to a basket's exit when an issuer exercises a power over
one constituent, and how the Hall settles redemption into claims so one leg
cannot revert the rest. It is Storm's paper, made canon on 5 October 2026.
Every figure in it, the survey counts, the depth captures, the admission counts
and the recorded devnet freeze run, is read from `shared/evidence/` through
`clients/web/src/lib/papers/the-exit.ts`; the prose types no number of its own,
so a new capture changes the figure and leaves the argument standing. Earlier
captures stay dated beside newer ones rather than being replaced.

## 3. Addresses

The pages lived at `/how-it-works`, `/the-key` and `/papers/the-exit` until
12 October 2026. Those addresses redirect temporarily (307) to the docs, tested
in `tests/public-site.spec.ts`, and become permanent (308) after Storm's
read-through; a 308 is cached by browsers for good.

## 4. What does not exist yet, and what unlocks it

| Section | Trigger |
|---|---|
| Baskets, the assay, the Hall and Alloys, verifying evidence | Written page by page, each with its artifacts, in the order the build plan sets |
| Generated reference (words, reason codes, fees, admitted lots) | The generator and its CI drift check land together |
| Public API | The public API ships (`API.md`); none is documented while it is incomplete |
