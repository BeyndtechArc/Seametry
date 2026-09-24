# Foundations

The ground every Seametry surface stands on. Read in full before creating any new component or page.

## Contents
1. The standard
2. What the references taught us
3. The house: world and naming register
4. The auction-house layer
5. Colour
6. Type
7. Space, layout, radius, elevation
8. Motion and haptics
9. Iconography and imagery
10. Accessibility floor

---

## 1. The standard

Seametry should feel like a great auction house that happens to run on Solana: quiet rooms, exact catalogues, provenance you can check, and one ceremony at the moment something changes hands. Premium comes from restraint and precision, never from effects.

Five laws. Everything else in this skill is a consequence of them.

1. **Every number carries its provenance.** Source, age, and evidence state travel with the figure. A naked number is a defect.
2. **Colour has jobs, not moods.** Green means touchable. Blue means provenance. Nothing else gets a hue.
3. **Show the product, never a picture of it.** Marketing surfaces render real components with real or labelled fixture data, never screenshots or illustrations of screens.
4. **One ceremony per surface.** The Strike, the Seal, the Key. Everything else is still.
5. **Nothing may claim what it cannot prove.** No metric without a link to its evidence. No safety, purity or price claims. No social proof we do not have.

---

## 2. What the references taught us

| Reference | What it does best | How Seametry takes it further |
|---|---|---|
| Infisical | Product sections are living fragments: a certificate table with serial, status and expiry rendered as real DOM, not a screenshot | Every fragment is a real Seametry component. Where Infisical shows a certificate table, we show hallmarks that visitors can verify |
| Unkey | Bold two-word claim followed by one plain sentence; a glossary that teaches the domain | The glossary is generated from the same registry that powers in-product definitions, so the UI teaches as you read it |
| Directus | A live stream of governed actions ("Studio editor, publish article, Allowed") as the hero | Our live stream is the assay feed: real preflight decisions, ALLOW, WARN, BLOCK, each linkable to its evidence |
| Langfuse | Openness as proof: community stats, changelog with relative dates, SKILL.md and prompts to install via coding agents | Proof strip limited to verifiable facts: hallmarks sealed, last seal, program ID, the Key. Agent install prompts for the API |
| Colosseum | Aura through naming discipline: organisation, platform, programmes and contracts all named inside one world | The naming register below. Nothing ships with a name from outside it |

What none of them has, and we must: a single interaction where the visitor's own machine proves the claim (the verification ritual), and a visual language derived from a real institution rather than a generic SaaS kit.

---

## 3. The house: world and naming register

The world is the Hall (keyless on-chain program), the Office (Seametry's services), the Touchstone (the interface), and the Seam (where a token meets the thing it claims). Full canon lives in the world document. This section governs naming.

### Register

| Concept | Name in the interface | Code name |
|---|---|---|
| Basket struck in the Hall | Alloy | `Alloy` |
| Personal basket in own wallet | Allocation | `Allocation` |
| Fixed recipe of an alloy | Formula | `Recipe` |
| Mint alloy shares | Strike | `create` |
| Burn shares for constituents | Melt | `redeem`, `withdraw` |
| Melted leg held back by an issuer | Claim | `Claim` |
| Receipt | Hallmark | `Hallmark` |
| Never-reused identifier | Serial | `serial` |
| Merkle root anchored on-chain | Seal | `Anchor` |
| Legal shape of a claim | Grade | `Grade` |
| Issuer powers over a token | Prerogatives | `Prerogatives` |
| Evidence evaluation | Assay | `assay` |
| Published eligibility standard | Good Delivery, NGD | `delivery` |
| Transaction making the Hall immutable | The Key | upgrade authority none |
| Basket creator and their mark | Sponsor, sponsor's mark | `sponsor` |
| One constituent or alloy on a catalogue page | Lot | view model only |
| Chain from company to wallet | Provenance | `ProvenanceChain` |
| Prerogatives plus evidence state, stated factually | Condition report | view model only |

### Naming rules for anything new

1. Reach first for a real term from assaying, hallmarking, bullion or the auction catalogue. Real terms carry real authority.
2. One word where possible. Never a compound invented to sound premium.
3. Never crypto slang, never Latin or Roman pastiche, never "pro", "plus", "AI".
4. World names in the interface. Literal names in code, APIs and on-chain interfaces.
5. The operational label always leads on screens where money moves. The world name sits beneath it in `text.tertiary`.

---

## 4. The auction-house layer

The world supplies the vocabulary of value. The auction house supplies the grammar of presentation: how a serious institution lays out an object, its history, and its condition for a buyer who has not yet decided.

Why it fits exactly: **provenance is an auction-house term.** It means the documented chain of custody of an object. For a tokenized stock, that chain is literal and it is the thing most users never see: company, depository, custodian, token, wallet.

### The lot entry, the core content model

Every constituent page, every alloy page, and every catalogue row follows this order:

```
Lot 12
Apple Inc.
AAPLx, certificate

Provenance
Apple Inc.; The Depository Trust Company, New York;
Backed Assets (JE) Limited, custodian; tokenized as AAPLx on Solana.

Condition
The issuer can freeze this where it sits.
The issuer can pause all movement of this.
The issuer can take this back from any wallet.
Evidence: executable price verified 2s ago; issuer reference stale, 3d.

Literature
Issuer terms. Token mint. Custody attestation.
```

Rules:
- **Never an estimate.** Auction catalogues print price estimates; we do not. An estimate is a price opinion and breaks the language boundary.
- **Condition reports describe, never judge.** Same sentence for every issuer holding the same control.
- **Lot numbers are order, not rank.** Numbering is allowed because a catalogue is a sequence.
- **Provenance is always shown in full,** even when long. Truncation hides exactly the link users need to see.

### The saleroom atmosphere

Generous margins, one object per view, text set like a catalogue: serif names, sans details, hairline rules between entries, no cards chopping content into tiles. Density lives in tables, never in decoration.

---

## 5. Colour

Tokens are in `assets/tokens/seametry.tokens.json`. Never write a raw colour; the linter rejects it.

| Token | Job | Never |
|---|---|---|
| `surface.ground` | The touchstone, or paper in light mode | |
| `surface.sheet`, `raised` | One and two steps of elevation | Stack more than two |
| `surface.tray` | Housing around a key | Use as a panel |
| `text.primary` | Figures, titles, decisions | |
| `text.secondary` | Body and supporting text | |
| `text.tertiary` | Labels, ages, units. Lowest readable grey | Go lighter for anything read |
| `text.faint` | Decorative marks only | Any text a user must read |
| `accent.touch` | Keys, active tab, scrub line, focusable affordances | Status, success, decoration |
| `accent.provenance` | Unverified values, stale markers, the verified path, NGD | Loss, error, decoration |
| `accent.provenanceField` | Bars beside green, chart fills, chips | Any surface larger than a chip |
| `line.highlight` | Top-edge hairline on raised surfaces | Anything else |

**Decisions.** ALLOW renders in `text.primary`. WARN renders in `accent.provenance`. BLOCK renders as an inverted stamp: `surface.inverse` fill, `text.inverse` type. No red anywhere in the system; the strongest signal is contrast, not hue.

**Gains and losses** carry no colour. Direction is the sign.

**Contrast is measured, not assumed.** Every text token passes 4.5:1 on ground, sheet and raised in its mode; values are recorded in the token descriptions. On light mode, green is fill only; touchable text uses `text.primary` with an underline.

**Modes.** Dark is the default and the brand. Light is the certificate. Both are complete; no component may exist in only one.

---

## 6. Type

| Family | Token | Role |
|---|---|---|
| Sentient | `font.family.display` | Figures, lot names, page titles, ceremonies |
| Switzer | `font.family.ui` | Everything a user operates or scans |
| Fragment Mono | `font.family.digest` | Hashes, addresses, signatures. Never labels |

Rules:
- Every numeral is tabular and lining. Prices must not reflow as digits change.
- Display sizes use `tracking.display` (negative). Serials use `tracking.serial` (positive).
- Sentence case everywhere. No all-caps labels. No eyebrow label above every heading; a label exists only when it carries information the heading does not.
- Never accent one word of a headline with italic, bold or colour.
- Reading measure at most `size.readable` (72 characters).
- Self-host all fonts. Confirm the Fontshare licence covers web and app embedding.

Scale, in px: 12, 13, 15, 17, 20, 24, 30, 38, 48, 60, 76. Explorer display sizes use `clamp()` between adjacent steps.

---

## 7. Space, layout, radius, elevation

**Space** on a 4px base: 2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96, 128. Section rhythm on the Explorer is 96 or 128. Related items sit 8 to 16 apart; unrelated groups at least 32.

**Layout.** Explorer: 12 columns, 1200px content, 24px gutters, left-aligned reading column. Mobile: single column, 18px side margins, primary action in the bottom third inside the tray.

**Radius carries meaning.** `data` 0 for rules, rows and figures; `surface` 4 for panels; `control` fully round for anything acted on; `sheet` 28 for mobile sheets; punches use their own shapes. Two cues say "touchable": green and roundness. Never round a data row. Never square a button.

**Elevation is tone.** Ground, then sheet, then raised: each one step brighter in dark mode. Depth also comes from occlusion (a sheet covering and scaling back content) and the single `line.highlight` hairline on a raised surface's top edge. No shadows, no blur, no glow, no gradients.

**Grain.** Static monochrome noise on ground at 3 to 5 percent opacity. Never animated.

---

## 8. Motion and haptics

Motion answers a person's action or marks a ceremony. Nothing moves on its own otherwise.

| Moment | Spec |
|---|---|
| Response to touch | `duration.base`, `easing.standard`; springs on mobile: damping 18, stiffness 180 |
| Sheet open | `duration.sheet`, content behind scales to 0.955 and dims |
| Value change | settle: 5px travel, one damped overshoot, `duration.settle`. Never roll or fade |
| The Strike (ceremony) | four punches, `duration.punch` each, `duration.punchStagger` apart, scale 1.06 to 1.00; heavy haptic per punch |
| The Melt | constituent rows separate over `duration.sheet`; a held-back leg does not move |
| The Seal | seal glyph fills once over `duration.seal`; no haptic |

Libraries: GSAP on web, Reanimated and Skia on mobile. No other animation library. Every animation has a `prefers-reduced-motion` path that lands the final state instantly.

Haptics (mobile): selection on scrub boundaries; light impact on a refreshed quote; warning notification on a material requote; heavy impact per Strike punch; success notification on settlement.

---

## 9. Iconography and imagery

- Prefer a word to an icon. An icon alone never carries meaning; pair it with text or an accessible label.
- Where icons are needed: one line family at 1.5px stroke, sized 16 or 20.
- The only illustrative marks are punches, the seal glyph, and the sponsor's mark.
- No stock photography, no 3D blobs, no abstract gradients, no emoji. The Explorer's single texture is the approved ThreeUI Halftone Flow, behind content, lazy-loaded, paused off-screen.

---

## 10. Accessibility floor

Built in, never announced.

- Text contrast at least 4.5:1, large text at least 3:1, measured against the actual surface.
- Visible keyboard focus: 2px outline in `accent.provenance`, offset 3px.
- Touch targets at least 44 by 44.
- Evidence states never rely on colour: unverified is also dotted-underlined, stale also carries its age, unavailable is also written out.
- Every ceremony respects reduced motion.
- Live regions announce decisions and verification results politely.
- Numbers read correctly to screen readers: "47 days", not "47d", in accessible labels.
