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

Copy `clients/web/.env.example` to `clients/web/.env.local` before enabling
features that call external services. The example lists every web variable
without containing credentials. Keep `.env.local` untracked; for a Vercel
deployment, enter the same values in Project Settings > Environment Variables.

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

## The Hall demo, `/hall-demo`

A clickable devnet demonstration of `docs/prd/HALL.md` section 1's first
guarantee: connect a wallet, strike shares in a freshly founded alloy, watch
the mock issuer freeze one constituent, melt, withdraw each leg (the frozen
one refused, the other delivered), watch the issuer release it, withdraw the
rest. Devnet only; the page says so. Never mainnet.

**Environment variables, server-only, never committed.** Their names and safe
defaults are also listed in `.env.example`:

- `HALL_DEMO_FUNDER_SECRET_KEY`: a JSON byte array (the same shape a Solana
  keypair file already is), the fee payer and rent payer for every
  server-built transaction. Deliberately not the deployer key that holds the
  Hall program's upgrade authority (`~/.config/solana/seametry-devnet-deployer.json`):
  a public route handler signing with that key would put a much larger blast
  radius behind one leaked environment variable than a small, dedicated,
  bounded-balance key needs to carry. Generate one and fund it a little on
  devnet:
  ```bash
  solana-keygen new --no-bip39-passphrase --outfile /tmp/funder.json
  solana transfer $(solana-keygen pubkey /tmp/funder.json) 1 --url devnet \
    --keypair <a devnet wallet you already control> --allow-unfunded-recipient
  cat /tmp/funder.json   # paste this array as the env var's value
  ```
- `HALL_DEMO_ISSUER_SEED`: any random string of at least 32 bytes (for
  example `openssl rand -base64 32`). `src/lib/hall/issuer.ts` derives the
  mock issuer's signing key from this seed plus each alloy's id, so a
  stateless serverless function can sign a later freeze or thaw for the same
  alloy without a database. Changing this seed orphans every alloy founded
  under the old one: their frozen legs can never be thawed again, since the
  issuer key that could thaw them can no longer be derived.

The IDL at `src/lib/hall/idl.json` is generated (`anchor idl build`, run in
`chain/`), not hand written: `chain/target/` is gitignored, so it cannot be a
build-time fetch the way the fonts above are. Regenerate it the same way if
`chain/programs/hall`'s accounts or instructions change.

**Proving it, beyond `tests/csp.spec.ts`** (which only proves the page loads
under the real CSP with no violation): `scripts/hall-demo-devnet-proof.ts`
drives the exact library code the browser runs (`src/lib/hall/*`, not a
reimplementation) against real devnet, with a real holder keypair standing in
for a connected wallet's signing. Needs a funded holder keypair
(`~/.config/solana/seametry-devnet-demo-holder.json` by default, or pass a
path) and the two env vars above:
```bash
npx tsx --env-file=.env.local scripts/hall-demo-devnet-proof.ts
```
This does not drive an actual browser click sequence through a wallet
extension; `tests/csp.spec.ts` covers the page's own loading and headers
separately. Together they cover the two things that can go wrong; neither
alone would.

## The Allocation, `/allocation`

Mainnet. Buys lots the policy engine admitted into the connected wallet,
one Jupiter swap per lot, with the holder signing every leg. Seametry holds
nothing; its routing fee is a line on the order sheet (see
`ALLOCATION_FEE_WALLET` below). Which lots are offered comes from
`shared/evidence/admissions.json`, which the policy engine writes
(`go run ./server/cmd/explorer -admissions shared/evidence/admissions.json`)
and CI checks for drift; this app decides nothing about admission itself.

Execution runs in this app's route handlers (`src/app/api/allocation/*`,
`src/lib/allocation/*`) under ENGINEERING_STANDARD section 11, until the Go
Execution service exists (API.md step A7): no key held, quote expiry checked
when a leg is prepared and again when it is sent, a program allowlist before
the wallet sees anything, a mainnet simulation shown before signing, and an
approval that refuses any transaction other than the one simulated.

**Environment variables, server-only, never committed.** Until the first
five are set the page says which are missing and nothing can be bought.

- `JUPITER_API_KEY`: the same key the Go liquidity client uses.
- `MAINNET_RPC_URL`: a mainnet RPC that accepts `simulateTransaction` and
  `sendTransaction`. The public endpoint rate limits hard; a provider's is
  better.
- `ALLOCATION_APPROVAL_SECRET`: a value generated by this deployment, not a
  provider credential. Generate 32 random bytes with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  It signs approvals; rotating it only invalidates legs prepared but not yet
  sent.
- `ALLOCATION_FEE_WALLET`: the mainnet wallet that receives the routing fee
  (`ROUTING_FEE_TIERS` in `src/lib/allocation/rules.ts`, by how many
  constituents the plan buys),
  paid in USDC into that wallet's USDC account. The account must already
  be open; every leg is refused, naming it, while it is missing.
- `ALLOCATION_BLOCKED_COUNTRIES`: comma separated ISO country codes, from
  each issuer's actual terms of eligibility. This is an operator compliance
  policy, not a value obtained from Vercel or an API, and the repository does
  not invent a default. Unset means nothing can be bought: the gate fails
  closed. It reads `x-vercel-ip-country`, which Vercel sets and a client cannot
  forge there; on any other host it could be forged.
- `ALLOCATION_ASSUME_COUNTRY`: local runs only, where no host sets the
  country header.

What it can offer is whatever the snapshot admits; the snapshot is the
record, so this file names no instruments. Offering another instrument needs
it added to `shared/fixtures/mainnet/targets.json`, captured
(`go run ./server/cmd/capture`), measured (`go run ./server/cmd/depth`, with
a Jupiter key), and the snapshot regenerated.

Not yet proven against mainnet from the environment that wrote it: Jupiter
and mainnet RPC were unreachable there, so the first real prepare, sign and
send is the first end to end run. The pure rules are tested in
`tests/allocation-rules.spec.ts`.
