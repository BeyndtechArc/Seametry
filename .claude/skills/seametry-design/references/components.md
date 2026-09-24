# Components

Atomic inventory. Before creating a component, find it here. If it is missing, add it here first with the same five fields, then build it.

Every component states:
- **Answers**: the one question it answers for the user. A component that answers nothing is decoration.
- **Anatomy**: its parts, built only from components above it in this file.
- **States**: every state it can be in. All must be designed; none may be left to the default.
- **Data**: the API fields it renders. Never invented values.
- **Rules**: what it must never do.

Universal states, required unless stated otherwise: default, loading, empty, stale, unavailable, error. Loading is a rule-line skeleton plus a sentence naming what is loading. Never a spinner.

## Contents
1. Atoms
2. Molecules
3. Organisms
4. Templates

---

## 1. Atoms

### Figure
**Answers:** what is the value, and how much should I trust it right now?
**Anatomy:** numeral in `font.family.display` or `ui` by size; unit; age; evidence-state treatment.
**States:** verified, unverified (dotted underline in `accent.provenance`), stale (age attached in `text.tertiary`), unavailable (the words "no observation"), settling (value change).
**Data:** value as integer atoms plus scale, source, observed_at, evidence_state.
**Rules:** tabular numerals always. Never a float conversion for display. Never shown without its state.

### Serial
**Answers:** which exact record is this?
**Anatomy:** `MMYY` plus seven Crockford characters, Switzer semibold, `tracking.serial`, tabular.
**States:** default, copied.
**Rules:** never truncated. Copy on tap, with confirmation "Serial copied".

### Digest
**Answers:** what is the fingerprint, and can I check it?
**Anatomy:** hex in `font.family.digest`; middle truncation at small widths with the full value on focus and in the accessible label; copy.
**Rules:** the only place monospace appears.

### Punch
**Answers:** which authority vouches for this part of the record?
**Anatomy:** outline 1px `text.tertiary`, fill one tone below its surface, `line.highlight` on the lower inner edge, single glyph.
**Variants:** sponsor's mark (house shape), grade (oval), office (cut corner), date (rounded rectangle with MMYY).
**Rules:** debossed by tone, never by shadow.

### Stamp
**Answers:** does this meet the published standard, or what was decided?
**Variants:** Good Delivery (outline, `text.primary`); NGD (outline, `accent.provenance`, reasons adjacent); ALLOW (plain `text.primary`); WARN (`accent.provenance`); BLOCK (inverted: `surface.inverse`, `text.inverse`).
**Rules:** a stamp is always followed by its reasons. Never a bare verdict.

### Grade
**Answers:** what legal claim do I actually hold?
**Anatomy:** one word (Entitlement, Certificate, Interest, Ungraded) with a definition on focus.
**Rules:** no colour, no ranking, no metal metaphors.

### Timestamp
**Answers:** when, and which "when"?
**Anatomy:** relative ("2s ago") with absolute UTC on focus; labelled by kind: observed, received, effective, settled.
**Rules:** never an unlabelled time on a screen about evidence.

### Key
**Answers:** what happens if I press this?
**Anatomy:** full-round fill in `accent.touch`, `text.onTouch`, seated in an 8px `surface.tray` housing, height `size.key`.
**States:** default, pressed (drops 1px, `accent.touchPressed`), disabled (tray only, label in `text.tertiary`, reason available), busy (label becomes the action in progress: "Signing").
**Rules:** verb plus object ("Approve and sign"). One key per view. Quieter than the figures above it.

### Quiet action
**Anatomy:** full-round, `surface.sheet`, 0.5px `line.rule` edge, `text.secondary`.
**Rules:** for secondary and reversible actions. Never green.

### Field
**Anatomy:** full-round pill, `surface.sheet`, label outside, value in `ui` medium; amounts use a custom keypad on mobile.
**States:** default, focus, filled, invalid (message states what to change), disabled.

### Term
**Answers:** what does this word mean?
**Anatomy:** inline text with a dotted underline in `text.tertiary`; opens a definition from the glossary registry.
**Rules:** definitions come from one registry shared with the glossary pages. Never written inline.

### Rule
A hairline, `line.rule`, 0.5px on high-density screens. The primary structural device. Prefer a rule over a box.

---

## 2. Molecules

### Evidence row
**Answers:** what did this source say, and when?
**Anatomy:** source name (`text.secondary`); Figure; Timestamp.
**Rules:** a source that said nothing still gets a row: "no observation". Never omitted.

### Provenance line
**Answers:** through whose hands does my claim pass?
**Anatomy:** ordered chain, company to wallet, each link named with its role, separated by semicolons, set like a catalogue entry.
**Data:** registry provenance chain.
**Rules:** always complete, never truncated. The custodian link is the one users most need to see.

### Condition report
**Answers:** who can act on this token, and what is its evidence state?
**Anatomy:** one plain sentence per prerogative, then one evidence summary line.
**Rules:** identical sentence for identical controls across issuers. Unknown extensions appear as "An unrecognised control is present."

### Hallmark row
**Answers:** is this record vouched for, by whom, and when?
**Anatomy:** four Punches (sponsor's mark, weakest grade, office, date), Serial beneath, seal status.
**States:** unsealed, sealed, verification pending, verified, does not match.

### Quote block
**Answers:** what will I actually get?
**Anatomy:** expected output; floor ("You receive no less than") set larger than expected; every fee line; route; expiry countdown.
**Rules:** the floor is the promise and outranks the estimate. An expired quote cannot be approved.

### Claim line
**Answers:** what does this do for me, in one line?
**Anatomy:** bold lead of two to four words, then one plain sentence. ("Keyless by design. No instruction exists that can change a formula or stop a melt.")
**Rules:** the lead must be literally true of the shipped product.

### Decision row
**Answers:** what did the policy decide, for whom, and why?
**Anatomy:** actor or instrument; action; Stamp; first reason code in words; link to evidence.

### Changelog entry
**Anatomy:** relative date, title, one sentence, link. Dates are real.

### Definition
**Anatomy:** term in display serif, one-sentence definition, "Where you meet it" link, related terms.

---

## 3. Organisms

### Lot header
Top of every constituent and alloy page. Lot number; name in display serif; ticker and Grade; hero Figure with evidence state; the Key in the thumb zone on mobile.

### Catalogue table
**Answers:** what is in this set, and which entries meet the standard?
Columns: Lot, Name, Grade, Condition summary, Evidence, Stamp. Sortable. Rows are data: radius 0, rules between, no zebra fills heavier than one tone.
Directly inspired by Infisical's certificate table, carrying our data.

### Assay matrix
**Answers:** how did each source's view of this instrument change over time?
Sources as rows, time as columns, cells as evidence states; divergence marked in `accent.provenance`. Scrub reveals exact values.

### Replay timeline
**Answers:** what happened, in what order, during an incident?
One horizontal time axis; corporate action, issuer state, oracle observations, executable route on separate lanes; scrubbable; every event linkable. The Explorer landing uses the UNHx case.

### Live assay feed
**Answers:** what is the policy deciding right now?
A stream of Decision rows, newest first, paused on hover, each linking to its evidence. The Directus pattern, with real decisions.

### Verification ritual
**Answers:** can I check this myself without trusting Seametry?
Serial field; public record; digest; commitment and leaf; Merkle path; root comparison; seal. Computed in the visitor's browser. Tamper control. Closing line only on a real match. Reference implementation exists in the prototype.

### Order sheet (mobile)
Amount, plan, Quote block, path, approval Key, expiry. Occludes the page behind; no shadow.

### Melt panel
Constituent rows, each deliverable or held as a Claim with its reason. Held rows stay still.

### Proof strip
**Answers:** what can I verify about this institution right now?
Only verifiable facts, each a link: hallmarks sealed, last seal (relative), program ID, the Key or "Key still in hand", source code, status. Replaces the logo marquee and vanity counters.

### Agent panel
**Answers:** how do I use this from my own agent or code?
Copyable prompts and endpoints, the machine-readable site version, the API reference. The Langfuse pattern.

### Register footer
Product, developers, the house (world pages), trust (the Key, audit, status, anchor keys). Every item is a real destination.

---

## 4. Templates

Composition specs live in `patterns.md`. Available templates:

Explorer: Landing, Lot, Alloy, Hallmark, Catalogue, Glossary term, Changelog, Status, The Key.
Mobile: Today, Lot, Order sheet, Hallmark, Claims, Activity, Settings, About.
