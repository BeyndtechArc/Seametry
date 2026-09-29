> **Living document. Owns:** requirements for the public Explorer surface.
> **Does not own:** product scope (`../PRODUCT_ARCHITECTURE.md`), the receipt
> scheme (`../ENGINEERING_STANDARD.md` section 12), the world and its naming
> (`../BRAND_AND_WORLD.md`), or any executable design decision, which belongs
> to the design system at `.claude/skills/seametry-design/`.
> **Phase 1.** This is the first surface, and it carries no legal gate.

# PRD: The Explorer

**Last substantive change:** 27 September 2026.

---

## 1. What it is for

The Explorer is where anything Seametry claims can be checked by a stranger
with no account, no wallet and no reason to trust us.

It is not marketing with a demo attached. It is the evidence, published, with
the working shown. Everything else the company says rests on a visitor being
able to come here and confirm it themselves in under a minute.

It comes first because it is the only phase that can be built and published
without a legal read, an audit, or a single user's money.

**What it is not.** It does not carry business positioning, product claims, or
a pitch; that is `SITE.md`'s job, and its pages are the front door a visitor
passes through before arriving here. It does not carry engineering status,
what is built and what is not; the README owns that, once, and a second copy
of it inside the evidence layer is the same defect as two documents
disagreeing about anything else. An earlier build of this surface carried
both, which is the drift `../decisions/2026-09-27-web-app-and-payments.md`
corrects.

## 2. Who arrives, and what they need in the first thirty seconds

| Visitor | Arrives from | Needs to leave with |
|---|---|---|
| A hackathon judge | A submission link | The claim, the proof of the claim, and a way to check it themselves |
| A trader or market maker | A search or a shared link | Whether this instrument is what they think it is |
| A researcher or journalist | A citation | A number they can reproduce and attribute |
| A holder | A receipt link | Confirmation that their receipt is sealed and unaltered |
| An issuer | Someone telling them they are named here | The exact, neutral sentence used about their instrument |

None of them should have to read a paragraph before seeing something true.

## 3. The surfaces

### 3.0 The catalogue

The list every instrument page in 3.2 is reached from. The Catalogue template
in `.claude/skills/seametry-design/references/patterns.md` section 2: a title,
one sentence, then one row per lot with refused entries visible, never
hidden.

The issuer powers every listed instrument shares are stated once, above the
table, and a row names only the powers that instrument adds. Repeating the
same six sentences on every lot hid the one column that differs: the
shortfall at the policy's reference size, and the verdict it produced. A
refused row carries its first blocking reason in a few words; the policy's
full sentence is on the lot page.

There is no filter while the catalogue holds seven lots: a filter over seven
rows is a control with nothing to do. It returns when the list outgrows one
screen.

### 3.1 The verification ritual

A visitor pastes a serial and watches their own machine do the work. This is
the Explorer's first page (`index.html`): every visitor in section 2 arrives
wanting something checked, and this is the one page where they check it.

1. The public body is shown in full, and its digest computes in the browser via
   Web Crypto.
2. The private body's commitment is shown, never the body.
3. The Merkle path climbs one level at a time, each interior hash visibly
   computed from its children.
4. The computed root lands on the published root, then on the on-chain memo
   transaction, linked to a block explorer.

Closing line: *Your browser just verified this. We didn't.*

This is the signature moment and it is made entirely of real computation.
`docs/reference/explorer-verification-mock.html` is the visual and interaction
reference; the scheme it implements is real and lives in `server/internal/receipt`.

**Requirements.**

- Verification runs client side, with no request to Seametry beyond fetching
  the proof. A visitor with the proof JSON and no network must be able to
  verify offline.
- The tamper control stays. Changing one character and watching the root become
  unrecognisable is the guarantee made visceral, and it does more work than any
  explanation. Once a run finishes, the public record is editable in place
  and the visitor's own edit is what gets verified; a control that changes
  one character for them stays beside it for anyone who would rather not type.
- Until a batch root is anchored on chain, the page says so in those words. The
  mock's line is correct and stays: *its root is not yet written on-chain.*
- The tree visualisation generalises to any batch size. Real batches are not
  powers of two, and the reference mock is hardcoded to eight leaves.
- The proof carries the private body's commitment, never the body. An owner may
  optionally paste their private body to prove it, and that path must make
  clear it never leaves their browser.

### 3.2 The instrument page

One page per instrument (`lot-<symbol>.html`): one object per view. For any
instrument in the registry, the facts decoded from its mint:

- **Grade**, as a plain sentence, describing the legal shape of the claim and
  nothing about quality.
- **Prerogatives**, each as a plain sentence, from `Prerogatives.Sentences()`.
  The same sentence is used for every issuer holding the same power.
- **The live multiplier**, with the field it came from, its effective time, and,
  when they differ, what a reader of the obvious field would have got instead.
- **Unknown extensions**, named by number, as a sentence saying there is a
  control Seametry does not yet decode.
- **The capture**: which slot, at what commitment, at what time. A fact with no
  slot is an assertion.

### 3.3 The evidence pages

Published findings, each reproducible by a visitor running one command.

The first is the multiplier survey in `shared/evidence/`: 1026 mints, 385 with a stale
`multiplier` field, every mint carrying a permanent delegate, a freeze
authority, and a transfer hook that exists and is switched off. Each page
states what the finding does not establish, in its own section, at the same
visual weight as the finding.

### 3.4 The Hall demonstration

The devnet demonstration from `HALL.md` section 7, published as a scrubbable
record, run against the Hall program deployed on devnet, alongside the same
demonstration recorded in a local simulator: eight scenarios each, every
devnet step carrying its transaction signature. The one that matters is the
melt that succeeds while an issuer has frozen one constituent, delivering
every other leg and leaving exactly one claim.

### 3.5 Hallmarks

One page per receipt, at its serial. The Hallmark template: the hallmark row,
large; the public record, readable; seal status; then the verification
ritual from 3.1, prefilled with this serial; links to the alloy or allocation
it settled, the policy version behind it, and the evidence that produced it.

### 3.6 Status (not yet built)

Seametry's own freshness, held to the standard it holds sources to: every
source and service as an Evidence row about itself, its last observation, its
lag, its state (`patterns.md` section 2, Status). Waits on `GET /v1/status`
(`API.md` section 5.1, step A1).

## 4. What the Explorer must never do

- **Hide an operational fact on a small screen.** The reference mock hides its
  honesty label under 520px, which is the viewport most visitors use. The label
  moves or shrinks; it never disappears. `BRAND_AND_WORLD.md` section 11 lists
  obscuring an operational fact as the first prohibition.
- **Claim a verification it did not perform.** If the root is not anchored, say
  so. If a source was unavailable, name it.
- **Require JavaScript to state the claim.** The headline claim and the
  evidence tables render without script. Only the ritual needs it.
- **Use red, or an alarm.** A failed verification is stated in the provenance
  blue, calmly, with the reason. Calm dread, never alarm.
- **Describe a value as true, correct, fair or safe.**

## 5. Craft

Governed by the design system at `.claude/skills/seametry-design/`, which owns
every executable design decision and fails the build on a violation. The
Explorer's one signature moment is the ritual; everything else is quiet, fast
and precise.

Both decisions this section previously left open are now settled there, and the
Explorer implements both:

- **Typefaces.** Sentient for figures and titles, Switzer for interface,
  Fragment Mono for digests and nothing else. All three self hosted, never
  subset or format converted, per the licence's own terms.
- **Default theme.** Dark is the default and the brand. Light is the
  certificate. Both are complete, and no component may exist in only one.

Every colour, size, radius and duration on the page comes from
`clients/packages/ui/src/generated/tokens.css`, generated from the design system's
token source. The stylesheet states no colour of its own, and
`npm run design:lint` fails on a raw value.

**Where it is built.** The Explorer stays its own separately deployed static
site, generated as HTML by `server/cmd/explorer`, deliberately not folded
into the Next.js app that holds the Terminal and the business pages
(`SITE.md`, `TERMINAL.md`). That app was never going to be static, wallet
connections and live data both need a request in hand, so it uses a
per-request CSP nonce, which only a real page-serving process can supply. The
Explorer has no such need and keeps the stricter, simpler policy a static
site can hold, on its own host, at its own subdomain: settled in
`../decisions/2026-09-27-web-app-and-payments.md` after the two were
briefly built as one and found to fight each other on exactly this point.
Fonts come from `clients/web/fonts`, fetched by `npm run fonts
--workspace=clients/web`, falling back to system faces if that has not been
run; the two apps share the same three faces without sharing a deployment.

## 6. Accessibility

- The hash animation must not be inside a live region. The reference mock has
  `aria-live="polite"` on a container whose children update every frame with
  random characters, which floods a screen reader. Announce the settled verdict
  only.
- Every state reachable by mouse is reachable by keyboard, with a visible focus
  ring. The mock's `:focus-visible` treatment is correct.
- `prefers-reduced-motion` collapses the ritual to its result, with every value
  still shown. The mock does this correctly.
- Colour is never the only carrier of a verdict.

## 7. Performance

From `CRAFT.md` section 4, measured rather than assumed:

- Largest Contentful Paint under 2.5 seconds on a mid range Android phone over
  a throttled 4G profile.
- The ritual's first frame within 100ms of submit.
- Fonts self hosted, so first paint does not wait on a third party.
- Any procedural background loads after first paint, pauses off screen, and
  becomes a still frame under reduced motion.

## 8. Security

- The public artifact is built by `server/internal/receipt`, which constructs the
  public body separately from the private one rather than filtering it. The
  Explorer renders what it is given and adds nothing.
- No public artifact carries a wallet, a transaction signature, an exact amount
  or a salt. Enforced by a scan test in Go and again in
  `shared/tools/spec/verify-receipts.mjs`, on the side a stranger reads.
- A visitor pasting their own private body does so entirely client side.
- Content security policy permits no third party script origin, carried from
  today's Go generated headers into `clients/web`'s `next.config.ts`, proven
  against the built app rather than assumed to have survived the move.

## 9. Acceptance

- A first time visitor on a phone verifies a hallmark from its serial in two
  taps, watching their own browser do the work.
- The page verifies a proof with the network disconnected after load.
- Changing one character of a public body visibly breaks the root, on screen.
- A batch whose size is not a power of two renders and verifies correctly.
- The honesty label about on chain anchoring is visible at 360px wide.
- A screen reader announces the verdict once, not the intermediate hashes.
- Largest Contentful Paint under 2.5s on a mid range Android over throttled 4G,
  measured and recorded.
- Every instrument page states the slot its facts were read at.
- An evidence page states what it does not establish.

## 10. Open

- The anchoring step is unbuilt: no batch root is written on chain yet, so the
  ritual currently ends at the published root. Until then the page says so.
- What real, already captured evidence the landing hero in `SITE.md` opens on
  is Storm's decision, not this document's.
- No raw UNHx payload exists to reproduce the corporate action replay the
  landing template describes (`README.md`'s open items). The Explorer itself
  does not need it; `SITE.md` does, for the same reason.

Settled, no longer open: whether the Explorer serves proofs from static files
or the gateway at phase 1. It serves published, committed data with a drift
check, per `../decisions/2026-09-27-web-app-and-payments.md` D2, switching to
the live API with no change of shape once it exists.
