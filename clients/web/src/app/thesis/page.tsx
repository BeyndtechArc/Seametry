import type { Metadata } from "next";
import { connection } from "next/server";
import { ClaimLine, Stamp } from "@seametry/ui";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "The thesis | Seametry",
  description: "Why Seametry opens the creation and redemption loop for tokenized-equity baskets, and how price, NAV, claims and execution fit together.",
};

export default async function ThesisPage() {
  await connection();

  return (
    <PublicShell>
      <header className={styles.storyHero}>
        <div className={styles.mechanismMark} aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
        </div>
        <span>Open thesis · living research</span>
        <h1>The mechanism beneath the basket.</h1>
        <p>
          Seametry opens the ETF creation and redemption function to any capable wallet,
          while preserving the fact that each tokenized equity still answers to its own issuer.
        </p>
      </header>

      <section className={styles.section}>
        <SectionHeading
          index="01"
          title="The AP function does not disappear."
          question="What changes when settlement machinery becomes software?"
        />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Traditional market</span>
            <h2>Authorized Participants close the gap.</h2>
            <p>
              ETF shares trade in a secondary market while their underlying basket has a separate
              value. Institutional APs create shares when the ETF trades rich and redeem them when
              it trades cheap, subject to costs and settlement constraints.
            </p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Seametry</span>
            <h2>The function becomes permissionless.</h2>
            <p>
              Any wallet that can source the Formula can Strike shares. Any holder can Melt shares
              into constituent claims. Permissionless participation removes an approval list; it
              does not remove capital, liquidity, execution or issuer constraints.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="02"
          title="The Hall knows quantities, not prices."
          question="Why can Strike and Melt keep working without an oracle?"
        />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Strike</span>
            <h2>Constituents become shares.</h2>
            <p>
              A Strike deposits the exact raw constituent quantities required by an Alloy Formula
              and mints the corresponding Alloy shares. The Hall does not need to know their dollar value.
            </p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Melt</span>
            <h2>Shares become claims.</h2>
            <p>
              A Melt burns Alloy shares and records the holder&apos;s quantity entitlement to every
              constituent. Each claim is then withdrawn independently when that issuer permits delivery.
            </p>
          </article>
        </div>
        <div className={styles.boundary}>
          <ClaimLine lead="Simple definition.">
            The Hall is the keyless on-chain machine that turns a fixed basket of constituent quantities into Alloy shares, and Alloy shares back into constituent claims.
          </ClaimLine>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="03"
          title="Price and value are separate observations."
          question="Who sets the Alloy price, and where does NAV come from?"
        />
        <div className={styles.comparison}>
          <article>
            <span className={styles.chapterLabel}>Market price</span>
            <h3>Set by the secondary market.</h3>
            <p>
              Once Alloy shares trade in an AMM or order book, buyers and sellers determine the
              executable share price. Seametry does not set it.
            </p>
          </article>
          <article>
            <span className={styles.chapterLabel}>Reference NAV</span>
            <h3>Calculated from constituent observations.</h3>
            <p>
              The Office can combine the Formula quantities with attributed reference prices to
              estimate NAV. Those prices may come from oracle or market-data sources and remain
              outside Strike and Melt.
            </p>
          </article>
        </div>
        <div className={styles.paperText}>
          <p><code>Reference NAV</code> = Σ constituent quantity × reference price.</p>
          <p><code>Strike spread</code> = Alloy market price − executable assembly cost.</p>
          <p><code>Melt spread</code> = executable constituent proceeds − Alloy market price.</p>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="04"
          title="NAV is not an executable promise."
          question="Why can the number on a wallet differ from what a trader can actually realize?"
        />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Reference</span>
            <h2>A price feed estimates value.</h2>
            <p>
              Wallets may display similar values when they consume similar market data. That does
              not force the Alloy to trade there, nor guarantee that every constituent can be bought
              or sold at the displayed reference price.
            </p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Execution</span>
            <h2>A quote measures a route now.</h2>
            <p>
              Assembly cost and melt proceeds come from executable routes at a stated size, with
              slippage, fees, quote age and venue conditions. The Terminal compares those numbers
              against both NAV and the Alloy&apos;s market price.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="05"
          title="Before secondary liquidity, there is no real Alloy market price."
          question="What happens before an Alloy share pool or order book exists?"
        />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>No pool yet</span>
            <h2>NAV can be observed. Price cannot be discovered.</h2>
            <p>
              Without buyers and sellers in a secondary venue, there is no independent market price
              for the Alloy to drift away from NAV. The meaningful numbers are the Formula&apos;s
              reference NAV and the executable cost of assembling or unwinding its constituents.
            </p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Allocations</span>
            <h2>Useful before an Alloy market exists.</h2>
            <p>
              Allocations let a wallet acquire and hold the constituents directly. They can produce
              real execution data, user behavior and demand evidence before Seametry has the capital
              or counterparties needed to seed a liquid Alloy share market.
            </p>
          </article>
        </div>
        <Stamp kind="warn" reason="An Allocation is not secondary liquidity for an Alloy. It is a direct constituent path and an evidence bridge until a share market exists." />
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="06"
          title="A Claim preserves an entitlement when delivery cannot finish."
          question="What exactly happens during a Melt?"
        />
        <div className={styles.paperText}>
          <p><strong>1.</strong> The Hall syncs the Alloy&apos;s constituent accounting.</p>
          <p><strong>2.</strong> The holder signs <code>redeem</code>; Alloy shares are burned and one claim balance is credited for every constituent. No constituent mint is invoked here.</p>
          <p><strong>3.</strong> The holder calls <code>withdraw</code> for each deliverable leg. Each withdrawal touches only that constituent.</p>
          <p><strong>4.</strong> If an issuer freezes, pauses or otherwise refuses a leg, that leg remains a Claim and can be retried later.</p>
        </div>
        <div className={styles.boundary}>
          <ClaimLine lead="One Melt, then independent delivery.">
            The economic redemption is established in the redeem instruction; physical token delivery can require separate withdraw transactions per constituent.
          </ClaimLine>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="07"
          title="The Terminal exists to make the open AP function practical."
          question="What does an arbitrageur actually need to know before acting?"
        />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Valuation</span>
            <h2>Reference NAV versus market price.</h2>
            <p>
              Show the Alloy&apos;s traded price beside attributed constituent reference prices,
              source age, current Formula quantities and any delivery restrictions.
            </p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Execution</span>
            <h2>Assembly cost versus melt proceeds.</h2>
            <p>
              Show executable depth at size, quote freshness, venue concentration, fees and the
              spread that remains after actual execution costs rather than headline NAV alone.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="08"
          title="The thesis remains falsifiable."
          question="What still has to be proven?"
        />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Market</span>
            <h2>Permissionless access does not create arbitrage capital.</h2>
            <p>
              Seametry still has to prove that market makers or other capable wallets will repeatedly
              Strike and Melt when spreads justify the work, and that share liquidity can become deep
              enough for the mechanism to matter.
            </p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Product</span>
            <h2>Correctness does not create adoption.</h2>
            <p>
              Early Allocations, wallet behavior, operator feedback and eventual share-market activity
              are evidence. The thesis should change when those observations contradict its assumptions.
            </p>
          </article>
        </div>
      </section>
    </PublicShell>
  );
}
