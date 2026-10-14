# Components

Atomic inventory. Before creating a component, find it here. If it is missing, add it here first with the same five fields, then build it.

Every component states:
- **Answers**: the one question it answers for the user. A component that answers nothing is decoration.
- **Anatomy**: its parts, built only from components above it in this file.
- **Identity**: the silhouette, material and optical rule that make it recognisable as Seametry before its copy is read.
- **States**: every state it can be in. All must be designed; none may be left to the default.
- **Data**: the API fields it renders. Never invented values.
- **Rules**: what it must never do.

Universal states, required unless stated otherwise: default, loading, empty, stale, unavailable, error. Loading is a rule-line skeleton plus a sentence naming what is loading. Never a spinner, except the running Status mark of a request the user started: in a Step register, a Timeline, a Toast, or a busy Key.

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
**Rules:** a stamp is always followed by its reasons. Never a bare verdict. Beside a Grade, the reason drops to its own line inside the Mark line.

### Grade
**Answers:** what legal claim do I actually hold?
**Anatomy:** one word (Entitlement, Certificate, Interest, Ungraded) with a definition on focus.
**Identity:** a badge of the Stamp's family (square corners, 3px double `line.strong`, micro semibold) led by a glyph that names the legal shape: Entitlement a bank, Certificate a certificate, Interest a pie slice, Ungraded a question mark. It sits on the Stamp's line, to its left, a short vertical hairline between them, so backing and verdict read in one glance and the glyph tells the backings apart before the word is read (Storm, 7 October 2026).
**Rules:** neutral, never green: green says touchable and a grade is not. No ranking, no metal metaphors. Every grade wears the same frame; only glyph and word differ.

### Lot mark
**Answers:** which instrument is this, at a glance?
**Anatomy:** a square tile at the symbol's left, sharing its row, in one of three sizes: row beside a one-line symbol, list beside a symbol with a second line, header beside a title. It shows the issuer's logo as mirrored at capture; with no captured logo it shows the symbol's leading letters on `surface.inverse`. Several marks for one Alloy may overlap as a round stack in a sunken tray.
**Data:** the image path from `shared/evidence/instrument-logos.json`, written by `go run ./server/cmd/capture -logos` from the URI the issuer wrote into the mint. Keyed by mint address, never by symbol, since two issuers can share a ticker.
**States:** captured logo; lettered tile when the manifest records any other state or has no entry for the mint; lettered tile if a mirrored logo file fails to load (404, refusal or other browser error).
**Rules:** every captured path remains mint-address-keyed and locally mirrored with a content digest. Never link directly to an issuer's server or borrow a logo from another tokenized representation with the same ticker. Browser image failures replace the image with a stable lettered tile rather than an empty/broken image. Decorative (`alt=""`): the symbol always stands beside it as text, and the mark never replaces it. Carries no hue of its own beyond the issuer's picture.

### Timestamp
**Answers:** when, and which "when"?
**Anatomy:** relative ("2s ago") with absolute UTC on focus; labelled by kind: observed, received, effective, settled.
**Identity:** the kind leads in the quiet register and the relative time follows in tabular figures. A timestamp never floats without its kind.
**Rules:** never an unlabelled time on a screen about evidence.

### Key
**Answers:** what happens if I press this?
**Anatomy:** cornerless `accent.touch` plate, label and a separate icon cell in `accent.touchPressed` with no rule between them, seated in a square `surface.tray` housing, height `size.key`.
**Identity:** short registration rules protrude from both horizontal edges. The tray remains when the action is disabled, like an empty keyway.
**States:** default, pressed (drops 1px, `accent.touchPressed`), blocked (reads as unavailable, reason shown beside it, and still answers a press: a Process dialog names the reason and offers the action that resolves it, such as "Adjust amount" or "Melt instead"; a Key that goes dead without explaining was removed, Storm, 13 October 2026), busy (truly disabled; label becomes the action in progress: "Signing"). A Key with no reason to give is never disabled.
**Rules:** verb plus object ("Approve and sign"). One key per view. Quieter than the figures above it.

### Route action
**Answers:** which destination begins the next part of this journey?
**Anatomy:** cornerless `accent.touch` fill, label and a separately housed route icon in `accent.touchPressed` with no rule between them, no tray, minimum target height.
**Identity:** short registration rules protrude from both horizontal edges. Its lack of a surrounding tray distinguishes navigation from the Key's custody-changing keyway.
**States:** default, pressed, keyboard focus, unavailable with its reason adjacent.
**Data:** a real route that resolves.
**Rules:** verb plus object. Navigation only. Never submits, signs, approves or changes custody. Moving forward a step inside one page is navigation too, so a Step track's Continue is a Route action rendered as a button.

### Quiet link
**Answers:** which secondary destination can I inspect without leaving the current decision context?
**Anatomy:** cornerless `surface.sheet`, top and bottom rules, `text.secondary`, with an icon cell when an icon improves scanning, drawn as the Quiet action's is.
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
**Anatomy:** cornerless, `surface.sheet`, top and bottom rules, `text.secondary`, with a separate icon cell when an icon improves scanning: the glyph in the label's colour behind a hairline, never an ink block.
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

### Info note
**Answers:** what does this page assume, for someone who wants to know before acting?
**Anatomy:** an info glyph beside a title, as a disclosure; opening it shows a short note in a `surface.raised` panel below the glyph, top hairline, no shadow. At most three sentences.
**States:** closed, open (tap, click or keyboard; the glyph stays the control that closes it).
**Rules:** holds terms already stated where they act, never the only place they appear: a fee or slippage figure in the note is also a line on the order sheet. Never holds an action or a figure without its provenance. One per page header.

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

### Holdings ledger
**Answers:** which listed instruments does this wallet hold on mainnet now, and which can it select for an exit quote?
**Anatomy:** wallet and RPC observation caption; one ruled row per mint with Lot mark, symbol, exact token quantity and a quiet selection action.
**Identity:** open catalogue rows, not cards; a registration rule keeps the amounts aligned.
**States:** observed; loading names the balance read; empty names the connected wallet without listed holdings; stale retains the last observed rows with age; unavailable names the missing RPC; error states what must be retried.
**Data:** wallet address; observed_at; mainnet RPC source; mint, token program, integer atoms and scale; admissions snapshot symbol.
**Rules:** never infer holdings from past purchases, never show a fabricated price or imply a reverse route exists until quoted. Instruments outside the admissions snapshot are named as outside this ledger, not silently represented as zero.

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

### Step register
**Answers:** what is this multi-step request doing right now, what has already happened, and if it stopped, why and what was left untouched?
**Anatomy:** a vertical ordered list. Each step has a round status mark joined to the next by a trailing connector line, a short verb-plus-object title, and at most one short line, shown only while the step is running or stopped. Marks: waiting shows the step's own glyph on the quiet surface; running shows a turning ring in `accent.provenance`; done shows a check in ink, and the connector below it turns ink; stopped shows an X on `surface.inverse`, the same inversion a BLOCK stamp uses. A stopped step's line is a plain sentence, with the raw technical message behind a "Technical detail" disclosure. The state is also given as visually hidden text. Announced through a polite live region.
**States:** waiting (every step waiting); in progress (one running, earlier ones done); stopped (one stopped, later ones waiting); complete (every step done).
**Data:** caller-owned steps, glyphs and states. The component owns no product data and never rewrites a technical message; the caller supplies both the plain sentence and the raw one.
**Rules:** a step is understood from its title and mark alone; anything longer belongs to the page, not the step. No percentage, and time is not estimated. A stopped step always says what did not happen (nothing signed, nothing founded) when that is the case. The raw message is never the only explanation. The turning ring is the only spinner the system allows, and under reduced motion it holds still.

### Process dialog
**Answers:** what is the request I just started doing, without leaving the page that started it?
**Anatomy:** native dialog centred in the viewport; quiet register label; title; a Step register; an icon-only round close control labelled for assistive technology, a named full-round case; optional footer for the one follow-up action.
**Identity:** a `radius.sheet` plate with the single top highlight rule and tonal elevation; no shadow, blur or glow.
**States:** closed; open. The request's own states live in its Step register.
**Rules:** for watching a request (founding, signing, confirming), never for a task the user edits; that is the Modal sheet. The editable sheet carries its own Step track before the request starts. A purchase or sale watches only its waits before the wallet (checking routes, approving) here; on approval the dialog closes and its Toast and Activity record carry it (Storm, 14 October 2026). A Hall ceremony (Strike, Melt) keeps its dialog until it lands: when it ends, close its progress dialog and open a separate outcome dialog, so confirmation never masquerades as another running step. Closing does not cancel the request, and the opening surface offers a way back. Native focus and Escape contract; focus returns to the opening control.

### Status mark
**Answers:** where does this thing stand: waiting, running, done, partly done, or stopped?
**Anatomy:** a round mark on the quiet surface holding one glyph: the caller's own while waiting, a turning ring while running, a check when done, a half disc when partly done, an X when stopped. The state is also given as visually hidden text. Two sizes: row, and compact for a Toast.
**States:** waiting, running, done, partial, stopped; reduced motion holds the ring still.
**Data:** caller-owned state.
**Rules:** the only moving mark in the system, and it moves only for a request the user started and is waiting on. Never the only carrier of meaning: a word beside it always states the same thing. `@seametry/ui/timeline`.

### Timeline
**Answers:** what happened to each part of this request, in order, and what did each part move?
**Anatomy:** an ordered list; each item is a Status mark joined to the next by a connector rule, a title (the constituent), a right-aligned figure (what it spent, and what it received once known), and detail below: the phase in words, the plain problem when it did not land with the raw error behind a "Technical detail" disclosure, and its Id.
**States:** every item waiting, running, done or stopped; a record mixes them.
**Data:** an execution record's legs (`lib/execution/record.ts`). Received quantities come from the confirmed transaction's balance changes, never from the quote.
**Rules:** figures are exact atoms at their scale with their unit; no USDC value is invented for a token amount.

### Id
**Answers:** which transaction or account is this, and where can I check it?
**Anatomy:** the identifier shown by its first and last six characters in the digest face, an icon to copy it whole whose glyph turns to a check for two seconds, and an icon that reads it on Solscan. Both icons carry labels for assistive technology; no visible word says "copy", "copied" or "open".
**States:** default; copied.
**Data:** a signature or address, never truncated in what is copied.
**Rules:** never the only place a signature appears for a request that did not settle; the Activity record keeps it. `@seametry/ui/id`.

### Toast
**Answers:** what is the request I just started doing now that I have moved on, and what do I do next?
**Anatomy:** a raised plate in the bottom corner (above the phone tab bar): a compact Status mark, a one-line headline ("Buying Prime Seven"), one line of progress or outcome, up to three lot marks, an icon-only dismiss, and at most one next action below. Pressing the body opens the request's Activity record.
**States:** running (stays while any leg is open); finished (stays six seconds after the last leg ends, then leaves); dismissed. At most three at once, newest nearest the edge.
**Data:** one execution record; the headline, line and action come from `headline`, `progressLine`, `outcomeLine` and `nextAction` in `lib/execution/record.ts`, so every surface says the same thing.
**Rules:** never holds the only copy of anything: the record stays in Activity. Not a ceremony; motion is entry, exit and the running mark only. `@seametry/ui/toast`.

### Activity
**Answers:** what has this browser bought or sold, did each part land, and what can I do about what did not?
**Anatomy:** an icon in the App shell header with the count of finished records not yet seen, opening a Modal sheet that lists every record newest first: a Status mark, headline, outcome sentence and age, the record's Timeline, and its one next action (View holdings, Buy the other n, Sell again, Read on Solscan). Holdings shows the same list for the connected wallet.
**States:** empty ("Nothing bought or sold from this browser yet."); records settling, settled, partly settled, nothing moved, needs attention.
**Data:** device-local execution records, watched by one loop in the App shell (`lib/execution/watcher.ts`) that reads every open leg in one request per tick.
**Rules:** a leg is never left open past its blockhash deadline once the chain can be read; while it cannot be, the record says so after 45 seconds instead of spinning. Wallet balances stay the authority over what is held.

### Step track
**Answers:** where am I in this flow, and what is left?
**Anatomy:** the flow's steps in order on one trace: each a numbered square mark, joined to the next by a dashed line that turns solid once the step behind it is finished, like a circuit run. The current mark is inverted, finished steps are quiet links back, later steps sit in `text.tertiary` and inert. Below the step's content, a step bar pinned to the bottom of the view: Back (Quiet action), one line summarising the plan so far, and Continue (Route action as a button).
**States:** each step current, finished or ahead; Continue unavailable with its reason in the bar; Back unavailable once anything irreversible has started, with that reason.
**Rules:** one question per step; the plan survives moving between steps. Never skips a step that has something to decide. Used for every flow that builds something and then commits it: Allocation (Choose, then Buy with the amount and each purchase together), Compose (Choose, then Found with weighting, identity and the Found key), and the mobile app. A summary panel stays beside the steps on a wide screen and joins the commit step on a narrow one (Storm, 7 October 2026). The bar is StepBar in @seametry/ui, so every flow pins the same one.

### Selection count
**Answers:** how much of the permitted set have I chosen?
**Anatomy:** current count in display type, followed by the total in small supporting type as `current/total`.
**States:** zero, partial and full. The owning flow explains why its maximum exists.
**Data:** non-negative current and total integers; an accessible label names what is selected.
**Rules:** used inside every selection action bar. The visual and spoken count must come from the same values. It is never a market figure and carries no provenance colour.

### Mark line
**Answers:** what backs this row, and what was decided about it, in one glance?
**Anatomy:** Grade, a short vertical hairline, the Stamp's verdict, all on one line; the Stamp's reason on its own line beneath, spanning the column. The line spreads to the row's height, so the marks sit level with the row's title and the reason with its last line.
**Rules:** the reason never leaves the verdict's block; it moves below it, not away. Used wherever a row carries both a grade and a stamp (Storm, 7 October 2026: tags on one line, reason on its own, both columns ending together).

### Filter bar
**Answers:** which of these rows do I want in front of me?
**Anatomy:** one row: a search field with a search glyph, and a filter glyph beside it carrying the number of filters on. The glyph opens a panel of labelled groups of mutually exclusive options (native radios, one row of quiet segments per group). Below the row, a count line, "Showing n of m".
**States:** default (empty search, every group on its widest option), searching, filtered (the glyph shows its count), empty (the count line says nothing matches and what to widen).
**Rules:** search and filters narrow the view, never the record: rows they hide are counted. Where rows are choices in a plan, search only moves the view and a chosen row stays in the plan; a filter states a preference, so a chosen row it hides leaves the plan and the count line says how many did. No colour on the selected option; it reads by weight and a rule (Storm, 7 October 2026: search first, filters behind a glyph, never three open rows).

### Changelog entry
**Anatomy:** relative date, title, one sentence, link. Dates are real.

### Definition
**Anatomy:** term in display serif, one-sentence definition, "Where you meet it" link, related terms.

### Docs page tree
**Answers:** where am I in the docs, and what else is there to read?
**Anatomy:** a left column of page links in reading order, grouped under quiet separator labels, with links out (the thesis, a paper not written in MDX) in the same list. Wide layouts keep it beside the page; narrow layouts fold it into one disclosure, "Docs pages", above the page.
**Identity:** the current page is a raised tone behind primary text, as the App shell's current tab is; no underline, no bullet, no icon per row.
**States:** current page; other page; separator; keyboard focus; folded and open on narrow layouts.
**Data:** the page tree built from `content/docs/**/meta.json` and the compiled pages, so the tree and the pages cannot disagree.
**Rules:** one tree for the whole docs. Never a second navigation for the same pages.

### Docs contents rail
**Answers:** what does this page cover, and where in it am I going?
**Anatomy:** "On this page" and the page's second- and third-level headings, indented by level, each linking to its anchor, beside the prose.
**States:** present on wide layouts when a page has two or more headings; absent otherwise. Narrow layouts omit it: above the prose it would be read before the page title.
**Data:** the heading list compiled from the page itself.
**Rules:** text only, `text.secondary`, the hovered entry in primary. Never a progress bar or scroll-linked animation.

### Docs artifact
**Answers:** what does this actually do when I move it?
**Anatomy:** a sunken well set into the prose (`surface.sheet`, ruled top and bottom), holding one working instrument: a bench of sliders and toggles with a live ledger and its arithmetic in the digest face, a comparison of two outcomes side by side, a picker over captured evidence, an evidence chart, or a diagram drawn from geometry. A caption names where every figure comes from.
**Identity:** the reader is the operator. The first action in a well takes the touch fill; any others are quiet. Outcomes read by weight and a provenance rule, never by red or green.
**States:** initial (the specification's or evidence's own starting state); moved; reset ("Start again"); for evidence pickers, any captured instrument including refused ones.
**Data:** only what the product runs or reads: ported arithmetic replayed against the shared vectors in a test, or the committed evidence. Quantities chosen for an example are labelled as illustrative in the caption, and the behaviour they show is the product's, cited.
**Rules:** charts and diagrams colour through classes, never style attributes (the nonce policy refuses them). No animation while idle. Every section of a docs page answers one question in the reader's words, in plain sentences first, then a worked example, a code block or an artifact.

### Docs search
**Answers:** which page talks about this?
**Anatomy:** a search Field at the top of the page tree; results replace the tree while a query is present, each a page title with the matching heading or sentence beneath it.
**States:** empty (the tree shows); searching (a sentence names what is being searched, no spinner); results; no match (says so and suggests a shorter word); unavailable (says search could not be reached, the tree stays usable).
**Data:** `/api/docs/search`, an index built from the compiled pages inside this deployment; no query reaches a third-party service.
**Rules:** search narrows what is shown, never the docs themselves; Escape clears it and returns the tree.

---

## 3. Organisms

### Lot header
Top of every constituent and alloy page. Lot number; name in display serif; ticker and Grade; hero Figure with evidence state; the Key in the thumb zone on mobile.

### Basket register
**Answers:** which published, researched direct-wallet basket do I want to inspect?
**Anatomy:** one keyboard-focusable route link owns the entire ruled row. A Basket plate; title and single truncated category line; Holds, the round Lot mark stack with the constituent count; Access, the issuer families; Admission, how many constituents the current snapshot admits; one quiet trailing arrow cell with no "Open" caption. The Filter bar sits above the list. Build a basket is a route in the App shell and a Text action closing the register, never a switch or a control drawn under the page title. On a phone the row is one reading line: the plate, then name, category and admission stacked, then the arrow; Holds and Access give way because the plate already shows the composition.
**Identity:** the Alloy register's grammar: hairline separators, quiet labelled cells, the same sunken round stack, no bordered cards, no charts or animations while browsing.
**States:** default row; focus or hover changes surface tone; filtered empty states the correction; partially admitted or private-market research remains inspectable but cannot be bought.
**Data:** published basket id, code, name, category, constituents and admission per constituent.
**Rules:** the whole row opens the basket record. Never add a second action link, a repeated descriptor, a verbose issuer block, a capacity table or a fake performance sparkline in the list. Every market figure and source belongs on the details page.

### Basket plate
**Answers:** which basket is this, and is every part of it set?
**Anatomy:** a square engraved plate in the manner of the Fortune Five artwork: a dotted outer ring, a dark field crossed by guilloche ellipses, one rosette per constituent on the ring, spokes from each rosette into a centre polygon with as many sides as constituents. Row size beside a register title (72px, 56px on a phone), header size beside the record's title (96px, the Alloy record's artwork size).
**Identity:** generated from the recipe, so no basket needs commissioned artwork and no two published baskets share a plate: the count of rosettes, the turn of the ring and the density and swell of the engraving come from the constituents and the basket's code (Storm, 12 October 2026, replacing a weight ring whose ten instances read alike). Two steps of `scale.touch`, lime ground and olive-black ink, in both modes, as a printed plate. An admitted constituent is a set rosette; one the snapshot refuses or never assessed is an empty dashed socket, so a part-admitted basket reads as incomplete before its label is read.
**States:** every constituent admitted; some sockets empty; every socket empty (research only).
**Data:** the published members, the basket code, and admission per member from the current snapshot.
**Rules:** never another basket's or an Alloy's artwork: an Alloy's picture belongs to that Alloy. Decorative (`aria-hidden`): the name and the Admission cell carry the same facts as text. Never a performance chart or a price.

### Published basket purchase
**Answers:** how do I purchase this reviewed composition without constructing it again?
**Anatomy:** a Buy basket anchor stays on the basket record; the record contains a fixed-template amount and wallet-execution workbench using the existing AllocationFlow engine. Selected mints derive from the admitted basket recipe. The Key on the record reads "Buy basket"; equal weight is the published rule, so the record offers no weighting.
**Identity:** one amount decision, the normal order sheet and the custody-changing Key; no unneeded Choose step.
**States:** full admission + country eligibility; insufficient admission (no purchase); no wallet; inadequate USDC/SOL; quote or simulation refusal; signing; settlement; partial settlement.
**Data:** exact published constituent mints, fee tier, individual current Jupiter quotes, simulated transaction data and actual settlement status.
**Rules:** no redirect to the custom builder to buy a predefined basket. Never bypass the existing simulation, eligibility gate, wallet approval, attribution or non-atomic failure handling.

### Basket remix
**Answers:** can I start from this basket and make it mine?
**Anatomy:** on every basket record with at least one admitted constituent, a Quiet link "Remix this basket" with one line saying what the remix starts from. It opens Build a basket with the admitted constituents chosen and a note naming the basket and any constituent left out. The amount step adds Weighting: Equal, or Custom weights, a ruled list of each chosen constituent with a whole-percent field, and a line stating how much of 100% is assigned.
**Identity:** a remix is the builder, not a second purchase surface. Custom weights open on the equal split in whole percents, so changing one weight is the first edit, not a blank form.
**States:** complete basket; part-admitted basket (left-out constituents named, the record says why); equal; custom and assigned; custom and not adding to 100% (stated with the figure, no Key); a constituent below 1 USDC at its weight (named, with what to raise).
**Data:** the published members, current admission, whole-percent weights split by `splitByWeights` in integer atoms. Weights travel in the URL with the rest of the unsigned plan, paired by position with `selected`.
**Rules:** whole percents only, so the split is exact integer arithmetic. Holdings name a purchase after its basket only when it is that basket as published, every constituent at equal weight; anything else started from a basket is "<name> remix", never passed off as the published composition.

### List
**Answers:** what is in this set, and where does each entry lead?
**Anatomy:** a bordered raised plate with the single top highlight; a quiet column head; divided rows of one height, each row one target (a link, or a button that opens a sheet on the same page) ending in a next glyph. The page names its columns once as a grid template; rows take them by subgrid, so heads and cells align without the page styling either. A cell marked wide leaves below the tablet breakpoint, where a row keeps its identity and one value.
**States:** default; empty (the page says why in one sentence above where the list would be); loading (a rule-line skeleton naming what is read).
**Data:** caller-owned rows.
**Rules:** a column whose value is the same on every visible row is not a column: drop it for that view. No "Open" or "View" text in a row; the row is the target. `@seametry/ui/list`. Used by Instruments and Holdings.

### Identity
**Answers:** which instrument is this, at a glance?
**Anatomy:** the issuer's mirrored logo (or its lettered tile), the symbol, and one quiet line: the company from the mint's own metadata, then the issuer's short name when the view mixes issuers.
**Rules:** the mark is never shorter than the text beside it: 40px beside two lines, 56px in a page header. The issuer's name never appears inside the company name; names come from `lib/instrument-identity.ts` only. `@seametry/ui/list`.

### Tabs
**Answers:** which view of this subject am I looking at, and how much is in each?
**Anatomy:** labels on one rule, the current one underlined in ink, each with the count its view holds. Arrow keys move between them.
**Rules:** for views of one subject (Holdings: Positions, Allocations, Activity; Instruments: by assay state). A control that changes a value rather than the view is a Segmented control. `@seametry/ui/tabs`.

### Icon button
**Answers:** an action whose glyph says it all: back, next, close, copy, refresh.
**Anatomy:** a square of one target, rules above and below like a Quiet action, one glyph. Its label is required and becomes the accessible name and the tooltip; it is never drawn.
**Rules:** never for the page's decision (Buy, Sell all, Strike, Melt), which is a Key with its words.

### Pagination
**Answers:** which part of a long published register am I reading, and where can I continue?
**Anatomy:** previous page when one exists; numbered page links; next page when one exists; current page stated with `aria-current`. In the app, previous and next are Icon buttons either side of "Page n of m".
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
**Anatomy:** native dialog; quiet register label; title; caller-owned body; a close icon in its square wrapper, named by `aria-label`, never a written "Close" (Storm, 13 October 2026: an action inside a sheet or list is an icon in its wrapper unless the icon cannot carry the meaning alone); optional footer. The body uses registered atoms and molecules only.
**Identity:** a full-height registration-cut plate at the inline end on wide screens and a `radius.sheet` plate rising from the bottom on narrow screens. One top highlight rule and tonal elevation establish occlusion; there is no shadow, blur or glow.
**States:** closed; open. Loading, empty, stale, unavailable and error belong to the caller's content and retain the sheet's measure.
**Data:** accessible title, close label and caller-owned content. The component owns no product data.
**Rules:** use the native dialog focus and Escape contract; restore focus to the opening control; label the dialog from its visible title. An end sheet is for review or a bounded task, never generic navigation. It does not create a second Key. Opening motion uses `duration.sheet`; reduced motion lands immediately.

### Process outcome
**Answers:** is the signed action still being checked, confirmed, or refused?
**Anatomy:** large outlined status mark, one short heading, one factual sentence, optional transaction link or technical disclosure.
**States:** pending in semantic warning, success in semantic success, error in semantic error. Unknown confirmation remains pending, never success.
**Data:** explicit request state and chain confirmation supplied by the caller.
**Rules:** show success only after confirmation. Never leave a completed request in the running Step register. State is named in text as well as colour.

### Melt panel
Constituent rows, each deliverable or held as a Claim with its reason. Held rows stay still.

### Alloy quantity terms
**Answers:** for the entered share amount, which exact constituent quantities will Strike take or Melt return?
**Anatomy:** per-leg symbol and exact quantity beside the share field, with source, observation age and evidence state underneath. Melt marks a held leg as a Claim, not delivered stock.
**States:** empty input, reading, current terms, stale input (old terms hidden), unavailable and error with the refusal stated.
**Data:** Gateway `strike-cost` or `melt-proceeds` for exact integer share atoms, `CostRow.legs`, and envelope `Meta`.
**Rules:** quantity-only. Never label these a USD price or an executable USDC quote. Terms must match the current field before signing; every number keeps provenance.

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
**Anatomy:** no sidebar. Wide layouts: one sticky Top bar holding the Brand mark, every product route as a text tab, Wallet state and the Mode control; a quiet Status bar holds reading links. Narrow layouts: the mark, Wallet state and Mode control remain in the top bar. Five labelled product tabs sit at the bottom; the central green plus opens Baskets, the Allocation entry, whose register closes with a Text action to Build a basket. Narrow layouts carry no menu button and no overflow drawer. The Network badge sits in each page's Page header, because only the page knows which cluster it acts on.
**Identity:** a terminal's top bar on the sheet surface, aligned to the content width so its edges meet the page. The current tab is a raised tone behind primary text, led by its group's icon in the action green (Desk, Buy, Hall, Assay), so the icon marks where you are rather than decorating every route; the House rail uses only the action-green label because its destinations share one line with no tab. The reading links in the Status bar keep their icons, which distinguish an exit from the operational routes.
**States:** current route; narrow; wallet disconnected or connected; each page's network.
**Data:** one route list that drives the top bar tabs and the narrow navigation register, so they cannot disagree.
**Rules:** the phone tab bar takes its height from `--shell-bottom-inset`, which the shell publishes and every sticky bar and the Toast region sit above, so nothing pinned to the bottom hides behind it. The mobile tabs reference the same route records as the wide bar. Every route resolves. The current route is named by its tab; a page header appears only when it adds network or decision context that the shell cannot carry. Reading links remain on the public pages and wide Status bar.

### Page header
**Answers:** what is this page, and what does it act on?
**Anatomy:** title, with an optional Info note beside it; Network badge; optional quiet links. No group label: the product tabs already name it (Storm, 14 October 2026).
**Rules:** one title per page; no section below restates it. No subtitle. The page's own components say what it is; what a reader may want first goes in the Info note, and explanation belongs on the reading pages, linked, not repeated here (Storm, 7 October 2026).

### Network badge
**Answers:** which cluster does this page read or write?
**Anatomy:** square double-ruled mark, as a Stamp: "Mainnet", "Devnet", or "Mainnet evidence" for captured reads that write nothing.
**Rules:** present on every page in the App shell. Mainnet in text primary, Devnet in provenance blue. Never green: it is a statement, not an action.

### Wallet state
**Answers:** is a wallet connected to this site, which one, and how do I change that?
**Anatomy:** disconnected: "Connect", opening a list of wallets offered in this browser. Connected: the observed USDC balance on mainnet or SOL balance on devnet beside the wallet icon; the address is also shown on wide screens. The disclosure contains the full address and holdings ledger with source and age; "Disconnect wallet". Connection does not create an account session.
**Identity:** disconnected, it is the green way into every product room, by Storm's decision of 4 October 2026: logging in is the shell's one call to action, as on a trading terminal. Connected, it turns quiet (sheet, ruled top and bottom, the address in the mono face) because the account is then a state of the room, not an invitation. It precedes the Mode control on every layout.
**States:** disconnected; no wallet detected (name the wallet app browser or desktop extension path); connecting; connected with balance reading, observed or unavailable; the disclosure open or closed by keyboard as well as pointer. On phones the panel is viewport-bound and scrolls.
**Data:** the site-wide wallet session; the list of detected Wallet Standard wallets; `/api/wallet/balances`, read each time the panel opens, through the deployment's RPC so the browser's connect-src stays devnet only. Holdings are integer atoms with a scale. Reading names the network it reads; unavailable names the reason.
**Rules:** never a Key: logging in moves no custody and signs nothing, and the panel says so by offering only "Connect <name>". Green only while disconnected. The full address is always one step away, never only the truncation.

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

### Formula draft
**Answers:** what would one share of this Alloy hold, what is each leg worth at a live mainnet quote, and is the draft fit to found?
**Anatomy:** constituents chosen from assayed instruments (refused ones visible with their blocking fact, never selectable); a weighting choice, equal value at founding or equal units; the share's name and symbol; beside them, the draft ledger: per leg the atoms per share, the value at the quote and the weight, then the total per share, the quote's source and age, and the founding draft as text to copy.
**Identity:** the draft ledger is the page's figure and stays in view beside the inputs, as the Allocation's order sheet does. There is no Key: nothing is signed here.
**States:** quotes loading (rule line naming the read); quotes unavailable (the reason, with equal units still drafting quantities and values reading "No observation"); refused draft (the reason in place of the ledger); ready.
**Data:** the admissions snapshot for constituents; `/api/compose/quotes`, one 100 USDC Jupiter quote per constituent, as integer atoms. Weights are basis points of the per-share value.
**Rules:** no float anywhere, no estimate and no word that values the Alloy; the value is "at the quote", with its source and age. The page says the weights drift as prices move, because the Formula is fixed and never rebalances. Founding is a separate, deliberate step on the devnet Hall.

### Mechanism plate
**Answers:** what does one Hall guarantee look like as a mechanism, before the reader parses the sentence?
**Anatomy:** an isometric line drawing above a two-to-four-word title and one plain sentence, inside a ruled plate. The drawing is built from blocks, plinths, dashed paths and small floor annotations set along the isometric plane.
**Identity:** one line ink on the sheet. Exactly one solid object, in the action green, marks the touchable thing (the share, the Formula, the constituent the holder can move). A recorded fact may carry its annotation in provenance blue. Faces are flat paper that hide what is behind them; the solid object alone takes the pressed green on its sides so it reads as a body. No other shading, shadow, gradient or perspective.
**States:** default; narrow layouts stack plates one per row with the drawing kept at full width.
**Data:** none. Annotations name register nouns and Hall rules only, never a market quantity, price, count or participant.
**Rules:** every drawing depicts the sentence beneath it and nothing the product cannot do. Annotations are lower case nouns or short phrases, never instructions. Built only from the shared plate primitives in `@seametry/ui/plates`, so stroke, projection and type cannot drift between plates.

### Hero instrument
**Answers:** how does the mechanism behave when I work it myself?
**Anatomy:** an isometric machine of many small, purposeful parts (base on feet, rails, columns, fasteners, gauges) whose working is the product's mechanism, playing its own story in a loop with nothing beside it: no controls, readout, status or caption (Storm, 12 October 2026). The motion is the explanation, and short notes engraved on the bench in the register's words name its parts, as the mechanism plates do; a note sits in front of its part, where no height covers it. The landing's is the Hall's press. Its canisters are the Hall vault, one per constituent, each named on its lid. Strike takes one ingot per leg from any wallet into the die, pushes the units down their channels into the vault, and stamps a share onto the holder's shares. Melt returns a share, records a Claim per leg in the rack, and each vault pays its unit out to the wallet, settling that Claim. An issuer's freeze locks one vault (collar, padlock, lowered gate and a "frozen leg" note): a Strike stops at its gate and nothing moves, and that leg's Claim stays recorded until the freeze lifts. One loop ends where it began.
**Identity:** faces are surface tokens stepped by facing, outlines text and line tokens, and exactly one lit part, in the action green, is the share. A frozen leg (its collar, padlock and the Claim it holds back) takes `figure.frozen`, a muted brick red (Storm, 12 October 2026: chosen from side-by-side light and dark renders over purple, mustard, orange blends and the dark pastel of `status.error`). Nothing else takes a hue. No halo, blur, gradient or shadow. Drawn back to front with every moving part in the slot where it physically sits.
**States:** playing (strike, strike, melt, freeze, a refused strike whose units halt at the closed gate and vanish while the wallet keeps its ingots, a melt whose vaults pay every leg but the frozen one, then the freeze lifts and the held Claim is paid); nothing a reader does stops it; offscreen (the loop rests, unseen); reduced motion (a still picture of the freeze and the Melt that delivered around it).
**Data:** the product's own arithmetic (`lib/hall/recipe.ts`, tested against the shared vectors) decides what a Melt credits; the Formula is illustrative, and the docs' frozen-leg bench states its quantities.
**Rules:** the static art is built on the server from `clients/web/src/lib/iso`; the client only writes attributes (`transform`, `data-hidden`, `data-held`), never style. Every refusal and outcome the motion shows is the Hall's real behaviour, cited in code to `HALL.md`. One hero instrument per surface.

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
