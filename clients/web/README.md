# clients/web

The Terminal and the business pages, one Next.js app. The Explorer is not
here: it stays its own static site, deployed separately, for the reasons in
`docs/decisions/2026-09-27-explorer-stays-separate.md`.

## What owns what

- `docs/prd/SITE.md`: the business pages.
- `docs/prd/TERMINAL.md`: the signed-in console.
- `docs/prd/API.md`: what this app is a client of. It computes nothing itself.
- `.claude/skills/seametry-design/`: every executable design decision.

## Run it

From the repository root, since the workspace's dependencies are installed
there (`docs/decisions/2026-09-27-repository-layout.md`):

```bash
npm install
npm run fonts --workspace=clients/web   # fetches Sentient, Switzer, Fragment Mono; see clients/web/fonts/README.md
npm run dev --workspace=clients/web
```

## Before calling a change done

```bash
npx tsc --noEmit                                          # from clients/web
npx eslint .                                               # from clients/web
npx next build                                              # from clients/web
npx playwright test                                        # from clients/web; proves the CSP holds in a real browser
node .claude/skills/seametry-design/scripts/design-lint.mjs clients/web   # from the repository root
```

## The Content-Security-Policy

Set in `src/proxy.ts`, a fresh nonce per request, no `'unsafe-inline'`. Every
route calls `connection()` (see `src/app/page.tsx`) to force dynamic
rendering; without it, the nonce is baked into a statically prerendered page
and reused on every request, which is not a nonce. `tests/csp.spec.ts`
checks this against a real, running build in headless Chromium, not by
reading the header value in isolation: it is what caught the inline
hydration script problem in the first place.

## Fonts

Fetched, never committed, see `fonts/README.md`. `next/font/local` is proven
to serve them byte for byte unmodified, matching the licence's ban on
subsetting; see the same decision record above for how that was checked.
