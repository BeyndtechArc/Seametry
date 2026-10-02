import type { Metadata } from "next";
import { connection } from "next/server";
import {
  ConditionReport,
  Digest,
  EvidenceRow,
  Field,
  Figure,
  FormulaLedger,
  Grade,
  HallmarkRow,
  Key,
  Punch,
  ProvenanceLine,
  QuietLink,
  RouteAction,
  Rule,
  Serial,
  Stamp,
  TextAction,
  Timestamp,
  type EvidenceState,
} from "@seametry/ui";
import { ThemeControl } from "@seametry/ui/theme-control";
import { relativeEvidenceAge, stormFixture } from "@/lib/storm-fixture";
import { ModalSheetSpecimen } from "./modal-sheet-specimen";
import styles from "./patterns.module.css";

export const metadata: Metadata = {
  title: "Pattern Register | Seametry",
  description: "Shared Seametry component specimens and state assays.",
};

const fixtureObservedAt = "2026-09-29T09:42:00Z";
const fixtureDigest = "fe4bc25373f6f7cd2f78444f413b0fe54c1e6632101adbc92d63f729321a97de";

function Specimen({
  name,
  question,
  children,
  wide = false,
}: {
  name: string;
  question: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <article className={wide ? styles.specimenWide : styles.specimen}>
      <header>
        <span>Registered component</span>
        <h3>{name}</h3>
        <p>{question}</p>
      </header>
      <div className={styles.specimenBody}>{children}</div>
    </article>
  );
}

function StateFigure({ state }: { state: EvidenceState }) {
  const labels: Record<EvidenceState, string> = {
    verified: "Default",
    loading: "Loading",
    empty: "Empty",
    stale: "Stale",
    unavailable: "Unavailable",
    error: "Error",
    unverified: "Unverified",
  };

  const hasValue = state === "verified" || state === "stale" || state === "unverified";

  return (
    <article className={styles.stateSpecimen}>
      <h3>{labels[state]}</h3>
      <Figure
        label="Alloy supply"
        value={hasValue ? "1,024.650000" : undefined}
        unit={hasValue ? "shares" : undefined}
        source="Pattern Register fixture"
        state={state}
        age={hasValue ? (state === "stale" ? "3d" : "17m") : undefined}
        observedAt={hasValue ? fixtureObservedAt : undefined}
        size="regular"
      />
    </article>
  );
}

export default async function PatternRegisterPage() {
  await connection();
  const stormFixtureAge = relativeEvidenceAge(stormFixture.observedAt);

  return (
    <main className={styles.register}>
      <header className={styles.housePlate}>
        <div className={styles.plateRail}>
          <span>Office pattern register</span>
          <ThemeControl />
        </div>
        <div className={styles.plateBody}>
          <div className={styles.plateIndex} aria-hidden="true">
            <span>R</span>
            <span>01</span>
          </div>
          <div className={styles.plateCopy}>
            <span>Internal specimen surface</span>
            <p>
              Shared parts are admitted here before a product surface depends on them. Each specimen exposes its
              silhouette, material, states and limits.
            </p>
            <span>Labelled fixture data</span>
          </div>
        </div>
        <h1>
          <span>The Pattern</span>
          <span>Register</span>
        </h1>
        <Rule label="Identity before inventory" />
      </header>

      <section className={styles.section} aria-labelledby="edges-heading" data-testid="edge-grammar">
        <div className={styles.sectionHeading}>
          <span>Shape carries intent</span>
          <h2 id="edges-heading">Edge grammar</h2>
          <p>Square records, a single registration cut for authored surfaces, and full roundness for controls.</p>
        </div>

        <div className={styles.edgeGrid}>
          <article className={styles.edgeEvidence}>
            <div className={styles.edgeShape} aria-hidden="true" />
            <h3>Evidence edge</h3>
            <p>Zero radius. The record reads as printed data.</p>
          </article>
          <article className={styles.edgeRegistration}>
            <div className={styles.edgeShape} aria-hidden="true" />
            <h3>Registration cut</h3>
            <p>One clipped corner joins evidence to an authored surface without making it look touchable.</p>
          </article>
          <article className={styles.edgeControl}>
            <div className={styles.edgeShape} aria-hidden="true" />
            <h3>Control edge</h3>
            <p>Full roundness is reserved for something a person can operate.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="atoms-heading">
        <div className={styles.sectionHeading}>
          <span>Smallest authored parts</span>
          <h2 id="atoms-heading">Atoms</h2>
          <p>A component must look related to the Hall before colour or surrounding layout rescues it.</p>
        </div>

        <div className={styles.specimenGrid}>
          <Specimen name="Figure" question="What is the value, and what evidence travels with it?" wide>
            <Figure
              label="Executable depth"
              value="10,000"
              unit="USDC"
              source="Jupiter route fixture"
              state="verified"
              age="17m"
              observedAt={fixtureObservedAt}
            />
          </Specimen>

          <Specimen name="Applied marks" question="Can identity survive without a containing card?">
            <div className={styles.markStack}>
              <Serial value="0926A7K4M2Q" />
              <Digest value={fixtureDigest} />
              <Grade name="Certificate" />
              <Timestamp kind="Effective" relative="17m" absolute={fixtureObservedAt} />
            </div>
          </Specimen>

          <Specimen name="Punch" question="Which authority vouched for each part of the hallmark?">
            <div className={styles.punchStudy}>
              <Punch kind="sponsor" label="Sponsor's mark" detail="SM" />
              <Punch kind="grade" label="Grade" detail="C" />
              <Punch kind="office" label="Office" detail="O" />
              <Punch kind="date" label="Date" detail="0926" />
            </div>
          </Specimen>

          <Specimen name="Decision stamps" question="What did the published policy decide, and why?" wide>
            <div className={styles.stampStudy}>
              <Stamp kind="delivery" reason="The fixture meets the published entry conditions." />
              <Stamp kind="warn" reason="The reference observation is stale, 3 days." />
              <Stamp kind="block" reason="The transfer hook names an unpublished program." />
            </div>
          </Specimen>

          <Specimen name="Action register" question="Which silhouette matches the consequence of an action?" wide>
            <div className={styles.actionRegister} data-testid="action-register">
              <article>
                <h3>Route action</h3>
                <p>Moves a visitor into a product route without implying custody.</p>
                <RouteAction href="/app/hall">Inspect demonstration</RouteAction>
              </article>
              <article>
                <h3>Quiet link</h3>
                <p>Offers a secondary route when comparison matters more than arrival.</p>
                <QuietLink href="/app/alloys/storm">Compare evidence</QuietLink>
              </article>
              <article>
                <h3>Text action</h3>
                <p>Continues reading or opens a technical source without a button plate.</p>
                <TextAction href="https://github.com/BeyndtechArc/Seametry/blob/main/contracts/openapi/openapi.yaml">Read contract</TextAction>
              </article>
              <article>
                <h3>The Key</h3>
                <p className={styles.keyPurpose}>Reserved for the action that changes custody or state.</p>
                <Key>Approve and sign</Key>
              </article>
            </div>
          </Specimen>

          <Specimen name="Field" question="What value belongs here, and what must change when it is refused?">
            <div className={styles.fieldStudy}>
              <Field id="serial-fixture" label="Hallmark serial" defaultValue="0926A7K4M2Q" />
              <Field
                id="serial-refused-fixture"
                label="Hallmark serial"
                defaultValue="0926-I"
                invalid
                message="Use Crockford characters without punctuation."
              />
            </div>
          </Specimen>

          <Specimen name="Modal sheet" question="Which focused review can I inspect without losing the page that produced it?">
            <ModalSheetSpecimen />
          </Specimen>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="compositions-heading">
        <div className={styles.sectionHeading}>
          <span>Adjacency proves the system</span>
          <h2 id="compositions-heading">Compositions</h2>
          <p>Atoms earn admission when their rhythm remains legible beside other evidence.</p>
        </div>

        <div className={styles.compositions}>
          <Specimen name="Evidence row" question="What did each source say, and when?" wide>
            <div>
              <EvidenceRow
                source="Solana mint account fixture"
                value="1.000000"
                unit="multiplier"
                state="verified"
                relative="17m"
                absolute={fixtureObservedAt}
              />
              <EvidenceRow
                source="Issuer reference fixture"
                value="0.998500"
                unit="multiplier"
                state="stale"
                relative="3d"
                absolute={fixtureObservedAt}
              />
            </div>
          </Specimen>

          <Specimen name="Hallmark row" question="Who vouched for this record, and when?" wide>
            <HallmarkRow
              serial="0926A7K4M2Q"
              sponsor="SM"
              grade="Certificate"
              office="O"
              date="0926"
              seal="Verification pending"
            />
          </Specimen>

          <Specimen name="Formula ledger" question="What exactly backs each share in the recorded state?" wide>
            <FormulaLedger
              legs={[...stormFixture.legs]}
              source={stormFixture.source}
              state="verified"
              relative={stormFixtureAge}
              absolute={stormFixture.observedAt}
            />
          </Specimen>

          <Specimen name="Condition report" question="Which powers can affect delivery, stated without judgment?" wide>
            <ConditionReport
              statements={[...stormFixture.condition]}
              evidence={stormFixture.conditionEvidence}
            />
          </Specimen>

          <Specimen name="Provenance line" question="Through whose hands does the claim pass?" wide>
            <ProvenanceLine
              links={[
                { name: "Demo sponsor", role: "Founded the recorded alloy" },
                { name: "The Hall", role: "Holds the constituent accounts" },
                { name: "Mock issuer", role: "Controls the Token-2022 prerogatives" },
                { name: "Devnet holder", role: "Holds the recorded alloy shares" },
              ]}
            />
          </Specimen>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="states-heading" data-testid="state-assay">
        <div className={styles.sectionHeading}>
          <span>Absence remains visible</span>
          <h2 id="states-heading">State assay</h2>
          <p>Every universal state keeps the component&apos;s measure so changing evidence does not rearrange the page.</p>
        </div>
        <div className={styles.stateGrid}>
          <StateFigure state="verified" />
          <StateFigure state="loading" />
          <StateFigure state="empty" />
          <StateFigure state="stale" />
          <StateFigure state="unavailable" />
          <StateFigure state="error" />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="stress-heading">
        <div className={styles.sectionHeading}>
          <span>Identity under difficult conditions</span>
          <h2 id="stress-heading">Stress bench</h2>
          <p>Both grounds, narrow measure, long evidence copy, focus and reduced motion are part of the component.</p>
        </div>

        <div className={styles.themePair}>
          <article className={styles.themeSpecimen} data-sm-theme="dark" data-testid="dark-specimen">
            <span>Touchstone, forced dark</span>
            <Figure
              label="Share supply"
              value="1,024.650000"
              unit="shares"
              source="Hall account fixture"
              state="unverified"
              age="17m"
              observedAt={fixtureObservedAt}
              size="regular"
            />
            <Grade name="Certificate" />
          </article>

          <article className={styles.themeSpecimen} data-sm-theme="light" data-testid="light-specimen">
            <span>Certificate, forced light</span>
            <Figure
              label="Share supply"
              value="1,024.650000"
              unit="shares"
              source="Hall account fixture"
              state="unverified"
              age="17m"
              observedAt={fixtureObservedAt}
              size="regular"
            />
            <Grade name="Certificate" />
          </article>
        </div>

        <div className={styles.narrowBench}>
          <span>Narrow measure with long evidence</span>
          <Stamp
            kind="ngd"
            reason="The instrument carries an unrecognised extension from the captured mint account fixture, so the published delivery policy does not admit it."
          />
          <p>Loading motion becomes a still rule when reduced motion is requested. No information leaves with the animation.</p>
        </div>
      </section>
    </main>
  );
}
