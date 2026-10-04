import type { Metadata } from "next";
import { connection } from "next/server";
import { Figure, RouteAction, TextAction } from "@seametry/ui";
import { MechanismDrawing } from "@seametry/ui/plates";
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
    <div className={styles.folio} data-testid="desk-folio">
      <section className={styles.lead} aria-labelledby="storm-entry">
        <div className={styles.leadCopy}>
          <span className={styles.index}>01 / Alloy</span>
          <header>
            <h2 id="storm-entry">Alloy No. 1, STORM</h2>
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
        </div>
        <div className={styles.leadDrawing}>
          <MechanismDrawing kind="strike" />
        </div>
      </section>

      <section className={styles.entry} aria-labelledby="allocation-entry">
        <span className={styles.index}>02 / Allocation</span>
        <div className={styles.entryBody}>
          <header>
            <h2 id="allocation-entry">Build a basket</h2>
            <NetworkBadge network="Mainnet" />
          </header>
          <p>Allocation means direct ownership: each constituent settles into your wallet, with no pooled share between you and the assets.</p>
        </div>
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

      <section className={styles.entry} aria-labelledby="hall-entry">
        <span className={styles.index}>03 / Hall</span>
        <div className={styles.entryBody}>
          <header>
            <h2 id="hall-entry">Demonstration</h2>
            <NetworkBadge network="Devnet" />
          </header>
          <p>Strike, freeze one constituent, Melt anyway, withdraw each leg. Signed by your own wallet.</p>
        </div>
        <TextAction href="/app/hall">Run the demonstration</TextAction>
      </section>

      <section className={styles.entry} aria-labelledby="assay-entry">
        <span className={styles.index}>04 / Assay</span>
        <div className={styles.entryBody}>
          <header>
            <h2 id="assay-entry">Instruments</h2>
            <NetworkBadge network="Mainnet evidence" />
          </header>
          <p>Grade, issuer powers and depth at size for every captured instrument, read through the Gateway.</p>
        </div>
        <TextAction href="/app/instruments">Open the assay</TextAction>
      </section>
    </div>
  );
}
