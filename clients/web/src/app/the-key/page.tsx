import type { Metadata } from "next";
import { connection } from "next/server";
import { Digest, RouteAction, Stamp } from "@seametry/ui";
import { publicIncident } from "@/lib/public-evidence";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "The Key | Seametry",
  description: "The Hall's current upgrade-authority state and the guarantees its final program must carry.",
};

export default async function TheKeyPage() {
  await connection();
  return (
    <PublicShell current="key">
      <header className={styles.keyState}>
        <div>
          <span>Program authority</span>
          <h1>The Key is still in hand.</h1>
          <p>Devnet builds remain upgradeable while the Hall is being built. The mainnet ceremony follows a program audit and legal read. Until then, every surface says what the chain says now.</p>
          <Stamp kind="warn" reason="Devnet Hall. Key still in hand." />
        </div>
        <div className={styles.keyFacts}>
          <div className={styles.keyFact}>
            <span>Cluster</span>
            <b>Solana devnet</b>
          </div>
          <div className={styles.keyFact}>
            <span>Program</span>
            <Digest value={publicIncident.programId} />
          </div>
          <div className={styles.keyFact}>
            <span>Upgrade authority</span>
            <b>Present</b>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <SectionHeading index="01" title="What the final Hall must preserve" question="Which properties make the mechanism the product?" />
        <div className={styles.guaranteeGrid}>
          <article className={styles.guarantee}>
            <h2>The melt always works. Delivery is each issuer&apos;s.</h2>
            <p>Burning shares for a claim on the constituents cannot be blocked. Delivering each constituent remains subject to that constituent&apos;s issuer.</p>
          </article>
          <article className={styles.guarantee}>
            <h2>The Hall adds no prerogatives of its own.</h2>
            <p>The share mint has no freeze authority, permanent delegate, pause or hook. No instruction alters a Formula or stops a Melt.</p>
          </article>
          <article className={styles.guarantee}>
            <h2>The Hall never needs a price.</h2>
            <p>Strike and Melt move quantities. No oracle, quote or NAV enters either instruction.</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading index="02" title="What final means" question="How does the Hall change after the Key?" />
        <div className={styles.unavailablePanel}>
          <div>
            <h3>A new version is a new deployment.</h3>
            <p>The old Hall keeps its bytecode. Holders leave by Melting from one version and Striking into another.</p>
          </div>
          <div>
            <p>There is no transaction to cite yet because the devnet program has not been made final. This page will carry that transaction when it exists.</p>
            <RouteAction href="https://explorer.solana.com/address/4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx?cluster=devnet">Inspect the program</RouteAction>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
