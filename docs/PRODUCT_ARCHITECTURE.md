# Product Architecture

**Status:** living document. This file owns what Seametry is, who it serves,
which surfaces exist, how it is phased, and where revenue comes from. It does
not own service boundaries (`SERVICE_CATALOG.md`), engineering rules
(`ENGINEERING_STANDARD.md`), brand and voice (`BRAND_AND_WORLD.md`), or per
surface requirements (`prd/`).

**Last substantive change:** 23 September 2026.

---

## 1. What Seametry is

Seametry builds exchange traded funds on Solana where anyone can be an
authorized participant, and where the basket keeps working when the issuers of
the things inside it do not.

Two sentences, and the second one is the product.

A tokenized stock is not an ordinary token. Its issuer can freeze it where it
sits, pause all movement of it, take it back from any wallet, decide who may
receive it, and change how many of them you appear to hold. All of that is
written on chain for anyone who decodes it, and almost nobody decodes it. A
basket of eight tokenized stocks is a basket of eight instruments that eight
other parties still control.

Seametry's basket is struck in a program with no key, it holds no price, and
melting it back into its parts cannot be blocked by anyone, including us. What
can be blocked is delivery of an individual constituent, by that constituent's
own issuer, and the product says so in those words rather than pretending
otherwise.

## 2. Why an ETF and not a bundle

This distinction is the whole argument, so it goes first.

**A bundle** buys you several tokens in one transaction. You end up holding the
tokens. This is a convenience feature, it is a weekend of work, and at least two
teams in this hackathon alone have built one.

**An ETF** is a mechanism. Shares exist because someone deposited the underlying
basket to create them, and shares can always be destroyed to reclaim it. That
creation and redemption loop is what keeps a share's market price honest:
whenever the share trades away from the value of its contents, someone profits
by closing the gap, and in closing it they close it for everyone.

In traditional markets that loop is restricted to authorized participants, a
closed list of large banks with the balance sheet and the relationship to
qualify. That gatekeeping is a large part of why retail pays a spread and why
launching a fund requires an institution.

On Solana the loop can be open. Any wallet holding the constituents can strike
shares. Any wallet holding shares can melt them back, at any hour, without
asking us or anyone. **The authorized participant set is everyone.** That is not
a convenience improvement over a bundler, it is a different financial object,
and it is the sentence the product is built to make literally true.

Two consequences follow, and both are load bearing:

- **The program can never be allowed to have a key,** because an upgradeable
  program is one that can be made to stop honouring redemption. Versioning is by
  deployment: a new version is a new immutable program, and holders migrate by
  melting out of one and striking into the other, which they can always do.
- **The program must never need a price.** Strike and melt move quantities.
  No oracle, no quote, and no valuation is an input to any instruction, so
  minting cannot be manipulated by moving a market and the basket keeps working
  when every price source is down.

## 3. Why anyone else's version breaks

Every bundler and index program shipping today shares one assumption: that the
tokens inside behave like tokens. For tokenized equities that assumption is
false, and it fails in ways that are invisible until the day they matter.

| What an issuer does | What happens to a naive basket |
|---|---|
| Freezes the basket's account for one constituent | The whole basket becomes unredeemable, because redemption tries to move every leg at once |
| Pauses a mint globally | Same, and for everyone simultaneously |
| Takes tokens back via permanent delegate | Share value silently falls, and the basket's accounting does not know why |
| Enables a transfer hook | Transfers start failing for want of accounts nobody passed |
| New accounts default to frozen | A redeemer receives nothing and has no record of being owed it |
| Changes the Scaled UI multiplier | Balances appear to change with no transfer, and a naive reader is one corporate action behind |

Seametry's design answers each of these specifically, because each one broke an
earlier draft. Redemption is split in two: burning shares credits a claim on
every leg and touches no constituent program at all, so no issuer power can
reach it. Delivering each leg is a separate act, and a leg an issuer is holding
back stays a claim, visible, named, and withdrawable the moment it is released.

That is the technical claim, and it is checkable: `prd/HALL.md` specifies it,
and the devnet demonstration exercises every prerogative live against mock
issuers we control.

## 4. The moat is the assay

A basket is only as honest as its admission standard. Before a constituent goes
into a formula, Seametry decodes what it actually is, live from chain rather
than from any published list:

- **Grade**, the legal shape of the claim: a real security entitlement, a
  certificate that settles to cash, an interest in a vehicle holding private
  shares, or ungraded, which blocks execution by default. Grade describes shape
  and never quality.
- **Prerogatives**, each as a plain sentence: who can freeze it, pause it, take
  it back, gate who receives it, change how many you appear to hold.
- **The live multiplier**, resolved from its effective timestamp rather than
  from the field named `multiplier`, which an independent on chain analysis
  found stale on 370 of 927 xStock mints, with 631 of 640 activations landing
  outside US market hours.
- **Depth at size**, because the strongest legal claim sitting on a thin pool is
  still a thin pool, and depth is the real ceiling on any formula.
- **Unknown extensions**, kept observable and named rather than silently
  dropped, because an extension we have not implemented is a fact about the
  instrument and not a gap in our model.

This is the work that was previously mistaken for the product. It is not the
product. It is what makes the product defensible, because it is the part nobody
shipping a one click bundle has done, cannot shortcut, and will not discover
they needed until an issuer exercises a power on a constituent they included.

Published as a standard, this is **Good Delivery**: the rules a constituent must
meet to enter a basket, and the reasons printed beside the stamp when it does
not.

## 5. Two ways to hold a basket

| | **Alloys** | **Allocations** |
|---|---|---|
| Where it lives | Struck in the Hall, a keyless program | Directly in your own wallet |
| What you hold | A fungible share token | The constituents themselves |
| Formula | Fixed at initialization; a new formula is a new alloy | Yours, changeable, unlimited |
| Needs liquidity | A share pool, to trade shares rather than assemble them | None |
| Exit | Melt, permissionless, any hour | Sell what you hold |
| Legal exposure | Pooling plus an issued claim. Unsettled | Nothing pooled, no claim issued. Low |

They compose rather than compete. An assembly that fails halfway leaves an
allocation behind rather than nothing, and the app says so plainly. Allocations
are also the answer to "let me build my own formula," which needs no program,
no pool, and no permission.

Allocations carry real mainnet usage long before the Hall can, precisely
because nothing is pooled and no claim is issued. That is why they come first in
the phasing.

**Lending constituents for yield is excluded from v1.** Inside the Hall it
breaks the redemption guarantee, the balance invariant, and the argument that no
instruction can move a holder's assets. At the allocation layer it is
defensible but unvalidated, since borrow demand for tokenized equities is
currently unevidenced, and it converts the product into a securities lending
business with a regulatory profile of its own. Revisit with evidence, not
enthusiasm.

## 6. Surfaces

| Surface | User | Job | Phase |
|---|---|---|---|
| **Explorer** | Public, researchers, press, judges | Inspect instruments, evidence, the devnet demonstration, and verify any receipt against the chain without an account | 1 |
| **Terminal** | Market makers, arbitrageurs, analysts, treasury | Construct and analyse formulas, check admissibility and depth at size, watch NAV against share price, execute creation and redemption | 2 |
| **Mobile** | Holders | Hold baskets, monitor what changed, approve and sign | 2 |
| **API and SDK** | Wallets, exchanges, issuers, protocols | Buy the assay: grades, prerogatives, corporate actions, admissibility, receipt verification | 3 |

One Go core powers all four. No surface computes a decision; every surface
renders one the core produced, with the inputs and policy version that produced
it.

**The Terminal is the creation and redemption console.** Its job is the
authorized participant's job: see NAV against market price, see depth at size
per constituent, see what a strike would cost to assemble and what a melt would
return, and act on the gap. An open AP set is worth nothing without tooling that
makes being an AP practical, and no such tooling exists for on chain baskets.
This is a professional surface and it is deliberately not a retail broker.

**Mobile is a holding surface, deliberately not a broker.** It shows what you
hold, what changed, what each piece legally is, who holds power over it, and
asks for a signature when you act. Seametry does not build a general purpose
buy-any-stock consumer experience. That lane already has a well funded
occupant in this ecosystem, and walking into it trades a defensible position for
a fight over user acquisition.

## 7. Capability, feature, owner, revenue

| Capability | Feature | Owning services | Revenue surface |
|---|---|---|---|
| Permissionless creation and redemption | Strike and melt | Basket, Execution, Hall protocol | Protocol fees on strike and melt |
| Redemption that survives issuer powers | Claims and withdrawal | Basket, Execution, Alert | The reason anyone chooses an alloy |
| Admission standard | Good Delivery stamp and reasons | Registry, Policy, Basket | Terminal, API |
| Canonical instrument identity | Instrument lens | Registry | Terminal, API |
| Issuer powers, decoded live | Prerogatives | Registry | Terminal, API, mobile |
| Corporate actions and live multiplier | Calendar and alerts | Registry, Alert | Pro, API |
| Executable depth at size | Depth curve | Liquidity | Terminal, formula design |
| Basket valuation against share price | NAV and premium or discount | Basket, Market State | Terminal, arbitrage |
| Custom formulas without a program | Allocations | Basket, Execution | Routing fee |
| Deterministic decisions | Preflight | Policy | Core integration |
| Settlement reconciliation | Receipts and the seal | Execution, Receipt and Audit | Terminal, API, enterprise |
| Public verifiability | Explorer, verification ritual | Receipt and Audit, Gateway | Trust and acquisition |

A feature that cannot name an owning service, a data asset, a user, and a
revenue surface does not get built.

## 8. How it is paid for

- **Protocol fees on strike and melt.** Compiled constants per program version,
  taken in shares, fixed before the program is made immutable and unchangeable
  afterward. A new fee is a new version, which is a promise enforced by the
  absence of a key rather than by policy.
- **Routing fee** on swaps executed through Seametry surfaces, including
  allocation assembly. Disclosed as a line on the order sheet and in the
  receipt.
- **The assay as a service.** Grades, decoded prerogatives, corporate action
  history, admissibility, and receipt verification, metered, sold to wallets,
  exchanges, and protocols holding tokenized equities. This is the same evidence
  the product runs on, and it is the surface with the least competition.
- **Terminal subscription** for professional users: historical replay, formula
  workspaces, depth monitoring, alert volume, team seats.
- **Sponsorship of alloys.** A third party initializes an alloy carrying their
  own mark, on published terms, without our permission. The standard spreads by
  integration, not by our sales effort.

## 9. Phasing

Ordered by what each phase proves, and by which gates are real.

**Phase 0, the assay.** Go core: Registry with live prerogative decoding and
multiplier resolution, Observation with raw capture and replay, Market State,
Liquidity with depth at size, Policy with versioned decisions. Contract first.
*Proves the admission standard is real and reproducible.* No legal gate.

**Phase 1, the Hall on devnet, and the Explorer.** The program, its conformance
vectors shared between Go and Rust, and the demonstration: mock issuers whose
extension sets reproduce the real ones, exercising a freeze, a pause, a
seizure, a hook, a multiplier change, and a donation attack, live. The Explorer
publishes it, plus the verification ritual where a visitor's own browser checks
a receipt against the chain. *Proves the mechanism survives the powers its
constituents carry.* No legal gate, because no real money is involved.

**Phase 2, allocations on mainnet, plus the Terminal and mobile.** Real baskets
at small size, held in the user's own wallet, nothing pooled, no claim issued.
The Terminal ships as the formula and depth workbench. *Proves people will hold
a basket built this way, and produces the first real receipts.* No legal gate,
low exposure.

**Phase 3, the Hall on mainnet, and the API.** Gated by a crypto securities
legal read and a program audit, in that order, neither of which is code and
neither of which can be hurried. Then deployment, then the Key, which makes the
program immutable, then the genesis alloy and a seeded share pool. The API and
SDK ship alongside with entitlements and metering. *Proves the whole thesis.*

The gating is what makes this ordering necessary rather than cautious: phases 0
through 2 deliver a working product, real users, and real receipts without ever
touching the unsettled legal question, while phase 1 proves the phase 3 thesis
on devnet at zero legal risk. A hackathon submission is a narrow release cut
from whichever phase is current. Stocklana closes 25 September 2026, 16:00 ET.
That date shapes which release is cut and nothing else.

## 10. What Seametry does not do

- It does not call a value true, correct, fair, or safe. It publishes attributed
  observations with their ages and verification states.
- It does not recommend direction, size, timing, or suitability.
- It does not average sources into a synthetic consensus.
- It does not custody assets or hold user keys.
- It does not rebalance an alloy. The formula is fixed, value weights drift by
  design, that drift is reported, and a new formula is a new alloy.
- It does not judge an issuer. The same sentence describes every issuer holding
  the same power.
- It does not build a general purpose consumer stock brokerage.

Enforced as language and behaviour rules in `ENGINEERING_STANDARD.md` §16.

## 11. Validation record

Recorded because unrecorded validation decays into folklore, and because the
reasoning that follows from it should be auditable later when it turns out to
be right or wrong.

**Superteam pitch clinic, ahead of Stocklana, September 2026.** Present
included the Superteam lead and the founder of NectarFi, a Solana savings and
neobank product with a $170K pre-seed, operating in the same market. Position
intelligence was pitched, with a question directed at the NectarFi founder. His
response, in substance:

1. Position intelligence is not a large enough market on its own.
2. Making ETFs work seamlessly on Solana is the more interesting problem.
3. A better UX stock broker would compete directly with him, and he is already
   backed.

The Superteam lead's reaction suggested the ETF direction held his interest too.

**Weighing it.** Point 3 carries an obvious interest, since it steers a builder
out of his lane, and it should be read as competitive information rather than
as neutral advice. It is nonetheless correct to act on: the consumer investing
lane is contested by a funded team with distribution, and winning it would be a
fight over acquisition rather than over anything Seametry is better at. Point 1
holds for an independent reason, which is that selling analysis of a market
requires the market to be large enough to pay for analysis, and tokenized
equities are not there yet. Point 2 is supported by evidence that does not
depend on him: Solana carries roughly 97 percent of cumulative on chain
tokenized equities spot volume, holders crossed 200,000 in May 2026, and Solana
RWA value passed $4 billion in August 2026.

**What it changed.** The basket line moved from a deferred phase 3 product to
the spine. The instrument intelligence work moved from being the product to
being the admission standard and the moat. The Terminal was re scoped from a
trading terminal to a creation and redemption console. Mobile was explicitly
bounded to avoid the contested lane.

**What it does not settle.** Whether an open authorized participant set is worth
paying for, whether share pools can be seeded deeply enough for the one swap
retail path to exist, and whether the legal question in phase 3 resolves
favourably. None of these are answered by a pitch clinic.

## 12. Honest risks

- **The ETF thesis is crowded, the execution is not.** At least two Stocklana
  entries and several funded teams are building bundlers. The differentiation is
  entirely in surviving issuer prerogatives and in the admission standard, which
  means the demonstration matters more than the pitch.
- **Depth is the ceiling.** Backpack's tokenized Intel opened with a pool of
  roughly 199,000 USD. A perfect mechanism cannot fix a shallow pool, and no
  constituent enters a formula before its depth at size is measured.
- **The retail path does not exist until a share pool is seeded.** Until then
  every acquisition is assembly, which is more transactions and more cost, and
  the product must never imply otherwise.
- **Issuers keep their powers.** The Hall contains them honestly. It does not
  remove them.
- **The legal question is unsettled** and actively litigated. Phase 3 is gated on
  a lawyer's read, and no design document resolves it.
- **Correctness does not cause adoption.** A standard is adopted by integration.
  The work after a correct build is likely larger than the build.
