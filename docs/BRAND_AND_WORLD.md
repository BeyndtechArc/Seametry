> **Living document. Owns:** the world, canon, voice, naming, the world-to-code name map, visual language, and motion. Every surface answers to this file on those subjects.
> **Does not own:** product scope, service boundaries, or engineering rules. See `PRODUCT_ARCHITECTURE.md`, `SERVICE_CATALOG.md`, `ENGINEERING_STANDARD.md`.
> **Note, 23 September 2026:** the canon holds in full. The basket is the product, so its vocabulary (alloy, strike, melt, formula, claim, the Hall) is current rather than deferred, and the assay vocabulary (grade, prerogative, Good Delivery, hallmark, seal) describes the admission standard the product is built on. Nothing here is decoration over a different product.

# Seametry: The Hall

World, brand and voice. Every surface answers to this document: interface, motion, naming, copy, pitch.

Revision 3.

---

## 1. Canon

> The Hall has no door.
>
> For more than seven hundred years, silver was not money until someone struck a mark into it. A leopard's head. A date letter. A maker's initials, punched deep enough that no amount of handling could wear them away. The mark never made the metal pure. It made someone answerable for saying so.
>
> Tokens circulate unmarked. A share of Apple and a claim to cash that tracks Apple pass through the same pools at the same price, and the difference surfaces on the one day it matters, which is the day it can no longer be fixed.
>
> Every metal answers to someone. Some can be frozen where they sit. Some can be paused mid-flight. Some can be taken back from any wallet, at any hour, by a hand the holder never sees.
>
> So the Hall was raised in Port Harcourt, a refinery town on the Bonny River, where crude has always had to become something you could weigh.
>
> It assays what it holds. It strikes alloys in exact proportion and melts them back for anyone, at any hour, without asking who they are. It marks every trade with a serial that is never reused, and seals the marks into the chain where no one can quietly change them.
>
> On the day the Hall was finished, the First Warden struck the first mark, walked out, and threw the key into the river.
>
> No one holds the Hall now. That is the point. A Hall with a keeper is a promise. A Hall without one is a fact.

---

## 2. The rule that keeps it honest

Every sentence of the canon must be literally true of the shipped product. The world is not decoration laid over the product. It is the product described in an older language, and the moment the two disagree, the code wins and the canon is rewritten.

**Before the Key is thrown, the app says so.** On devnet the Hall is upgradeable, because it has to be while it is being built. Every devnet surface carries one line: *Devnet Hall. Key still in hand.* The myth never runs ahead of the chain.

**Grades never imply quality.** An earlier draft mapped claim types to metals, entitlement as fine silver, certificate as plate. That mapping is retired. Plate implies inferiority, it quietly disparages issuers who may become constituents and partners, and it breaks the language boundary by suggesting one claim is safer than another. A grade describes the legal shape of a claim and nothing else.

**Prerogatives are stated, never judged.** The same sentence applies to every issuer holding the same control. The world is eerie about power in general, never hostile to any issuer in particular.

---

## 3. Geography

**The Seam.** Where a token on the chain meets the thing it claims in the world: a share in a custodian's account, a certificate on an issuer's balance sheet, an interest in a private vehicle. Most days the two look fused. The product exists for the days they don't. Your own axis, the seam between mystery and intelligence, is the name of the company.

**The Hall.** The on-chain program where alloys are struck and melted. It holds no key, asks no names, and never needs to know a price.

**The Office.** Seametry itself, off-chain. It assays, publishes the Good Delivery rules, strikes and seals hallmarks, and keeps the ledger. Run by Beyndtech Arc from Port Harcourt. The Office has a keeper and says so, which is exactly why its rules are published and its hallmarks are sealed where anyone can check them. The Hall is a fact. The Office is a promise that shows its working.

**The Touchstone.** The interface. A touchstone is a black stone that gold is drawn across; the streak it leaves tells the assayer what the metal is. The app's black ground is not dark mode. It is the stone, and every constituent is drawn across it.

---

## 4. The map

World names live in the interface, brand and copy. Literal names live in on-chain interfaces and APIs, because a standard that integrators build against must be boring.

| World | Product | Code |
|---|---|---|
| The Seam | token on-chain versus claim in the world | |
| The Hall | keyless basket program | `programs/hall` |
| The Office | Seametry's services | `internal/*` |
| The Touchstone | the interface | `apps/terminal`, `apps/mobile`, `apps/explorer` |
| Ore | a tokenized stock | `Constituent` |
| Grade | legal shape of the claim | `Grade` |
| Prerogatives | issuer powers over a token | `Prerogatives` |
| Assay | evaluation of evidence | `internal/policy` |
| Alloy | basket struck in the Hall | `Alloy` |
| Formula | an alloy's fixed recipe | `Recipe` |
| Strike | mint alloy shares | `create` |
| Melt | burn shares, deliver constituents | `redeem` then `withdraw` |
| Claim | a melted leg the issuer is currently holding back | `Claim` |
| Allocation | personal basket held in your own wallet | `Allocation` |
| Sponsor, sponsor's mark | whoever initializes an alloy, and their registered mark | `sponsor` |
| Hallmark | the receipt | `Hallmark` |
| Serial | never-reused hallmark identifier | `serial` |
| The Seal | Merkle root of hallmarks anchored on-chain | `Anchor` |
| Good Delivery | Seametry's published standard | `internal/basket` |
| NGD | fails the standard, reasons printed | |
| The Key | the transaction that makes the Hall immutable | upgrade authority set to none |

"Allocation" is borrowed exactly. In bullion, an allocated holding is a list of specific bars assigned to a specific owner. A personal basket is precisely that.

---

## 5. Your part

### The First Warden

You build the Hall, strike its first mark, and then give up every power over it. That renunciation is your role in the world, and it is also the literal legal and technical property the product depends on. The myth and the architecture are the same act.

After the Key, you hold shares like anyone else. The Warden's authority ends at the river.

### Alloy No. 1

The first alloy struck in the Hall carries your sponsor's mark. Working name **STORM**, after the basket first sketched in the Superteam session as "Storm token". You choose its formula: at most twelve constituents, realistically five to eight, each one checked for depth at size before it goes in. The genesis deposit is yours, and the genesis shares locked inside the Hall are unrecoverable by design. The Hall's first permanent resident.

### Your mark

A sponsor's mark, designed by you. Brief:

- A single glyph inside a punch outline, legible at 16pt and at 160pt.
- Yours is the first mark registered, so its outline becomes the house form every later sponsor's mark sits inside.
- One weight. No gradient, no shadow. It is rendered debossed, tone on tone.
- It must survive being the smallest object on a hallmark row, beside a serial number.

### The Key

The mainnet ceremony, after audit and legal read, never before:

```
solana program set-upgrade-authority <HALL_PROGRAM_ID> --final
```

Signed by you. The transaction signature becomes a relic: shown in the app's About screen and on the console as *The Key*, linking to the explorer, forever.

### The genesis hallmark

The first hallmark the Office strikes is Alloy No. 1's genesis, serial `MMYY0000001`, bearing your mark. It sits permanently at the top of the public ledger.

---

## 6. Liturgy

### Four states of evidence

| World | Screen | Meaning |
|---|---|---|
| Assayed | Verified | signed or cross-confirmed, fresh |
| Unassayed | Unverified | real value, not independently checked |
| Old assay | Stale, with its age | observed, but past its window |
| No sample | Unavailable | the source said nothing. Named, never omitted |

The operational label always leads. The world name sits beneath it in ink3, never instead of it.

### Two stamps

**Good Delivery.** Meets the published standard.

**NGD.** Does not, with the reasons printed beside the stamp. The term is borrowed exactly: under LBMA rules, bars that fail the specification must be stamped NGD, Non-Good Delivery, beside the maker's mark. Good Delivery itself is the principle that made wholesale gold tradeable: a bar bearing an accredited stamp is accepted by counterparties without independent assay. That is precisely what a basket standard is for.

### Grades

**Entitlement.** Redeemable one to one into a real security entitlement.
**Certificate.** A claim on the issuer that settles to cash.
**Interest.** A proportional interest in a vehicle holding private shares.
**Ungraded.** Not yet classified. Blocks execution by default.

### Prerogatives

Every issuer control is a plain sentence, never an icon alone:

- The issuer can freeze this where it sits.
- The issuer can pause all movement of this.
- The issuer can take this back from any wallet.
- The issuer can decide who may receive this.
- The issuer can change how many of these you appear to hold.

The last is the Scaled UI multiplier: dividends and splits. True, and quietly unsettling, which is the register.

*Every metal answers to someone. Seametry shows you who.*

---

## 7. Voice

- Calm dread, never alarm. State the fact and let it land. No exclamation marks, no warning triangles, no red.
- Lead with the collision, not the definition.
- Never true, correct, fair, safe, guaranteed, pure. Say source, age, grade, prerogative.
- A number carries its provenance in the same breath: "248.37, assayed 2s ago", never a bare figure.
- All outward copy passes through STORM-VOICE-SYSTEM.md.

---

## 8. Visual language

### Carried from the design system

| Token | Value | Job |
|---|---|---|
| ground | `#0A0A0A` | the touchstone |
| sheet | `#141414` | surfaces |
| raised | `#1C1C1C` | sheets, modals |
| tray | `#262626` | button housings |
| ink / ink2 / ink3 | `#F5F5F3` / `#9A9A96` / `#66665F` | type |
| rule | `#242422` | hairlines |
| green | `#B7EC75` | touchable. Nothing else is green |
| blue | `#3A20D6` | bars alongside green, charts, micro-indicators |
| blue text | `#8F8AFF` | provenance in text, NGD stamp |

Blue never occupies a surface larger than a chip. Banners are a small carousel, roughly 72pt tall, one statement and one detail line, section title carrying a count badge: *Needs a look · 2*. Buttons are full pills seated in an 8px neutral tray pill, charcoal text on green, quieter than the figures they act on. No shadows anywhere. Radius carries meaning: data sharp, surfaces soft, touchable fully rounded, sheets matching the device corner.

### New, from the world

**Ground grain.** Two to three percent monochrome noise on the touchstone, static, never animated. You should feel stone before you notice it.

**The punch.** Outline at 1px ink3, fill one tone below its surface, a half-pixel highlight on the lower inner edge. Deboss by tone, never by blur.

**The hallmark row.** Four punches, left to right: sponsor's mark, grade mark (the weakest grade present), office mark (Hall or Office), date mark (MMYY). Serial beneath.

**The serial.** Switzer 600, tabular figures, tracking +8%. Format `MMYY` plus seven Crockford base32 characters, eleven in total, which is the LBMA maximum for bar serials, with the month and year leading exactly as the Good Delivery rules allow. LBMA also requires refiners to apply a consistent font to every digit; tabular numerals are the same discipline.

**The certificate.** The one place the world turns to paper. The export is a certificate of analysis: warm paper, ink type, the hallmark row printed large, and the seal (Merkle root plus anchoring signature) set as the approved signature line.

**Type.** Sentient for figures and titles, Switzer for interface. Self-hosted. Confirm the Fontshare licence covers app embedding before shipping.

---

## 9. Motion

**The Strike.** The single orchestrated moment in the product. When a hallmark is issued, the four punches land in sequence, 70ms apart, each scaling 1.06 to 1.00 over 90ms with a heavy haptic impact. The serial types on after the last punch. No blur, no glow. Reduced motion collapses it to one instant with one haptic.

**The Melt.** The alloy's constituent rows separate outward over 240ms, a light haptic for each delivered leg. A leg the issuer is holding back does not move. It stays where it was, labelled as a claim. Stillness is the information.

**The Seal.** When a hallmark changes from Unsealed to Sealed, its seal glyph fills once over 180ms. No haptic. Quiet confirmation.

**Everything else** responds to touch only. House spring: damping 18, stiffness 180. Optional sound: a single dry metallic tap on the Strike, off by default.

---

## 10. Words for the outside

**Five words.** Know what it's made of.

**One line.** Seametry strikes baskets of tokenized stocks, grades every claim inside them, and hallmarks every trade.

**Pitch.**

> A tokenized share of Apple and a claim to cash that tracks Apple trade in the same pools at the same price. The difference only surfaces on the day it matters.
>
> Seametry is where they get told apart. Buy a basket in one step and see what each piece actually is: a real share, a claim to cash, or a slice of a private company, and who can freeze it, pause it, or take it back. Every trade leaves a hallmark, a serial never reused, sealed on-chain where anyone can check it.
>
> The basket itself sits in a Hall with no keeper. Anyone can melt it back into its parts, at any hour, without asking us.
>
> Know what it's made of.

**For judges, one sentence each.**
*Problem:* tokenized stocks with different legal claims and different issuer powers look identical in every wallet.
*Product:* a basket broker whose baskets live in a keyless program that survives issuer freezes, pauses and seizures without losing anyone's exit.
*Why Solana:* Token-2022 puts issuer powers on-chain where anyone can read them, strike and melt settle in one transaction, and fees are low enough to seal every hallmark.
*Why trust:* the program has no key, the rules are published, and every receipt is verifiable against the chain.

---

## 11. What the world must never do

- Obscure an operational fact. The order sheet says "Stale, 47 days" first; "old assay" whispers beneath it.
- Imply safety, purity or return.
- Outrun the code.
- Judge an issuer.
