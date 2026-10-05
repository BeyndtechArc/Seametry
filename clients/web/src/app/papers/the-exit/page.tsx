import type { Metadata } from "next";
import { connection } from "next/server";
import { ClaimLine, LotMark, TextAction } from "@seametry/ui";
import { logoFor } from "@/lib/instrument-logos";
import { theExit } from "@/lib/papers/the-exit";
import { PublicShell, SectionHeading } from "../../public-shell";
import styles from "../../site.module.css";

export const metadata: Metadata = {
  title: "The exit | Seametry",
  description: "Permissionless creation and redemption for baskets of issuer-controlled tokenized equities.",
};

const { survey, firstDepth, latestDepth, admissions, freeze } = theExit;

function list(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export default async function TheExitPage() {
  await connection();
  const [firstSplit, ...otherSplits] = survey.splits;
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Permissionless creation and redemption for baskets of issuer-controlled tokenized equities</span>
          <h1>The exit.</h1>
          <p>
            On {survey.date} we decoded all {survey.decoded} xStocks mints on Solana.{" "}
            {survey.everyMintFreezableAndSeizable
              ? "Every one of them lets its issuer freeze it where it sits and take it back from any wallet."
              : `${survey.freezeAuthority} let the issuer freeze them where they sit and ${survey.permanentDelegate} let the issuer take them back from any wallet.`}{" "}
            Put eight of them in a basket, redeem the obvious way, freeze one leg, and the whole redemption reverts: one issuer&apos;s power over one stock becomes a veto over the entire exit.
          </p>
          <p>Opening creation and redemption to any wallet is the easy part. This paper is about the exit.</p>
        </header>

        <section className={styles.section}>
          <SectionHeading index="00" title="The Open AP proposition." question="What does Solana change about who may create and redeem?" />
          <div className={styles.paperText}>
            <p>An authorized participant delivers the prescribed basket and receives fund shares; returning those shares releases the basket, and that loop is how arbitrage closes the gap between a share and its constituents. On Solana the participant can be a protocol role rather than a named institution: any wallet able to satisfy the Formula can create shares, and any holder able to return them can redeem.</p>
            <p>The complication is the constituent set. A tokenized equity may settle through the same runtime as an ordinary SPL token while retaining freeze authority, a permanent delegate, transfer-hook configuration, mutable supply, pause state and a time-dependent Scaled UI multiplier. Those controls remain attached to the asset after it enters a basket. Opening the AP set does not remove them.</p>
            <p>The resulting problem is less about issuing a basket token than defining an exit that remains coherent when one of the assets underneath it stops behaving as the basket expects.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="01" title="Issuer controls in the constituent set." question="What powers did the captured mints carry?" />
          <div className={styles.paperText}>
            <p>
              On {survey.date}, Seametry captured {survey.decoded} xStocks mints from Solana mainnet at slot <span className={styles.paperFigure}>{survey.slot}</span> and decoded their Token-2022 state directly from the mint accounts.
            </p>
            <p>
              {survey.permanentDelegate} carried a permanent delegate. {survey.freezeAuthority} retained freeze authority. {survey.hookDisabled} contained a transfer hook which was disabled at capture but remained governed by an authority capable of enabling it; {survey.hookActive} had one enabled. {survey.halted} were in an issuer-halted state. {survey.unknownExtensions} unknown extensions were encountered in that capture.
            </p>
            <p>None of those observations says anything about issuer intent. They describe the authority graph of the instrument.</p>
            <p>That graph matters to a basket because custody does not extinguish it. Moving a token into a program-owned account does not remove the mint&apos;s freeze authority. Holding it inside a vault does not neutralize a permanent delegate. A disabled hook is not the same state as no hook. A protocol which records only symbol, mint and balance has discarded information that can later determine whether settlement succeeds.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="02" title="Atomic redemption failure." question="Why does one frozen leg revert an obvious redemption?" />
          <div className={styles.paperText}>
            <p>Take a basket with eight constituents and implement redemption in the obvious way: burn the basket share and transfer all eight assets to the redeemer in one Solana transaction.</p>
            <p>Now freeze the basket&apos;s token account for constituent eight.</p>
            <p>The first seven transfers may be individually valid. The eighth is not. Solana commits the transaction as a unit, so the failure of that transfer reverts the preceding seven as well. The issuer has authority over one constituent; atomic execution gives the resulting failure transaction-wide scope.</p>
            <p>That failure mode is architectural. NAV is irrelevant to it.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="03" title="The Hall settles into claims." question="Where does the Hall draw the settlement boundary instead?" />
          <div className={styles.paperText}>
            <p>
              <code>redeem</code> burns the Alloy share and calculates the units owed for every constituent, but it does not invoke any constituent token program. The obligation is written into a per-holder Claim. The constituent transfers occur later through <code>withdraw</code>, one leg at a time.
            </p>
            <p>If an issuer prevents delivery of one constituent, that withdrawal fails and its claim remains. Other legs are unaffected because their withdrawals are separate transactions.</p>
            <p>
              The program makes the distinction explicit in its account topology. <code>create</code> must actually receive every constituent and therefore takes four accounts per leg: mint, caller token account, Hall token account and token program. A failed deposit invalidates creation, as it should; an incompletely funded basket must not mint a complete share.
            </p>
            <p>
              <code>redeem</code> has no corresponding dependency on the constituent mints or their token programs. It needs the Hall-held accounts to establish what exists, then converts the share into accounting claims. <code>withdraw</code> reintroduces the individual constituent&apos;s token program only when that particular leg is delivered.
            </p>
            <p>The share therefore settles atomically into claims without requiring all constituents to settle atomically into wallets. For issuer-controlled assets, those are materially different properties.</p>
          </div>
          <figure className={styles.paperEvidence}>
            <figcaption>Recorded on Solana {freeze.cluster} against a mock issuer that reproduces the extension set reported for xStocks. Each signature opens the transaction.</figcaption>
            <table>
              <thead>
                <tr>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Result</th>
                  <th scope="col">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {freeze.steps.map((step, index) => (
                  <tr key={index}>
                    <td>{step.actor}</td>
                    <td>{step.action}</td>
                    <td>{step.reason ? `${step.result}: ${step.reason}` : step.result}</td>
                    <td>
                      {step.signature ? (
                        <a className={styles.paperFigure} href={`https://explorer.solana.com/tx/${step.signature}?cluster=${freeze.cluster}`} target="_blank" rel="noopener noreferrer">
                          {step.signature.slice(0, 8)}
                        </a>
                      ) : (
                        "no signature recorded"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        </section>

        <section className={styles.section}>
          <SectionHeading index="04" title="The multiplier is temporal state." question="Why does a displayed quantity depend on a clock?" />
          <div className={styles.paperText}>
            <p>Transfer authority is not the only condition a basket has to interpret.</p>
            <p>
              Token-2022&apos;s Scaled UI Amount extension stores the raw token amount separately from the quantity presented to the holder. Its configuration includes <code>multiplier</code>, <code>new_multiplier</code> and <code>new_multiplier_effective_timestamp</code>. Resolving the displayed quantity therefore requires both values and a clock.
            </p>
            <p>
              The same capture found the extension on {survey.scaledUi} of the {survey.decoded} surveyed mints. On {survey.staleField} of them, <code>multiplier</code> no longer represented the effective value because the scheduled multiplier had already crossed its activation timestamp.
            </p>
            {firstSplit ? (
              <p>
                {firstSplit.symbol} retained {firstSplit.field} in that field while the effective multiplier was {firstSplit.live}, effective since {firstSplit.since}.
                {otherSplits.map((split) => ` ${split.symbol} retained ${split.field} while the effective value was ${split.live}.`)}
              </p>
            ) : null}
            <p>
              {survey.scheduledNotYetEffective} other mints were in the inverse condition: <code>new_multiplier</code> had already been written but its effective timestamp remained in the future. Reading the new value unconditionally would be premature; reading the old field unconditionally would eventually become stale.
            </p>
            <p>This is not malformed state. Both fields are valid parts of the extension.</p>
            <p>
              A basket implementation that treats multiplier resolution as <code>read(field)</code> rather than <code>resolve(configuration, time)</code> can calculate against internally consistent but economically obsolete quantities. Seametry resolves the effective value before the mint reaches admission policy and records when the naive field has diverged.
            </p>
            <p>The uncomfortable property here is that a balance can become wrong in an interface without a transfer, mint or burn ever occurring.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="05" title="Admission cannot begin at the ticker." question="What did executable depth show, and how is it kept?" />
          <div className={styles.paperText}>
            <p>
              A second capture, on {firstDepth.date}, measured executable depth through Jupiter for {firstDepth.measured} tokenized equities at {list(firstDepth.sizes)} USDC. {firstDepth.routedAtSmallest} produced a route at the smallest size. {firstDepth.unrouted} did not.
            </p>
            <p>
              Against the smallest observed size, the shortfall at {firstDepth.middle} USDC was {list(firstDepth.shortfall.map((row) => `${row.middle} basis points for ${row.symbol}`))}. At {firstDepth.largest} USDC it was {list(firstDepth.shortfall.map((row) => (row.largest === null ? `no observation for ${row.symbol}` : `${row.largest} for ${row.symbol}`)))}.
            </p>
            <p>
              A wider capture on {latestDepth.date} measured {latestDepth.measured} instruments at the same sizes. {latestDepth.routedAtSmallest} routed at the smallest size and {latestDepth.unrouted} did not. The table below carries every routed instrument from that capture.
            </p>
            <p>These measurements are intentionally narrow. They represent one aggregator, one direction and observations made seconds apart. They do not establish a permanent liquidity characteristic for any ticker.</p>
            <p>That limitation is the reason depth is stored as an observation rather than a label.</p>
            <p>The same treatment applies to unsupported state. If the mint decoder encounters a Token-2022 extension it does not understand, the extension is retained as unknown rather than discarded. If Jupiter returns an unfamiliar refusal, the provider&apos;s refusal survives normalization instead of being coerced into a known error class.</p>
            <p>Otherwise two materially different states become indistinguishable inside the system: absence and ignorance.</p>
            <p>Before an instrument enters a Seametry Formula, the Assay therefore combines several independent properties: the legal form assigned to the claim, issuer prerogatives decoded from the mint, effective multiplier state, unknown extensions, corporate-action state and depth observed at a stated size. Seametry calls the admission discipline Good Delivery.</p>
            <p>The Assay itself does not decide whether an instrument belongs in a basket. That is policy.</p>
          </div>
          <figure className={styles.paperEvidence}>
            <figcaption>
              Shortfall in basis points against the smallest size, one direction, Jupiter, captured {latestDepth.date}. {latestDepth.unrouted} instruments without a route at the smallest size are not listed.
            </figcaption>
            <table>
              <thead>
                <tr>
                  <th scope="col">Instrument</th>
                  <th scope="col">{latestDepth.middle} USDC</th>
                  <th scope="col">{latestDepth.largest} USDC</th>
                </tr>
              </thead>
              <tbody>
                {latestDepth.shortfall.map((row) => (
                  <tr key={row.symbol}>
                    <td>
                      <span className={styles.paperLot}>
                        <LotMark symbol={row.symbol} src={logoFor(row.mint)} />
                        {row.symbol}
                      </span>
                    </td>
                    <td className={styles.paperFigure}>{row.middle}</td>
                    <td className={styles.paperFigure}>{row.largest ?? "no observation"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        </section>

        <section className={styles.section}>
          <SectionHeading index="06" title="Deterministic admission." question="What does an admission decision record?" />
          <div className={styles.paperText}>
            <p>
              <code>server/internal/policy</code> evaluates an explicit input object against a versioned policy document. It has no network dependency, database access or ambient clock. <code>AsOf</code> is part of the input rather than something the evaluator discovers for itself.
            </p>
            <p>The result is ALLOW, WARN or BLOCK, accompanied by stable reason codes, the policy version and a SHA-256 digest of the canonical input.</p>
            <p>The policy can distinguish an unclassified legal grade from a paused mint, a non-transferable constituent, an unresolved multiplier, absent depth, excessive measured shortfall or an unrecognized route refusal. Issuer powers such as freeze authority and permanent delegation are separately represented rather than collapsed into a generic risk flag.</p>
            <p>
              The current snapshot applies <span className={styles.paperFigure}>{admissions.policy}</span> to {admissions.captured} captured instruments. {admissions.admitted} are admitted with a non-zero measured capacity; {admissions.atLargestSize.length} of those clear the largest measured size, {latestDepth.largest} USDC: {list(admissions.atLargestSize)}.
            </p>
            <p>
              The specific thresholds are not sacred. <code>DepthCeilingBps</code>, for instance, is documented in the implementation as an assumption rather than a discovered natural constant. What matters is that a later reader can recover which rule was applied to which observation. A decision issued under {admissions.policy} remains interpretable after a later policy exists.
            </p>
            <p>That property is more useful than pretending an admission system has discovered a timeless definition of acceptable collateral.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="07" title="The Open AP mechanism." question="Where may a price enter, and where may it not?" />
          <div className={styles.paperText}>
            <p>The Hall&apos;s ownership arithmetic operates on quantities, not valuations.</p>
            <p>Strike determines the constituent units required for the requested number of shares. Melt determines the constituent units represented by shares being destroyed. No oracle price participates in either operation.</p>
            <p>Market prices remain essential outside that boundary. An AP deciding whether to create or redeem needs constituent observations, share price, executable depth, fees and assembly cost. A Terminal needs NAV to expose premium or discount. None of those values needs authority to rewrite how many constituent atoms a valid share represents.</p>
            <p>The distinction isolates ownership arithmetic from market-data failure. If an oracle disappears, an AP may lose the information required to judge an arbitrage. A holder should not consequently lose the protocol&apos;s ability to establish what the share is owed.</p>
            <p>Open AP therefore describes more than permissionless minting. The mechanism only becomes credible if the exit remains legible under conditions inherited from the constituents themselves. That is where the simple versions begin to fracture.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="08" title="Receipts." question="What can a reader verify after a decision is made?" />
          <div className={styles.paperText}>
            <p>Seametry applies the same reproducibility requirement after a decision has been made.</p>
            <p>Domain objects are canonicalized before hashing. Receipt bodies form leaves in an RFC 6962-style Merkle tree. Policy decisions retain their input digests and versions. Batches can be anchored separately.</p>
            <p>The Go implementation seals receipts while an independent JavaScript verifier reproduces canonicalization, leaf composition and proof verification without sharing the server implementation. CI runs the two against each other.</p>
            <p>The receipt is deliberately narrow evidence. It does not establish that an admission threshold was wise or that a trade was desirable. It establishes which inputs were recorded, which policy processed them and whether the resulting object still verifies. That is enough to make later explanations falsifiable.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="09" title="Current boundary." question="What exists today, and what does not?" />
          <div className={styles.chapterGrid}>
            <div className={styles.paperText}>
              <p>The project is not a mainnet fund.</p>
              <p>The Go core, Token-2022 decoder, multiplier resolver, policy engine, exact amount arithmetic, Jupiter depth capture, receipt machinery and Hall program exist. The Hall has been exercised on devnet. Mainnet instrument and liquidity evidence has been captured and committed.</p>
              <p>The professional Terminal is incomplete. The policy engine does not yet consume the intended onchain oracle observations. The Hall has not been deployed to mainnet, and the intended immutable deployment model is not described as an established property until the deployed program&apos;s upgrade authority shows it.</p>
              <p>&ldquo;ETF&rdquo; in this paper describes the basket-share and creation-redemption mechanism. It does not attempt to determine the legal classification of a future deployment.</p>
            </div>
            <aside className={styles.boundary}>
              <ClaimLine lead="Open AP removes institutional permission.">It does not remove issuer control from the assets being created and redeemed.</ClaimLine>
              <ClaimLine lead="Minting the share is no longer the difficult part.">The exit is.</ClaimLine>
              <TextAction href="/the-key">Read the upgrade authority</TextAction>
            </aside>
          </div>
        </section>
      </article>
    </PublicShell>
  );
}
