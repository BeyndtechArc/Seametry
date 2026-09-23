> **Living document. Owns:** requirements for the public Explorer surface.
> **Does not own:** product scope (`../PRODUCT_ARCHITECTURE.md`), the receipt
> scheme (`../ENGINEERING_STANDARD.md` section 12), brand and voice
> (`../BRAND_AND_WORLD.md`), or library choices (`../CRAFT.md`).
> **Phase 1.** This is the first surface, and it carries no legal gate.

# PRD: The Explorer

**Last substantive change:** 23 September 2026.

---

## 1. What it is for

The Explorer is where anything Seametry claims can be checked by a stranger
with no account, no wallet and no reason to trust us.

It is not marketing with a demo attached. It is the evidence, published, with
the working shown. Everything else the company says rests on a visitor being
able to come here and confirm it themselves in under a minute.

It comes first because it is the only phase that can be built and published
without a legal read, an audit, or a single user's money.

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

### 3.1 The verification ritual

A visitor pastes a serial and watches their own machine do the work.

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
reference; the scheme it implements is real and lives in `internal/receipt`.

**Requirements.**

- Verification runs client side, with no request to Seametry beyond fetching
  the proof. A visitor with the proof JSON and no network must be able to
  verify offline.
- The tamper control stays. Changing one character and watching the root become
  unrecognisable is the guarantee made visceral, and it does more work than any
  explanation.
- Until a batch root is anchored on chain, the page says so in those words. The
  mock's line is correct and stays: *its root is not yet written on-chain.*
- The tree visualisation generalises to any batch size. Real batches are not
  powers of two, and the reference mock is hardcoded to eight leaves.
- The proof carries the private body's commitment, never the body. An owner may
  optionally paste their private body to prove it, and that path must make
  clear it never leaves their browser.

### 3.2 The instrument page

For any instrument in the registry, the facts decoded from its mint:

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

The first is the multiplier survey in `evidence/`: 1026 mints, 385 with a stale
`multiplier` field, every mint carrying a permanent delegate, a freeze
authority, and a transfer hook that exists and is switched off. Each page
states what the finding does not establish, in its own section, at the same
visual weight as the finding.

### 3.4 The Hall demonstration (when phase 1 of the program lands)

The devnet demonstration from `HALL.md` section 7, published as a scrubbable
record: nine scenarios, each with its transaction signatures and before and
after state. The one that matters is the melt that succeeds while an issuer has
frozen one constituent, delivering every other leg and leaving exactly one
claim.

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

Governed by `../CRAFT.md`. The Explorer's one signature moment is the ritual,
and everything else is quiet, fast and precise.

Two deviations in the reference mock are open decisions, not defects, and
whichever way they go the documents and the page must agree:

- **Typefaces.** The mock uses Fraunces, Schibsted Grotesk and Fragment Mono
  from Google Fonts. `CRAFT.md` section 5 and `BRAND_AND_WORLD.md` section 8
  specify Sentient and Switzer, self hosted from Fontshare, to avoid a third
  party origin for speed and content security policy.
- **Default theme.** The mock defaults to warm paper with black as the
  `prefers-color-scheme` variant. `BRAND_AND_WORLD.md` is emphatic that the
  black ground is the touchstone and not dark mode. A paper default may be
  right for an evidence surface that reads like a certificate, but it inverts
  the central metaphor and is a brand decision.

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

- The public artifact is built by `internal/receipt`, which constructs the
  public body separately from the private one rather than filtering it. The
  Explorer renders what it is given and adds nothing.
- No public artifact carries a wallet, a transaction signature, an exact amount
  or a salt. Enforced by a scan test in Go and again in
  `tools/spec/verify-receipts.mjs`, on the side a stranger reads.
- A visitor pasting their own private body does so entirely client side.
- Content security policy permits no third party script origin.

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

- `prd/TERMINAL.md` and `prd/API.md` do not exist, and the Explorer shares
  components with both.
- The anchoring step is unbuilt: no batch root is written on chain yet, so the
  ritual currently ends at the published root. Until then the page says so.
- Whether the Explorer serves proofs from the gateway or from static files at
  phase 1 is undecided. Static is sufficient for the demonstration and removes
  a dependency from the critical path.
