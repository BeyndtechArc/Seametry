> **Living document. Owns:** requirements for the mobile companion surface.
> **Does not own:** product scope or positioning. `PRODUCT_ARCHITECTURE.md` owns that. Where this file implies mobile is the product, that file wins.
> **Scope boundary, deliberate:** mobile is a holding, monitoring, and approval surface. It is not a general purpose consumer stock brokerage, and that lane is avoided on purpose. See `../PRODUCT_ARCHITECTURE.md` section 6.
> **The basket content in this file (alloys, allocations, melting, claims) is the product,** not a deferred addition. Allocations reach mainnet in phase 2; alloys on mainnet wait for phase 3.

# PRD 1: Seametry App

The Touchstone. A basket-first broker on mobile, and the public console where anything the Office claims can be checked.

Revision 3. Depends on PRD 0, PRD 2, and the architecture document.

---

## 1. Problem

A tokenized share of Apple and a claim to cash that tracks Apple trade in the same pools at the same price, and every wallet renders them identically. Neither shows who can freeze the token, pause it, or take it back from any wallet, though all of that is written on-chain for anyone who decodes it. Nor do they show that most dividend activations land while the underlying market is closed, or that the obvious multiplier field is frequently a corporate action behind.

A basket multiplies all of it. Eight constituents means eight grades, eight sets of prerogatives, eight dividend schedules, and today every product renders their sum as one clean number.

## 2. Users

**Primary.** Someone who wants diversified dollar exposure without picking names, in a market where holding dollars is protection rather than speculation, and who has no way to see what a basket is actually made of.

**Secondary.** Holders of tokenized equities across issuers with no aggregated, honest view of what they hold, what each piece legally is, and who holds power over it.

**Tertiary, and the business.** Protocols, wallets and fintechs that need the same assay as a service. See section 11.

---

## 3. Two ways to hold

**Alloys.** Struck in the Hall. Few, curated, deep. A fungible share token; one transaction to strike when you hold the constituents; melt for anyone at any hour. The recipe is fixed at initialization, so value weights drift with the market by design. A new formula is a new alloy.

**Allocations.** Held directly in your own wallet. Unlimited and free to create: pick constituents and weights, the app buys them, nothing is minted, no liquidity needs to exist. Rebalancing is proposed on drift, never automatic.

The app always states which mode a basket is in and what that implies. They compose: a failed assembly leaves an allocation behind, never nothing.

---

## 4. Acquiring an alloy

Planned by the core in preference order, shown to the user before any approval:

1. **Secondary pool.** If the alloy's share token has a pool with sufficient depth, one Jupiter swap. This is the retail path, exactly as with exchange-traded funds: most buyers trade shares; creation and redemption are how arbitrage keeps the price honest.
2. **Direct strike.** If the user holds the constituents, one transaction.
3. **Assembly.** One swap per constituent, then a strike. One approval where the wallet supports batched signing (MWA `signAndSendTransactions`, Phantom `signAllTransactions`; verified per wallet on device). Non-atomic. On partial failure, whatever was acquired stays in the wallet as an allocation, and the app says so plainly.

Until share pools are seeded, path 1 does not exist. The app never implies it does.

## 5. Melting

One action. Underneath, redeem burns shares and credits a claim for every leg, which no issuer can block, then each leg is withdrawn. Legs an issuer is holding back, frozen or paused, remain as claims, stay visually still in the Melt animation, and trigger a notification the moment they become withdrawable.

---

## 6. The constituent page

The deepest screen in the app, and the one no competitor has in full:

- **Grade**, as a plain sentence.
- **Prerogatives**, each as a plain sentence: freeze, pause, take back, gate receipt, change apparent quantity. Read live from the mint.
- **Corporate actions**, from the ledger: multiplier history with scheduled and effective times, flagged when activation lands outside market hours, reinvested dividends shown net of withholding where applicable.
- **Evidence**: every observation with its state and age.
- **Depth at size**: what 100, 1,000 and 10,000 USDC would actually execute at. The constituent's real ceiling.
- **Mark age** for pre-IPO constituents, at the same visual weight as price.
- **Good Delivery or NGD**, with reasons.
- **Cross-issuer**: where the same underlying exists from another issuer, both grades side by side.

---

## 7. Screens

```
Onboarding      wallet connect; no email, no KYC
Today           holdings value; alloys and allocations; carousel "Needs a look · n"
Alloys          Good Delivery alloys by default; NGD visible, stamped
Alloy           recipe, units per share, NAV with weakest evidence, constituents
Build           create an allocation; live valuation; mode stated
Constituent     section 6
Order sheet     plan, expected, floor, fees, path; one approval
Handoff         wallet out and back
Hallmark        punch row, serial, seal status, certificate export, verify link
Activity        hallmarks, newest first
Claims          melted legs held back by an issuer, with the reason
Rebalance       allocations only: drift, trades, cost; consent required
Position        lots, cost basis, income split from price movement
About           the Key (or "Key still in hand"), the genesis hallmark, policy version
Settings        wallet, notifications, sources
```

---

## 8. Hallmarks

Every settlement produces one: punch row (sponsor's mark, weakest grade, office mark, date mark), serial, and a canonical body recording what was held, each grade, each prerogative, what every source said at signing, what settled per leg.

Status is shown honestly: **Unsealed** until the next anchoring, then **Sealed**. Export produces the certificate. Every hallmark links to the console, where anyone can verify it against the chain without trusting the Office.

## 9. Notifications

Prerogative exercised on something you hold. Dividend scheduled, then effective. Allocation drift crossing its band. Mark age crossing its threshold. Claim ready to withdraw. Written in the voice: fact first, calm, no alarm.

## 10. Honesty surfaces

- Devnet alloys carry *Devnet Hall. Key still in hand.* on every screen that shows them.
- The Office's own freshness is evidence: "Ledger 14s behind chain" is shown when true.
- The app never shows a blended return. Price movement, reinvested dividends and any opted-in yield are always separate.
- The Hall's three guarantees are stated in About, word for word from PRD 2.

---

## 11. Business

- **Routing fee** on swaps executed through the app, via Jupiter's integrator fee mechanism.
- **Hall fees** on strike and melt, compiled into each program version, decided before the Key and never adjustable.
- **The Office as a service**: assay, prerogative decoding, corporate-action history, the Good Delivery list, hallmark verification. Sold to wallets, fintechs and protocols that hold tokenized equities and need the same evidence.

Fee levels are open. None is ever hidden: every fee is a line on the order sheet and in the hallmark.

---

## 12. Design

Governed by the world document. In short: touchstone black with faint grain; green means touchable and nothing else; blue lives in bars beside green, charts and micro-indicators, never a large surface; pill buttons in an 8px neutral tray, quieter than the figures; no shadows; radius carries meaning; punches debossed by tone; the Strike is the only orchestrated motion.

## 13. Stack

Expo React Native, consuming the generated TypeScript client against the Go gateway. It computes no decision, per `../ENGINEERING_STANDARD.md` section 2. Wallets through one interface with MWA on Android and Phantom deep links on iOS. Charts on Skia and Reanimated. Fonts self-hosted.

---

## 14. Acceptance

- A mainnet allocation of two or three real constituents is bought at small size; the hallmark's settled amounts match the explorer; its floor sits at or below what settled.
- A constituent page decodes and displays the prerogatives of a real mainnet mint, and the resolved multiplier differs from the naive field where the field is stale.
- On devnet, an alloy is struck and melted end to end, including a melt during an issuer freeze that delivers every other leg and leaves one claim.
- An assembly that fails midway leaves an allocation and says so.
- A hallmark moves from Unsealed to Sealed and verifies on the console without any Office credentials.
- No screen shows a blended return.
- Every devnet alloy surface shows *Key still in hand*.

## 15. Risks

- **Outside your control:** wallet round trips on iOS, store signing, Jupiter availability, mainnet landing under congestion, constituent depth.
- **Depth is the ceiling.** Backpack's tokenized Intel opened with a pool of roughly $199K. The strongest claims can sit on the thinnest pools; depth at size is checked before any constituent enters a formula.
- **Competition inside Stocklana.** At least one other entry already surfaces issuer controls on xStocks. Showing prerogatives is table stakes. Surviving them inside a keyless basket is the differentiation, and the devnet demo exists to prove it.
- **Legal.** Allocations carry low exposure: nothing pooled, no claim issued. Alloys carry PRD 2's exposure. Geofence per issuer.
