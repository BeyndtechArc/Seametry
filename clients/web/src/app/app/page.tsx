import type { Metadata } from "next";
import { connection } from "next/server";
import { Figure, RouteAction, TextAction } from "@seametry/ui";
import { admissions, partitionAdmissions } from "@/lib/allocation/admissions";
import { formatAmount } from "@/lib/amount";
import { relativeEvidenceAge, stormFixture } from "@/lib/storm-fixture";
import { NetworkBadge, PageHeader } from "./_shell/page-header";
import styles from "./desk.module.css";

export const metadata: Metadata = {
  title: "Desk | Seametry",
  description: "Alloy No. 1, the Allocation, the Hall demonstration and the instrument assay, each with the evidence behind it.",
};

export default async function DeskPage() {
  await connection();
  const { admitted } = partitionAdmissions(admissions.instruments);
  const snapshotAge = relativeEvidenceAge(admissions.as_of);
  const stormAge = relativeEvidenceAge(stormFixture.observedAt);

  return (
    <>
      <PageHeader group="Desk" title="Overview" network="Mainnet evidence" sentence="What the product holds today, and where each figure comes from." />
      <div className={styles.tiles}>
        <section className={`${styles.tile} ${styles.lead}`} aria-labelledby="storm-tile">
          <header>
            <span>Hall</span>
            <h2 id="storm-tile">Alloy No. 1, STORM</h2>
            <NetworkBadge network="Devnet" />
          </header>
          <Figure
            label="Shares outstanding"
            value={formatAmount(stormFixture.supply.atoms, 0)}
            unit="shares"
            source={stormFixture.source}
            state="verified"
            age={stormAge}
            observedAt={stormFixture.observedAt}
          />
          <p>{stormFixture.legs.length} constituents, labelled devnet fixture. Key still in hand.</p>
          <RouteAction href="/app/alloys/storm">Open Alloy No. 1</RouteAction>
        </section>

        <section className={styles.tile} aria-labelledby="allocation-tile">
          <header>
            <span>Buy</span>
            <h2 id="allocation-tile">Allocation</h2>
            <NetworkBadge network="Mainnet" />
          </header>
          <Figure
            label="Lots admitted"
            value={`${admitted.length} of ${admissions.instruments.length}`}
            unit="captured"
            source={`Policy engine, ${admissions.policy_version}`}
            state="stale"
            age={snapshotAge}
            observedAt={admissions.as_of}
          />
          <TextAction href="/app/allocation">Buy into your wallet</TextAction>
        </section>

        <section className={styles.tile} aria-labelledby="hall-tile">
          <header>
            <span>Hall</span>
            <h2 id="hall-tile">Demonstration</h2>
            <NetworkBadge network="Devnet" />
          </header>
          <p>Strike, freeze one constituent, Melt anyway, withdraw each leg. Signed by your own wallet.</p>
          <TextAction href="/app/hall">Run the demonstration</TextAction>
        </section>

        <section className={styles.tile} aria-labelledby="assay-tile">
          <header>
            <span>Assay</span>
            <h2 id="assay-tile">Instruments</h2>
            <NetworkBadge network="Mainnet evidence" />
          </header>
          <p>Grade, issuer powers and depth at size for every captured instrument, read through the Gateway.</p>
          <TextAction href="/app/instruments">Open the assay</TextAction>
        </section>
      </div>
    </>
  );
}
