import type { Metadata } from "next";
import { connection } from "next/server";
import {
  ConditionReport,
  Digest,
  Figure,
  FormulaLedger,
  Key,
  ProvenanceLine,
  Rule,
  Stamp,
} from "@seametry/ui";
import { ThemeControl } from "@seametry/ui/theme-control";
import { relativeEvidenceAge, stormFixture } from "@/lib/storm-fixture";
import styles from "./storm.module.css";

export const metadata: Metadata = {
  title: "STORM, Alloy No. 1 | Seametry Terminal",
  description: "A labelled devnet fixture of Alloy No. 1 in the Seametry Terminal.",
};

const supply = stormFixture.supply.atoms.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const lockedGenesis = stormFixture.lockedGenesis.atoms.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function SectionHeading({
  index,
  title,
  question,
}: {
  index: string;
  title: string;
  question: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <span>{index}</span>
      <h2>{title}</h2>
      <p>{question}</p>
    </header>
  );
}

export default async function StormAlloyPage() {
  await connection();
  const fixtureAge = relativeEvidenceAge(stormFixture.observedAt);

  return (
    <main className={styles.terminal}>
      <header className={styles.workbenchRail}>
        <div className={styles.wordmark}>
          <b>Seametry</b>
          <span>Terminal</span>
        </div>
        <nav aria-label="Workbench location">
          <span>Workbench</span>
          <span>Alloys</span>
          <span aria-current="page">Alloy 01</span>
        </nav>
        <ThemeControl />
      </header>

      <section className={styles.alloyPlate} aria-labelledby="alloy-title">
        <div className={styles.plateMeta}>
          <span>Labelled devnet fixture</span>
          <span>Recorded Hall state</span>
        </div>
        <div className={styles.plateBody}>
          <div className={styles.alloyNumber} aria-hidden="true">
            <span>Alloy</span>
            <b>01</b>
          </div>
          <div className={styles.alloyIdentity}>
            <span>Alloy No. 1</span>
            <h1 id="alloy-title">STORM</h1>
            <p>Two controlled mock constituents in the Hall&apos;s recorded founding state.</p>
          </div>
          <aside className={styles.hallState}>
            <span>Hall state</span>
            <b>Devnet Hall. Key still in hand.</b>
            <Digest value={stormFixture.programId} />
          </aside>
        </div>
        <Rule label="Formula fixed at founding" />
      </section>

      <section className={styles.primaryFacts} aria-label="Recorded alloy facts">
        <Figure
          label="Shares outstanding"
          value={supply}
          unit="shares"
          source={stormFixture.source}
          state="verified"
          age={fixtureAge}
          observedAt={stormFixture.observedAt}
        />
        <Figure
          label="Genesis shares locked"
          value={lockedGenesis}
          unit="shares"
          source={stormFixture.source}
          state="verified"
          age={fixtureAge}
          observedAt={stormFixture.observedAt}
        />
        <div className={styles.foundingRecord}>
          <span>Founding transaction</span>
          <Digest value={stormFixture.foundingSignature} />
          <span>Source commit</span>
          <Digest value={stormFixture.sourceCommit} />
        </div>
      </section>

      <section className={styles.section} data-testid="valuation">
        <SectionHeading
          index="01"
          title="Valuation"
          question="Which market observations exist for this alloy now?"
        />
        <div className={styles.valuationGrid}>
          <Figure
            label="NAV per share"
            source="Terminal API contract"
            state="unavailable"
            size="regular"
          />
          <Figure
            label="Share price"
            source="No share pool exists"
            state="unavailable"
            size="regular"
          />
          <div className={styles.valuationBoundary}>
            <Stamp kind="warn" reason="Whole-alloy Good Delivery evaluation is not built." />
            <p>The Hall reads no price. This page supplies none.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="02"
          title="Formula"
          question="What backs each share in the recorded founding state?"
        />
        <FormulaLedger
          legs={[...stormFixture.legs]}
          source={stormFixture.source}
          state="verified"
          relative={fixtureAge}
          absolute={stormFixture.observedAt}
        />
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="03"
          title="Condition"
          question="Which powers can affect constituent delivery?"
        />
        <ConditionReport statements={[...stormFixture.condition]} evidence={stormFixture.conditionEvidence} />
      </section>

      <section className={styles.section}>
        <SectionHeading
          index="04"
          title="Provenance"
          question="Through whose hands does this fixture pass?"
        />
        <ProvenanceLine
          links={[
            { name: "Demo sponsor", role: "Founded the recorded alloy" },
            { name: "The Hall", role: "Holds the constituent accounts" },
            { name: "Mock issuer", role: "Controls the Token-2022 prerogatives" },
            { name: "Devnet holder", role: "Holds the recorded alloy shares" },
          ]}
        />
      </section>

      <section className={styles.actionRail} aria-labelledby="strike-heading">
        <div>
          <span>Execution boundary</span>
          <h2 id="strike-heading">Strike</h2>
          <p>A connected execution plan will place the required inputs, enforced floors and fees here.</p>
        </div>
        <Key disabled disabledReason="Execution is not connected to this fixture.">Prepare strike</Key>
      </section>
    </main>
  );
}
