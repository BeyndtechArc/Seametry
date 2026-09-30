import type { Metadata } from "next";
import { connection } from "next/server";
import { ClaimLine, RouteAction, Stamp } from "@seametry/ui";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "How it works | Seametry",
  description: "Why a tokenized-stock bundle is not an ETF, and what the Hall changes.",
};

export default async function HowItWorksPage() {
  await connection();
  return (
    <PublicShell current="how">
      <header className={styles.storyHero}>
        <div className={styles.mechanismMark} aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
        </div>
        <span>Mechanism before marketing</span>
        <h1>The basket is a mechanism.</h1>
        <p>A bundle assembles tokens. An ETF adds a share whose creation and redemption loop remains open to participants on both sides of the market.</p>
      </header>

      <section className={styles.section}>
        <SectionHeading index="01" title="A claim is not the underlying." question="What does a tokenized stock put in the holder's wallet?" />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>At the Seam</span>
            <h2>The wallet holds a claim.</h2>
            <p>A token can represent a security entitlement, a certificate that settles to cash, an interest in a vehicle holding private shares, or a claim the Office has not classified.</p>
            <p>Those legal shapes can trade under similar symbols while giving the holder different routes back to the thing named on screen.</p>
          </article>
          <aside className={styles.boundary}>
            <Stamp kind="warn" reason="Grade describes legal shape, never quality." />
            <p>The issuer&apos;s on-chain controls travel beside the Grade. Seametry does not turn either one into a score.</p>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading index="02" title="A bundle stops at assembly." question="What is missing after several tokens arrive in one transaction?" />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>The bundle</span>
            <h2>Assembly produces constituents.</h2>
            <p>The holder receives several constituent tokens. There is no separate share, no fixed Formula behind that share, and no mechanism that lets another participant close a gap between the parts and the whole.</p>
          </article>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>The Alloy</span>
            <h2>The loop begins at the Hall.</h2>
            <p>A Strike deposits the Formula and issues shares. A Melt destroys shares and records a claim on every constituent. Delivery follows each issuer&apos;s current controls without undoing the claim.</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading index="03" title="The authorized participant set is everyone." question="Who can create shares or return them to the Formula?" />
        <div className={styles.chapterGrid}>
          <article className={styles.chapter}>
            <span className={styles.chapterLabel}>Open participation</span>
            <h2>No approval list exists.</h2>
            <p>Any wallet holding the required constituents can Strike shares. Any wallet holding shares can Melt them without asking Seametry to approve the participant.</p>
          </article>
          <aside className={styles.boundary}>
            <ClaimLine lead="The Hall reads quantities.">Strike and Melt do not use an oracle, a quote or NAV as an instruction input.</ClaimLine>
            <ClaimLine lead="Delivery stays explicit.">A constituent held back by its issuer remains a named Claim and can be withdrawn when delivery resumes.</ClaimLine>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <RouteAction href="/app/hall">Inspect the mechanism</RouteAction>
      </section>
    </PublicShell>
  );
}
