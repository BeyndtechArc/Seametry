> **Living document. Owns:** the Hall on-chain program: guarantees, instructions, state, arithmetic, issuer prerogative handling, versioning, and the devnet demonstration.
> **This is the product, not a later addition.** The devnet program and its demonstration are phase 1 and carry no legal gate, because no real money is involved. Only the mainnet deployment is phase 3, gated by a crypto securities legal read and a program audit, in that order. See `../PRODUCT_ARCHITECTURE.md` section 9.
> **Lending constituents is excluded.** It breaks guarantee 1, breaks the balance invariant in section 4.2 (an outgoing loan is indistinguishable from a seizure to `sync`), and breaks the argument in section 8.

# PRD 2: The Hall

The keyless basket program. Revision 3. Supersedes the vault PRD entirely.

---

## 1. Three guarantees

Every design decision below exists to make these literally true.

**The melt always works. Delivery is each issuer's.**
Burning shares for a claim on the constituents can never be blocked by anyone. Delivering each constituent is subject to that constituent's issuer, and the Hall says so rather than pretending otherwise.

**The Hall adds no prerogatives of its own.**
The share mint has no freeze authority, no permanent delegate, no pause, no hook. No instruction lets anyone alter a formula, move a holder's assets, or stop a melt.

**The Hall never needs a price.**
Strike and melt move quantities. No oracle, no quote, no NAV is an input to any instruction. Price manipulation cannot touch minting, and the Hall keeps working when every price source is down.

---

## 2. Why it anchors the product

Before ERC-4626, every Ethereum yield vault had its own interface and nothing composed. A standard made the category interoperable. Equity baskets on Solana have no equivalent. Built correctly, the Hall is an interface proposal, not a product: every issuer and protocol that wants basket exposure has a reason to build against it rather than invent their own.

It is also the seamless path, structurally. A holder of the constituents strikes in one transaction regardless of how many constituents there are. And once a share pool exists, a retail buyer acquires the whole basket in a single swap, exactly as exchange-traded funds work: most buyers trade shares, and creation and redemption are how arbitrage keeps the price honest.

---

## 3. What research changed

Four findings, each of which broke an earlier draft.

**Issuers hold live powers over tokens inside the Hall.** As reported in July 2025, xStocks mints carry PermanentDelegate, FreezeAuthority and Pausable, with Transfer Hooks initialized but disabled. An issuer can freeze the Hall's account, pause the mint everywhere, or take tokens out of the Hall. An atomic "redeem the whole basket in one transaction" cannot be guaranteed when any single leg can be blocked. Hence the two-phase melt.

**Dividends arrive two different ways.** xStocks reinvests through the Scaled UI multiplier, changing no raw balance. Backpack describes dividends as automatically reinvested into additional tokenized shares; whether that is a multiplier change or new tokens minted into holders is unconfirmed. A Hall that ignored raw balances, as the previous draft specified, would strand every dividend paid the second way. Hence sync.

**Share inflation is a proven attack on vaults and on lenders that price them.** Donating assets directly to a vault inflates share price when shares are priced by ratio; the Venus exploit of February 2025 used a donated 439,000 USDM to inflate a vault's share price roughly 1.7 times and extract value through liquidations. Hence minting by shares, a locked genesis, and vested upward credits.

**Transactions have a hard account ceiling.** Solana enforces 64 accounts per transaction; 128 only if a currently inactive feature is activated, and the larger v1 transaction format raises byte size but no account, compute or instruction limits. Hence at most twelve constituents.

---

## 4. Mechanics

### 4.1 Recipe, not weights

An alloy is defined in quantities, the way exchange-traded fund creation units are. Each share represents fixed raw units of each constituent. There is no rebalancing inside an alloy: no trades, no discretion, no price. Value weights drift as prices move, and that is stated, not hidden. A new formula is a new alloy.

### 4.2 State

**Alloy** account, one per instance:
- sponsor, sponsor mark hash, program version, created at
- share mint, share supply, locked genesis shares
- up to twelve constituents, each: mint, token program, Hall token account, `ledger`, `pending`, `vest_start`, `unclaimed`

**Claim** account, one per alloy per owner: units owed per constituent.

**Invariant** after every sync, per constituent: `actual balance == ledger + pending + unclaimed`.

### 4.3 Instructions

Named literally. The world names live in the interface, never in a standard's interface.

| Instruction | Does | Touches constituent mints |
|---|---|---|
| `initialize_alloy` | registers formula from the sponsor's genesis deposit; locks genesis shares permanently; verifies every Hall token account is usable | yes |
| `create` | syncs, then pulls exactly the required units for `n` shares, bounded by the caller's maximums, then mints | yes |
| `redeem` | syncs, burns shares, credits the caller's claim with every leg | **no** |
| `withdraw` | delivers one leg of a claim | yes, one |
| `sync` | reconciles one constituent's ledger with its actual balance | reads only |

`redeem` touching no constituent mint is what makes the first guarantee true. No freeze, pause or hook can reach it.

### 4.4 Arithmetic

Specified in PRD 0, `packages/recipe`, with shared test vectors. In short: required inputs round up, outputs round down, every rounding favours the Hall, all intermediates are u128.

**Mint by shares, never by amount.** The caller asks for `n` shares and states maximum inputs. The Hall pulls exactly the required units or fails. A depositor can never be rounded down to zero shares, which is the mechanism of the classic inflation attack.

### 4.5 Sync, vesting, and seizure

```
expected = ledger + pending + unclaimed
fold vested pending into ledger
surplus  (actual > expected): pending += surplus; vest restarts over W
deficit  (actual < expected): consumes pending first,
                              then falls pro rata on ledger and unclaimed
```

- **Upward credits vest linearly over W** (compiled constant; proposed one hour). A donation cannot jump share value in a single block, so a lending market that prices shares cannot be hit the way Venus was. Donations are gifts to holders; the donor recovers at most their own pro-rata fraction, always less than they gave.
- **Losses apply immediately.** Conservative in the direction that protects anyone relying on the share's value.
- **Trade-off, stated:** a newcomer who strikes during a vest window shares in the remaining unvested credit. For multiplier-based issuers no raw credit exists, so this never arises. For mint-to issuers it is small and bounded by W. Revisit once Backpack's mechanism is confirmed.
- **Claims are fixed quantities.** Raw dividends attributable to unclaimed units accrue to holders. Withdraw promptly; the app notifies.

### 4.6 Issuer prerogatives, case by case

| Issuer action | Effect | Hall behaviour | Shown to holders |
|---|---|---|---|
| Freezes the Hall's account for a constituent | cannot transfer in or out | `create` fails for this alloy; `redeem` unaffected; that leg accrues as claims | "Struck closed: the issuer froze the Hall's account for X." |
| Pauses the mint | no movement anywhere | same as freeze | "X is paused everywhere by its issuer." |
| Takes tokens from the Hall via permanent delegate | actual falls below expected | `sync` applies the deficit | "The issuer took N of X from the Hall. Every holder's share fell pro rata." |
| Enables a transfer hook | transfers require extra accounts; may reject | extra accounts resolved and passed from day one; rejected legs remain claims | "X now checks who may receive it." |
| New accounts default to frozen | a melter's new account may start frozen | `withdraw` fails until thawed; claim persists | "Your account for X awaits the issuer's approval." |
| Changes the Scaled UI multiplier | no raw change | none needed; value accrues automatically | dividend or split, with its effective time |
| Mints new tokens into holders | actual rises above expected | `sync` credits holders through the vest | "Dividend reinvested", when traced to the issuer's mint authority |

Transfer-hook support ships in version one even though no current constituent has an active hook, because xStocks hooks exist and are merely switched off.

### 4.7 The share mint

Token-2022 with metadata only. No freeze authority. No permanent delegate. No pause. No hook. Mint authority is the alloy's program-derived address, and only `create` can use it. This is the second guarantee, and it is verifiable by anyone reading the mint.

### 4.8 Limits

At most twelve constituents. Derivation: `create` needs a mint and two token accounts per constituent plus roughly seven shared accounts, which fits well under 64, and the remaining headroom absorbs transfer-hook accounts. Verified by a devnet test with twelve constituents, half with hooks enabled.

The account count is not the binding limit. Every account key costs 32 bytes and a legacy transaction is capped at 1,232 bytes. A size estimate for `initialize_alloy` (placeholder keys, one signature, measured on 25 September 2026) gave about 957 bytes at four constituents, 1,389 at eight and 1,822 at twelve. Above roughly six constituents a strike therefore needs a v0 transaction with an address lookup table. The twelve constituent test is not yet written, and the local test helper sends legacy transactions only.

### 4.9 Fees

Compiled constants per program version, taken in shares: a fraction of minted shares to a fixed treasury on `create`, a fraction transferred instead of burned on `redeem`. Zero on devnet. Mainnet levels decided before the Key, then unchangeable forever. A new fee is a new version.

### 4.10 Events

`AlloyInitialized`, `Struck`, `Redeemed`, `Withdrawn`, and `Synced` with kind `credit` or `deficit`. The ledger classifies credits as dividend or donation from the issuer's mint authority.

---

## 5. Security

**Property tests, required:**
- the per-constituent balance invariant holds after every instruction
- `create` never takes more than the caller's maximums
- `redeem` never invokes a constituent program
- a donation never reduces any holder's units per share
- an upward credit never raises units per share faster than the vest allows
- every rounding favours the Hall
- no instruction can move a constituent except to a claim owner through `withdraw`

**Fuzzing** with Trident across instruction sequences, including issuer actions interleaved by mock authorities.

**Audit before size.** Devnet and small mainnet testing do not need it. Open deposits do.

**Guidance for lenders pricing shares:** read `ledger` plus vested credit per share on-chain, multiply by their own constituent prices, and never price a share from any Office figure alone.

---

## 6. Immutability, versioning, and the Key

"Immutable but able to adapt" is a contradiction. Adaptability is an upgrade path, and an upgrade path is an admin key with a better name.

The resolution is versioning by deployment. Each version is a separate immutable program. Learning something means deploying the next version; holders migrate by melting from one and striking into the other, which they can always do because melting is permissionless. The old Hall keeps working forever for whoever stays.

Devnet builds are upgradeable, and every surface says so. The mainnet Hall is deployed and then made final, once, by the Key.

---

## 7. The devnet demonstration

Jupiter does not route devnet liquidity and the real constituents live on mainnet, so the Hall is demonstrated against mock issuer mints reproducing the real extension sets, with you holding the mock issuer authorities. That turns a limitation into the strongest demo in the hackathon: the Hall surviving every issuer power, live.

1. Initialize Alloy No. 1 with a genesis deposit. The Strike. Genesis hallmark.
2. A second wallet strikes shares.
3. The issuer raises a multiplier. Value rises; no raw balance moves.
4. The issuer mints reinvested dividends into holders. Sync credits them; vesting visible.
5. The issuer freezes the Hall's account for one constituent. A melt still succeeds, every other leg delivers, one claim remains, visibly still.
6. The issuer thaws it. The claim withdraws.
7. The issuer takes tokens from the Hall. Sync applies the deficit; the loss is stated plainly.
8. An attacker donates. Units per share rise only along the vest; the attacker's balance ends lower than it began.
9. Show the upgrade authority: still in hand, and say so.

---

## 8. Legal

Pooling assets and issuing a claim against the pool is the fact pattern of a collective investment scheme. Enthusiasm from respected people does not change what a regulator sees.

What matters is whether a person retains discretion. A program with no key, a formula fixed at initialization, no instruction that can move holders' assets or stop exits, a permissionless factory, and every parameter visible on-chain is considerably closer to published software than to a managed fund. That distinction is unsettled and actively litigated, and no design document resolves it.

Get a crypto-securities lawyer's read before the Hall holds real money. Accelerators often provide legal office hours; ask.

## 9. Capital

The mechanism needs none of yours. Depositors bring their own constituents.

Two things do need funding: the genesis of Alloy No. 1, and seed liquidity for its share pool, without which the one-swap retail path does not exist. A few thousand dollars, not fund-scale. Ask for it directly.

## 10. Sequencing

1. Recipe specification and vectors, PRD 0.
2. Program against the vectors; property tests; fuzzing.
3. Mock issuers and the devnet demonstration.
4. App and console integration.
5. Legal read.
6. Audit.
7. Mainnet deploy; the Key.
8. Genesis of Alloy No. 1; seed the share pool.
9. Business development. A standard is adopted by integration, not by correctness.

## 11. Acceptance

- Any wallet strikes an exact number of shares and never pays more than its stated maximums.
- Any wallet melts at any time, including while a constituent is frozen, paused, or hooked.
- Every deliverable leg withdraws; held-back legs remain claims and withdraw once released.
- A raw transfer of any single constituent to the Hall raises no holder's units per share faster than the vest, and leaves the donor poorer.
- A seizure reduces holders and claimants pro rata after consuming unvested credit.
- The share mint has no freeze authority, delegate, pause, or hook, verifiable on-chain.
- The program contains no instruction that alters a formula, moves a holder's assets outside `withdraw`, or blocks `redeem`, verifiable from the deployed bytecode.
- Rust passes every `packages/recipe` vector.
- Twelve constituents, half with enabled hooks, strike successfully in one transaction.
- A second wallet initializes a new alloy without Seametry's permission.

## 12. Honest risks

- Thin constituent depth caps how tight the share price can ever track its contents. A perfect mechanism cannot fix a shallow pool.
- Issuers keep their powers. The Hall contains them honestly; it does not remove them.
- The legal question is unsettled.
- Correctness does not cause adoption. The integration work after launch is likely larger than the build.
