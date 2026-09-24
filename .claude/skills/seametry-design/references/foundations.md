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

**Contrast is measured, not assumed, and "calm" is never an excuse for a value that fails its check.** Calm has a real place in this system, but it's built from hierarchy, weight and space: a smaller size, a lighter weight, more room around it. Those all keep contrast intact while lowering visual pressure. A colour that fails 4.5:1 isn't calmer, it's just harder to read, and on a screen where a number decides whether someone signs a transaction, that's a defect, not a mood. Every text token passes 4.5:1 on its permitted surfaces (recorded in the token descriptions); the one exception is `text.faint`, which is reserved for genuinely decorative marks nobody needs to read, and that reservation is the actual place "quiet" lives in this system.

**Modes.** Dark is the default and the brand. Light is the certificate. Both are complete; no component may exist in only one.

---

## 5a. Two grounds, not one

An earlier draft tried to make the olive brand hue serve as the single default ground. It doesn't work cleanly: at roughly 3 percent luminance, olive leaves too little headroom before `text.tertiary` fails contrast on any elevated surface, which forces the whole hierarchy to compress. The resolve is two ground tracks rather than one compromise value, which is also the direct answer to "the olive shouldn't replace the current background, it should complement it."

**`surface.*` (operational, default).** Neutral near-black. Used for every data-dense, decision-bearing screen: catalogue tables, order sheets, hallmark rows, the Assay matrix, Today, Lot, Claims. Full contrast headroom; `text.tertiary` and `accent.touchText` are unrestricted here.

**`feature.*` (the olive track, reserved).** Used only on named feature surfaces: the Explorer landing hero, an alloy's ceremony panel (the Strike), a sponsor's profile header, marketing cards on the Catalogue's editorial rows. Never the app's default background. `feature.text.secondary` is restricted to `feature.ground` and `feature.sheet`; there is no `feature.text.tertiary` token, because the olive ground doesn't have the budget for a third readable step. If a feature surface needs a third level of emphasis, use weight or size, not a lower-contrast colour.

Before using `feature.*` anywhere, check the list above. Adding a new feature surface is a decision, not a default.

## 5b. Colour weight: tonal scales, and where they earn their keep

Real depth on this system doesn't come from effects, it comes from using a colour family at different weights against itself and against the ground, the way a print house layers inks. `scale.touch`, `scale.provenance` and `scale.olive` in the token file are 12-step perceptual ramps generated by `scripts/generate-scale.mjs` from an OKLCH model, not picked by eye. That matters: adjacent steps in a perceptually even ramp never clash, which is what lets you combine two or three steps of one family and have it read as considered rather than arbitrary. This is the systematic version of the "alien, premium" effect from layering hues: the ramp is the discipline that keeps it from sliding into slop.

Rules for using a scale rather than a single semantic token:
- **Two steps maximum per component.** A third invites the muddy, over-layered look this is meant to avoid.
- **The scale stays inside its own family.** Never mix `scale.touch` and `scale.provenance` steps in one composition; that's what keeps green meaning touchable and blue meaning provenance even when you're using six shades of each across the app.
- **Opacity is the third lever**, used sparingly: a `scale.touch.700` shape at 12 to 20 percent opacity behind a `scale.touch.500` foreground element reads as depth. Above 30 percent it starts reading as a filter over the surface, not a material.
- Scale steps are for illustration, background wash, chart fills and the Lens material below. They are not a substitute for the semantic tokens (`text.*`, `accent.*`) in interface chrome, which stay tied to their contrast guarantees.

## 5c. The Lens, a restricted material

What was being reached for as "liquid glass" has a real, specific referent: Apple's Liquid Glass material, announced June 2025, a rendering model rather than a style recipe. It genuinely refracts and reflects what's behind it in real time, which is a different thing from glassmorphism's flat blur-plus-transparency. Even Apple restricts where it goes: their own guidance keeps it on the navigation layer and explicitly off content like lists, tables and text blocks.

Seametry's version, **the Lens**, is scoped tighter still: illustration and ceremony surfaces only, never navigation, never content, never a data row. Think jeweller's loupe, not a phone screen dipped in glass: something you look through for a moment to inspect one object closely.

**Where the Lens may appear, and nowhere else:**
- A hover or long-press reveal on a lot's illustrative hero image, for closer inspection.
- The specular pass inside the Strike ceremony's punch reveal.
- One reserved marketing surface on the Explorer landing, if it earns its place.

**Built in two phases.**

*Phase 1, ship this.* Backdrop blur plus a specular highlight, which is most of what reads as glass and costs almost nothing. The specular edge extends the existing `line.highlight` token with a second, brighter inset line along the same edge for the glint: `inset 0 1px 0 rgba(255,255,255,.14), inset 0 .5px 0 var(--sm-line-highlight)`. Tint the panel with two steps from the relevant tonal scale, never a flat white or black overlay.

*Phase 2, only with time to spare.* True refraction. On mobile this is genuinely reachable: React Native Skia supports a runtime shader that displaces the pixels behind a surface, which is the actual mechanism. On web the honest technique is an SVG `feDisplacementMap` driven by a turbulence map, since `backdrop-filter` alone cannot displace pixels however it's stacked. Treat this as a stretch goal for one component, not a requirement; a botched refraction shader reads cheaper than no refraction at all.

**Enforcement.** The Lens may only be implemented inside a path matching `lens/`, `components/lens/`, or `illustrations/`. The linter's `lens-scope` rule blocks `backdrop-filter`, `feDisplacementMap` or `feTurbulence` anywhere else.

## 5d. On using Directus as a starting point

Directus itself, the source code, is GPL-3.0. That's a copyleft licence: building on its actual code, even restructured, would put an obligation on the derivative work to also be GPL-licensed if it's ever distributed, which is very likely not the outcome anyone wants for a commercial product. This is a real legal exposure, not a style note, in the same category as the security-entitlement question earlier in this build.

What's safe, and what was genuinely valuable about the reference, is already captured in section 2's table: the pattern of a live governed-action stream as the hero, and the layout rhythm of a dense admin dashboard done with restraint. Copyright doesn't protect a layout idea or an interaction pattern, only the literal expression, so studying the screenshots and rebuilding the pattern from the component contracts in `components.md` is correct and fully safe. Don't clone the repository as a scaffold.

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

**Elevation is tone.** `surface.ground` to `surface.sheet` to `surface.raised` to `surface.tray` step up in luminance on the neutral operational track, with full contrast headroom, since section 5a moved the olive hue to its own reserved `feature.*` track rather than forcing it to serve as the app's single default ground. See 5a for the two-ground structure and why it changed, and 5b to 5d for the tonal scales, the restricted Lens material, and a licensing note on using Directus as a reference.

Depth also comes from occlusion (a sheet covering and scaling back content) and the single `line.highlight` hairline on a raised surface's top edge. No shadows, no blur, no glow, no gradients, except the Lens material, which is scoped and enforced as described in 5c.

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
