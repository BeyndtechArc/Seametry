# Components

Atomic inventory. Before creating a component, find it here. If it is missing, add it here first with the same five fields, then build it.

Every component states:
- **Answers**: the one question it answers for the user. A component that answers nothing is decoration.
- **Anatomy**: its parts, built only from components above it in this file.
- **Identity**: the silhouette, material and optical rule that make it recognisable as Seametry before its copy is read.
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
**Identity:** set as a ledger entry rather than a card: an open ground, a registration notch on the left rule, and one continuous provenance line beneath the figure. The notch aligns figures when several form a column.
**States:** verified, unverified (dotted underline in `accent.provenance`), stale (age attached in `text.tertiary`), unavailable (the words "no observation"), settling (value change).
**Data:** value as integer atoms plus scale, source, observed_at, evidence_state.
**Rules:** tabular numerals always. Never a float conversion for display. Never shown without its state.

### Serial
**Answers:** which exact record is this?
**Anatomy:** `MMYY` plus seven Crockford characters, Switzer semibold, `tracking.serial`, tabular.
**Identity:** month and year sit as one struck block; the remaining characters follow after a rule-width gap. It reads as an applied mark, not an account identifier.
**States:** default, copied.
**Rules:** never truncated. Copy on tap, with confirmation "Serial copied".

### Digest
**Answers:** what is the fingerprint, and can I check it?
**Anatomy:** hex in `font.family.digest`; middle truncation at small widths with the full value on focus and in the accessible label; copy.
**Identity:** a square registration mark precedes the digest and shares its baseline. The mark is decorative and never substitutes for the full accessible value.
**Rules:** the only place monospace appears.

### Punch
**Answers:** which authority vouches for this part of the record?
**Anatomy:** outline 1px `text.tertiary`, fill one tone below its surface, `line.highlight` on the lower inner edge, single glyph.
**Identity:** each authority has a fixed struck silhouette: sponsor as a house, grade as an oval, Office as a cut corner, date as a narrow cartouche. The glyph and silhouette always travel together.
**Variants:** sponsor's mark (house shape), grade (oval), office (cut corner), date (rounded rectangle with MMYY).
**Rules:** debossed by tone, never by shadow.

### Stamp
**Answers:** does this meet the published standard, or what was decided?
**Variants:** Good Delivery (outline, `text.primary`); NGD (outline, `accent.provenance`, reasons adjacent); ALLOW (plain `text.primary`); WARN (`accent.provenance`); BLOCK (inverted: `surface.inverse`, `text.inverse`).
**Identity:** a double rule and square corners make it read as struck evidence. The reason begins on the same baseline so verdict and evidence cannot separate.
**Rules:** a stamp is always followed by its reasons. Never a bare verdict.

### Grade
**Answers:** what legal claim do I actually hold?
**Anatomy:** one word (Entitlement, Certificate, Interest, Ungraded) with a definition on focus.
**Identity:** plain text held between two short rules. It has no badge fill because grade is a classification, not a status.
**Rules:** no colour, no ranking, no metal metaphors.

### Timestamp
**Answers:** when, and which "when"?
**Anatomy:** relative ("2s ago") with absolute UTC on focus; labelled by kind: observed, received, effective, settled.
**Identity:** the kind leads in the quiet register and the relative time follows in tabular figures. A timestamp never floats without its kind.
**Rules:** never an unlabelled time on a screen about evidence.

### Key
**Answers:** what happens if I press this?
**Anatomy:** cornerless `accent.touch` plate, label and a separate icon cell, seated in a square `surface.tray` housing, height `size.key`.
**Identity:** short registration rules protrude from both horizontal edges. The tray remains when the action is disabled, like an empty keyway.
**States:** default, pressed (drops 1px, `accent.touchPressed`), disabled (tray only, label in `text.tertiary`, reason available), busy (label becomes the action in progress: "Signing").
**Rules:** verb plus object ("Approve and sign"). One key per view. Quieter than the figures above it.

### Route action
**Answers:** which destination begins the next part of this journey?
**Anatomy:** cornerless `accent.touch` fill, label and a separately housed route icon, no tray, minimum target height.
**Identity:** short registration rules protrude from both horizontal edges. Its lack of a surrounding tray distinguishes navigation from the Key's custody-changing keyway.
**States:** default, pressed, keyboard focus, unavailable with its reason adjacent.
**Data:** a real route that resolves.
**Rules:** verb plus object. Navigation only. Never submits, signs, approves or changes custody.

### Quiet link
**Answers:** which secondary destination can I inspect without leaving the current decision context?
**Anatomy:** cornerless `surface.sheet`, top and bottom rules, `text.secondary`, with an icon cell when an icon improves scanning.
**Identity:** the Quiet action silhouette rendered as a link, with no fill hue and no tray.
**States:** default, hover, keyboard focus, unavailable.
**Data:** a real route that resolves.
**Rules:** secondary navigation only. Never green-filled.

### Text action
**Answers:** where can I read the supporting record or contract?
**Anatomy:** verb-led text in `accent.touchText`; a short rule extends from the final word.
**Identity:** reads like a catalogue cross-reference rather than a button. The terminal rule is its fixed signature.
**States:** default, hover, keyboard focus, unavailable.
**Data:** a real evidence, contract or literature destination.
**Rules:** lowest action emphasis. Never used for the view's Key or route entry.

### Quiet action
**Answers:** which secondary or reversible action is available?
**Anatomy:** cornerless, `surface.sheet`, top and bottom rules, `text.secondary`, with a separate icon cell when an icon improves scanning.
**Identity:** the control keeps the Key's registration rules but has no tray and no green. Family resemblance comes from the shared edge treatment.
**Rules:** for secondary and reversible actions. Never green.

### Mode control
**Answers:** which complete colour mode is the surface using?
**Anatomy:** one square icon target in a stable position. It shows the mode that will be entered when pressed: moon for dark, sun for light.
**Identity:** the icon sits inside a tonal cell crossed by one short registration rule.
**States:** dark selected, light selected, keyboard focus.
**Data:** the selected mode, persisted in local browser storage.
**Rules:** the accessible label names the resulting mode. The control changes the full surface, not an isolated specimen, and never sits against the viewport edge.

### Field
**Answers:** what value can I supply here, and what must change if it is refused?
**Anatomy:** cornerless `surface.sheet` strip, label outside, value in `ui` medium; amounts use a custom keypad on mobile.
**Identity:** a short rule joins the outside label to the field edge. Focus turns that rule to provenance blue before it outlines the field.
**States:** default, focus, filled, invalid (message states what to change), disabled.

### Term
**Answers:** what does this word mean?
**Anatomy:** inline text with a dotted underline in `text.tertiary`; opens a definition from the glossary registry.
**Rules:** definitions come from one registry shared with the glossary pages. Never written inline.

### Rule
A hairline, `line.rule`, 0.5px on high-density screens. The primary structural device. Prefer a rule over a box.
**Identity:** an optional registration notch interrupts the line. It is the seam used to align ledger entries, never a decorative divider placed between unrelated content.

---

## 2. Molecules

### Evidence row
**Answers:** what did this source say, and when?
**Anatomy:** source name (`text.secondary`); Figure; Timestamp.
**Identity:** source, figure and time share one baseline over a ruled ledger row. Missing observations occupy the same measure as present ones.
**Rules:** a source that said nothing still gets a row: "no observation". Never omitted.

### Formula ledger
**Answers:** what exactly backs each alloy share, and what is the Hall holding for each constituent now?
**Anatomy:** source, Timestamp and evidence state in the caption; one zero-radius row per constituent; symbol and Grade; units per share; ledger, pending and unclaimed amounts; delivery statement.
**Identity:** a single registration rule runs through every row, while a clipped caption plate names the source above it. The rows remain open and square like a bullion ledger, never separated into cards.
**States:** default; loading uses ruled skeleton rows; empty states that no formula has been recorded; stale keeps every amount and attaches its age; unavailable names the absent source; error names the source that could not be read.
**Data:** `Alloy.legs`, joined with `FormulaConstituent.units_per_share`, instrument symbol and Grade; every amount remains integer atoms plus scale.
**Rules:** never derive weights, NAV or units per share in the interface. One caption provenance applies only when every row shares the same source, age and evidence state; otherwise each row carries its own.

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
**Identity:** the four punches form one uninterrupted strike line with equal optical weight, followed by the serial on the same left edge. It must remain recognisable in one colour.
**States:** unsealed, sealed, verification pending, verified, does not match.

### Quote block
**Answers:** what will I actually get?
**Anatomy:** expected output; floor ("You receive no less than") set larger than expected; every fee line; route; expiry countdown.
**Rules:** the floor is the promise and outranks the estimate. An expired quote cannot be approved.

### Claim line
**Answers:** what does this do for me, in one line?
**Anatomy:** bold lead of two to four words, then one plain sentence. ("Keyless by design. No instruction exists that can change a formula or stop a melt.") Where a claim needs to be seen as a mechanism, it becomes a Mechanism plate instead.
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

### Pagination
**Answers:** which part of a long published register am I reading, and where can I continue?
**Anatomy:** previous page when one exists; numbered page links; next page when one exists; current page stated with `aria-current`.
**States:** first page; middle page; last page; one page, in which case the component is absent.
**Data:** total rows, rows per generated page, current page and stable page URLs.
**Rules:** use only when the register outgrows one useful reading surface. Every page remains a complete static document and every row remains reachable without JavaScript. Pagination never replaces a filter when the user's question is categorical.

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

### Modal sheet
**Answers:** which focused task or summary can I inspect without losing the page that produced it?
**Anatomy:** native dialog; quiet register label; title; caller-owned body; explicit close action; optional footer. The body uses registered atoms and molecules only.
**Identity:** a full-height registration-cut plate at the inline end on wide screens and a `radius.sheet` plate rising from the bottom on narrow screens. One top highlight rule and tonal elevation establish occlusion; there is no shadow, blur or glow.
**States:** closed; open. Loading, empty, stale, unavailable and error belong to the caller's content and retain the sheet's measure.
**Data:** accessible title, close label and caller-owned content. The component owns no product data.
**Rules:** use the native dialog focus and Escape contract; restore focus to the opening control; label the dialog from its visible title. An end sheet is for review or a bounded task, never generic navigation. It does not create a second Key. Opening motion uses `duration.sheet`; reduced motion lands immediately.

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

### House rail
**Answers:** where am I, and which public destination is available from here?
**Anatomy:** Brand mark and wordmark; text-led public navigation for Home and the reading pages; one Route action, "Open app"; Mode control.
**Identity:** a contained institutional rail with square registration cuts. It rests as an opaque plate, floats below the viewport edge, and enters the Lens material only after scroll. The wordmark is serif, destinations remain visible as text, and the mode instrument sits inside the closing tools group.
**States:** resting; scrolled Lens; current destination; narrow layouts disclose destinations in a ruled register.
**Data:** route labels and destinations owned by the web application.
**Rules:** every destination resolves. On wide layouts there is no menu icon, promotional badge, tag beside the wordmark, or Key inside the rail. The current destination changes to the action green without adding an underline. On narrow layouts the two-line, icon-only, accessibly labelled menu sits directly before the enlarged mark and opens a bold ruled register containing every public reading destination. The compact "App" action and mode control remain at the terminal end and never repeat inside the register. Product surfaces (Allocation, the Hall, the Terminal) are not public destinations: they live in the App shell, reached by the app action. Wallet state belongs to the App shell, not here.

### Brand mark
**Answers:** whose house is this?
**Anatomy:** the house's mark beside the serif wordmark, one component used by every shell, so replacing the mark changes it everywhere at once.
**States:** mark registered; no mark supplied yet (a neutral square outline, stated as a placeholder in the component, never invented as a logo).
**Rules:** never a tag, badge or product name beside it. The mark is one colour and survives at 16px.

### App shell
**Answers:** where am I in the product, on which network, with which wallet?
**Anatomy:** wide layouts: a Sidebar (Brand mark; route groups Desk, Buy, Hall, Assay; the reading pages last) and a sticky Top bar (the current group and page, Wallet state, Mode control) above the page. Narrow layouts: a compact Top bar with the enlarged mark, an independently outlined Wallet state, then a utility rail containing the green Mode control and an icon-only, accessibly labelled menu control. The menu is the terminal control. It opens a full-width ruled navigation register containing every product and reading route. The Network badge sits in each page's Page header, because only the page knows which cluster it acts on.
**Identity:** a compact ledger margin: the sidebar is a contained ruled column with text-led product routes and a cropped one-ink Hall pilaster at its lower edge. Icons are reserved for the two reading links at the bottom, where they distinguish an exit from the operational register. The current sidebar route carries a registration rule; the House rail uses only the action-green label because its destinations share one horizontal line.
**States:** current route; narrow; wallet disconnected or connected; each page's network.
**Data:** one route list that drives the sidebar and the narrow navigation register, so they cannot disagree.
**Rules:** one route list. Every route resolves. The narrow menu is labelled, keyboard-operable and closes after navigation. It replaces the fixed tab bar and does not duplicate the product navigation. The shell names the current route once; a page header appears only when it adds network or decision context that the shell cannot carry.

### Page header
**Answers:** what is this page, and what does it act on?
**Anatomy:** group label; title; one sentence at most; Network badge; optional quiet links.
**Rules:** one sentence, not a paragraph. Explanation belongs on the reading pages, linked, not repeated here.

### Network badge
**Answers:** which cluster does this page read or write?
**Anatomy:** square double-ruled mark, as a Stamp: "Mainnet", "Devnet", or "Mainnet evidence" for captured reads that write nothing.
**Rules:** present on every page in the App shell. Mainnet in text primary, Devnet in provenance blue. Never green: it is a statement, not an action.

### Wallet state
**Answers:** is a wallet connected to this site, which one, and how do I change that?
**Anatomy:** disconnected: a Quiet action "Connect wallet" opening a list of the wallets this browser offers, each "Connect <name>". Connected: a registration dot and the address truncated in the middle, opening the full address and "Disconnect wallet".
**Identity:** an outlined square registration control inside the App shell's top-bar control rail. On narrow layouts it precedes the mode and menu controls and ends with its wallet glyph. It reads as the state of the room, not as an invitation to trade.
**States:** disconnected; no wallet detected ("No wallet was detected in this browser. On a phone, open this site inside your wallet's own browser."); connecting ("Connecting"); connected; the disclosure open or closed, by keyboard as well as pointer.
**Data:** the site-wide wallet session; the list of detected Wallet Standard wallets.
**Rules:** never green, never a Key: connecting a wallet moves no custody and signs nothing. The full address is always one step away, never only the truncation.

### Incident ledger
**Answers:** what happened in the recorded demonstration, in what order, and which step proves the product claim?
**Anatomy:** source plate; ordered event rows; actor; action; result; reason or transaction Digest; evidence boundary.
**Identity:** events occupy one ruled ledger crossed by a single registration line. Refusals remain in sequence instead of becoming coloured alerts.
**States:** default; loading names the transcript; empty names the absent scenario; stale keeps the sequence and attaches capture age; unavailable links to the specification; error names the unreadable evidence source.
**Data:** one scenario from the Hall demonstration transcript, including producer, actor, action, result, reason and signature.
**Rules:** event order is source order. Never infer a result, shorten a reason, or imply that controlled mock issuers establish how another issuer behaves.

### Open AP field
**Answers:** who can create and redeem an Alloy, and what moves in each direction?
**Anatomy:** Formula rail; central Alloy register; Strike path from any wallet; Melt path back to claims; issuer boundary.
**Identity:** a static mechanism diagram drawn from the same registration lines, square evidence nodes and round action nodes as the product. It is a functioning component composition, not a decorative illustration or screenshot.
**States:** default; narrow layout stacks the two paths while retaining direction in words; unavailable replaces the centre with the missing Hall state.
**Data:** Hall mechanism guarantees only. No market quantity, price or participant count.
**Rules:** no arrows without text, animation, invented market activity or implication that a wallet without the required assets can Strike.

### Mechanism plate
**Answers:** what does one Hall guarantee look like as a mechanism, before the reader parses the sentence?
**Anatomy:** an isometric line drawing above a two-to-four-word title and one plain sentence, inside a ruled plate. The drawing is built from blocks, plinths, dashed paths and small floor annotations set along the isometric plane.
**Identity:** one line ink on the sheet. Exactly one solid object, in the action green, marks the touchable thing (the share, the Formula, the constituent the holder can move). A recorded fact may carry its annotation in provenance blue. Faces are flat paper that hide what is behind them; the solid object alone takes the pressed green on its sides so it reads as a body. No other shading, shadow, gradient or perspective.
**States:** default; narrow layouts stack plates one per row with the drawing kept at full width.
**Data:** none. Annotations name register nouns and Hall rules only, never a market quantity, price, count or participant.
**Rules:** every drawing depicts the sentence beneath it and nothing the product cannot do. Annotations are lower case nouns or short phrases, never instructions. Built only from the shared plate primitives in `@seametry/ui/plates`, so stroke, projection and type cannot drift between plates.

### Pattern Register
**Answers:** does each shared component retain Seametry's identity across states, themes, widths and difficult content?
**Anatomy:** house plate; atom specimens; molecule specimens; universal state assay; dark and light stress bench.
**Identity:** presented as the Office's working register, with cropped display type, one registration-cut house plate, numbered specimens, ruled entries and labelled fixture evidence. It is never a tiled retail component catalogue.
**States:** every universal state is visible together. Interactive states include focus, disabled and busy. Motion specimens state their reduced-motion behavior.
**Data:** labelled fixtures only, with source, age and evidence state wherever a figure appears.
**Rules:** internal development surface. No product navigation, invented market values, isolated beauty shots or unlabeled sample data.

---

## 4. Templates

Composition specs live in `patterns.md`. Available templates:

Explorer: Landing, Lot, Alloy, Hallmark, Catalogue, Glossary term, Changelog, Status, The Key.
Mobile: Today, Lot, Order sheet, Hallmark, Claims, Activity, Settings, About.
