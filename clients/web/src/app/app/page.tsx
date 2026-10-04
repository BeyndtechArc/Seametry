import type { Metadata } from "next";
import { connection } from "next/server";
import { Figure, RouteAction, TextAction } from "@seametry/ui";
import { MechanismDrawing } from "@seametry/ui/plates";
import { admissions, partitionAdmissions } from "@/lib/allocation/admissions";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { readTerminalApi, terminalProblem } from "@/lib/terminal-api";
import type { AlloyRegisterResponse } from "@/lib/terminal-contract";
import { NetworkBadge } from "./_shell/page-header";
import styles from "./desk.module.css";

export const metadata: Metadata = {
  title: "Desk | Seametry",
  description: "The Alloys on the Hall, direct basket building, the Hall demo and instrument evidence.",
};

async function readRegister() {
  try {
    return { register: await readTerminalApi<AlloyRegisterResponse>("v1/alloys") };
  } catch (error) {
    return { problem: terminalProblem(error) };
  }
}

export default async function DeskPage() {
  await connection();
  const { admitted } = partitionAdmissions(admissions.instruments);
  const snapshotAge = relativeEvidenceAge(admissions.as_of);
  const { register, problem } = await readRegister();
  const count = register?.data.length;

  return (
    <div className={styles.folio} data-testid="desk-folio">
      <section className={styles.lead} aria-labelledby="register-entry">
        <div className={styles.leadCopy}>
          <span className={styles.index}>01 / Alloy</span>
          <header>
            <h2 id="register-entry">{count === 0 ? "No Alloy founded yet" : "The Alloy register"}</h2>
            <NetworkBadge network="Devnet" />
          </header>
          {register ? (
            <Figure
              label="Alloys on the Hall"
              value={String(count)}
              unit={count === 1 ? "Alloy" : "Alloys"}
              source="Seametry Gateway, devnet Hall"
              state="verified"
              age={relativeEvidenceAge(register.meta.as_of)}
              observedAt={register.meta.as_of}
            />
          ) : (
            <Figure label="Alloys on the Hall" source={`Seametry Gateway: ${problem?.detail ?? "no answer"}`} state="unavailable" />
          )}
          <p>
            {count === 0
              ? "The Hall was redeployed empty. The first Alloy is founded once its Formula, name and artwork are settled. Key still in hand."
              : "Every Alloy here was founded on purpose on the devnet Hall. Key still in hand."}
          </p>
          <RouteAction href="/app/alloys">Open the register</RouteAction>
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
            <h2 id="hall-entry">Demo</h2>
            <NetworkBadge network="Devnet" />
          </header>
          <p>Strike, freeze one constituent, Melt anyway, withdraw each leg. Signed by your own wallet.</p>
        </div>
        <TextAction href="/app/hall">Run the demo</TextAction>
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
