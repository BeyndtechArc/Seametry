import type { Metadata } from "next";
import { connection } from "next/server";
import { Figure, RouteAction, TextAction } from "@seametry/ui";
import { admissions, partitionAdmissions } from "@/lib/allocation/admissions";
import { formatAmount } from "@/lib/amount";
import { relativeEvidenceAge, stormFixture } from "@/lib/storm-fixture";
import { NetworkBadge } from "./_shell/page-header";
import styles from "./desk.module.css";

export const metadata: Metadata = {
  title: "Desk | Seametry",
  description: "Alloy No. 1, direct basket building, the Hall demonstration and instrument evidence.",
};

export default async function DeskPage() {
  await connection();
  const { admitted } = partitionAdmissions(admissions.instruments);
  const snapshotAge = relativeEvidenceAge(admissions.as_of);
  const stormAge = relativeEvidenceAge(stormFixture.observedAt);

  return (
    <>
      <div className={styles.tiles} data-testid="desk-folio">
        <section className={`${styles.tile} ${styles.lead}`} aria-labelledby="storm-tile">
          <span className={styles.index}>01 / Alloy</span>
          <header>
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

        <section className={`${styles.tile} ${styles.inverse}`} aria-labelledby="allocation-tile">
          <span className={styles.index}>02 / Allocation</span>
          <header>
            <h2 id="allocation-tile">Build a basket</h2>
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
          <p>Allocation means direct ownership: each constituent settles into your wallet, with no pooled share between you and the assets.</p>
          <TextAction href="/app/allocation">Buy into your wallet</TextAction>
        </section>

        <section className={styles.tile} aria-labelledby="hall-tile">
          <span className={styles.index}>03 / Hall</span>
          <header>
            <h2 id="hall-tile">Demonstration</h2>
            <NetworkBadge network="Devnet" />
          </header>
          <p>Strike, freeze one constituent, Melt anyway, withdraw each leg. Signed by your own wallet.</p>
          <TextAction href="/app/hall">Run the demonstration</TextAction>
        </section>

        <section className={styles.tile} aria-labelledby="assay-tile">
          <span className={styles.index}>04 / Assay</span>
          <header>
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
