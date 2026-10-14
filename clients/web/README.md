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

## The devnet Hall: Compose, Strike and Melt

`/app/compose` founds Alloys on the register's devnet Hall, and each Alloy's
page under `/app/alloys` Strikes and Melts them. Devnet only; every page says
so. Never mainnet. The clickable demo that once lived at `/hall-demo` was
retired on 8 October 2026 and its address now lands on `/app/alloys`; its
recorded run stays as evidence in `shared/evidence/hall-demo/`, which the
landing page and `/papers/the-exit` read.

**Environment variables, server-only, never committed.** Their names and safe
defaults are also listed in `.env.example`; the names still carry the demo's
prefix.

- `HALL_DEMO_FUNDER_SECRET_KEY`: a JSON byte array (the same shape a Solana
  keypair file already is), the fee payer and rent payer for every
  server-built transaction, such as the stand-in mints a founding or a Strike
  needs. Deliberately not the deployer key that holds the Hall program's
  upgrade authority (`~/.config/solana/seametry-devnet-deployer.json`): a
  public route handler signing with that key would put a much larger blast
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
  stand-ins' mock issuer key from it, so a stateless serverless function can
  sign for them later without a database. Changing it orphans every stand-in
  minted under the old seed: no key could freeze or release them again.

The IDL at `src/lib/hall/idl.json` is generated (`anchor idl build`, run in
`chain/`), not hand written: `chain/target/` is gitignored, so it cannot be a
build-time fetch the way the fonts above are. Regenerate it the same way if
`chain/programs/hall`'s accounts or instructions change.

**Proving it against devnet**: `scripts/register-founding-devnet-proof.ts` and
`scripts/register-strike-melt-devnet-proof.ts` drive the same library code the
routes run, with a fresh keypair standing in for the sponsor's or holder's
wallet. They work on the scratch Hall by default, so proving a flow adds
nothing to the register; pass `--hall register` to act on the register itself.

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
Execution service exists (API.md step A7): no customer key held, quote expiry checked
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

### Helius Sender delivery

Purchases, single sales and Sell All share this delivery path. It needs no
variable of its own: with `MAINNET_RPC_URL` a keyed HTTPS Helius RPC URL, the
Sender endpoint is derived from that key. Never use `NEXT_PUBLIC_`.

- `HELIUS_SENDER_URL`: optional override, set in the **web deployment's
  server environment** (Vercel for the current web app). It must be a keyed
  HTTPS Helius Sender `/fast` endpoint, such as
  `https://sender.helius-rpc.com/fast?api-key=YOUR_KEY&swqos_only=true`; the
  code enforces `swqos_only=true` for its 5,000-lamport tip, and a malformed
  override fails rather than silently running without it.

Each Sender leg tips 0.000005 SOL from the holder's own wallet, as the last
instruction of the swap the holder signs, so there is one signature and no
Seametry wallet to fund or watch. Seametry bears the tip by lowering that
leg's routing fee by the tip's worth: one Jupiter quote of 1 SOL in USDC,
reused for a minute, prices it, and the fee comes down by that many basis
points rounded up, never below zero. A sale's fee is taken from the USDC it
receives, so a sale is quoted once at the full tier to size the reduction,
one more Jupiter request per sale. The order sheet shows the lowered rate,
the reduction, and the tip in SOL.

The customer pays account-opening rent, the 5,000-lamport signature fee, the
quoted priority fee and the tip, all in SOL, and the funding check includes
each of them.

No Sender endpoint, or a route too large for the 1,232-byte packet, uses the
existing RPC path; such a leg keeps the lowered fee it was quoted at. RPC legs in one execution
are sent sequentially, at least 1.1 seconds apart; Sender legs can submit
together. This pacing is per execution, not a project-wide rate limiter.
Signed preflight, message approval, issuer policy and quote expiry remain
enforced. Ambiguous responses keep watching the original signature; they do
not authorize another purchase. Sender does not guarantee inclusion, make
a basket atomic, or remove the wallet's signing requirements.

Provider reference, checked 14 October 2026:
[Helius Sender](https://www.helius.dev/docs/sending-transactions/sender).
Offline regressions live in `tests/sender.spec.ts` and
`tests/allocation-rules.spec.ts`. Run `npx playwright test` from this folder;
its fixture blanks the sponsor secret and never sends a mainnet transaction.
For the isolated Sender rules, run
`npx playwright test --config=playwright.sender.config.ts` without a build
or browser. Transport tests use injected responses, not a live Sender.

What it can offer is whatever the snapshot admits; the snapshot is the
record, so this file names no instruments. Offering another instrument needs
it added to `shared/fixtures/mainnet/targets.json`, captured
(`go run ./server/cmd/capture`), measured (`go run ./server/cmd/depth`, with
a Jupiter key), and the snapshot regenerated.

Sender delivery is verified with offline transaction and browser fixtures.
A funded, user-approved mainnet smoke test is still required for this
integration; these tests do not establish live inclusion rates or reproduce
Phantom and Solflare's actual mobile signing screens.
