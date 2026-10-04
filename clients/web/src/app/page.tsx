import type { Metadata } from "next";
import { connection } from "next/server";
import {
  AgentPanel,
  ClaimLine,
  ConditionReport,
  Grade,
  ProofStrip,
  ProvenanceLine,
  RouteAction,
  Stamp,
  TextAction,
} from "@seametry/ui";
import { IncidentLedger, OpenAPField, PublicShell, SectionHeading } from "./public-shell";
import styles from "./site.module.css";

export const metadata: Metadata = {
  title: "Seametry | Know what it's made of",
  description: "Seametry strikes baskets of tokenized stocks, grades every claim inside them, and hallmarks every trade.",
};

const loop = [
  ["Watch", "Read the instrument and every source that spoke or stayed silent."],
  ["Notice", "See issuer powers and evidence age before they become an incident."],
  ["Inspect", "Open the provenance and condition of every constituent."],
  ["Preflight", "Read the policy decision, version and reasons produced by the Office."],
  ["Approve", "Review the exact plan before a wallet signs."],
  ["Verify", "Check the hallmark against its published root in your own browser."],
] as const;

export default async function Home() {
  await connection();
  return (
    <PublicShell current="home">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <span>Exchange traded funds on Solana</span>
          <h1 id="home-title"><span>Open</span> <span>AP ETFs</span></h1>
          <p>Any wallet can create or redeem shares from a fixed Formula. Seametry opens every constituent and its issuer powers before the basket moves.</p>
          <div className={styles.heroActions}>
            <RouteAction href="/app">Open app</RouteAction>
            <TextAction href="/how-it-works">Read mechanism</TextAction>
          </div>
        </div>
        <OpenAPField />
      </section>

      <section className={`${styles.section} ${styles.incidentSection}`}>
        <IncidentLedger />
      </section>

      <section className={`${styles.section} ${styles.claimsSection}`}>
        <SectionHeading index="01" title="What changes" question="What does the Hall make observable or structurally different?" />
        <div className={styles.claimGrid}>
          <ClaimLine lead="Keyless by design.">No instruction can alter a Formula, move a holder&apos;s assets, or stop a Melt.</ClaimLine>
          <ClaimLine lead="Every claim graded.">The legal shape leads before price, ticker or issuer language.</ClaimLine>
          <ClaimLine lead="Issuer powers named.">Freeze, pause, seizure, recipient gates and multiplier controls appear as plain sentences.</ClaimLine>
          <ClaimLine lead="Held legs remain claims.">A Melt records the holder&apos;s entitlement before any constituent is delivered.</ClaimLine>
        </div>
      </section>

      <section className={`${styles.section} ${styles.instrumentSection}`}>
        <SectionHeading index="02" title="The instrument, opened" question="What sits between a company and the wallet holding its token?" />
        <div className={styles.fragmentGrid}>
          <article className={styles.fragmentPlate}>
            <span className={styles.plateLabel}>Living product fragment</span>
            <div className={styles.fragmentIdentity}>
              <h3>Mock stock A</h3>
              <p>A controlled Token-2022 constituent used in the recorded Hall demonstration.</p>
              <Grade name="Ungraded" />
            </div>
            <ProvenanceLine links={[
              { name: "Mock issuer", role: "Controls the demonstration mint" },
              { name: "Token-2022", role: "Carries the on-chain prerogatives" },
              { name: "The Hall", role: "Holds the constituent account" },
              { name: "Devnet holder", role: "Holds the Alloy shares" },
            ]} />
          </article>
          <ConditionReport
            statements={[
              "The mock issuer can freeze the Hall account for this token.",
              "The mock issuer can pause all movement of this token.",
              "The mock issuer can take this from the Hall through its permanent delegate.",
            ]}
            evidence="Labelled demonstration data from the recorded Solana devnet transcript. It does not describe another issuer."
          />
        </div>
      </section>

      <section className={`${styles.section} ${styles.comparisonSection}`}>
        <SectionHeading index="03" title="Why an ETF" question="Where does the mechanism begin after one-step assembly ends?" />
        <div className={styles.comparison}>
          <article>
            <span className={styles.plateLabel}>Bundle</span>
            <h3>Assembly is the product.</h3>
            <p>One transaction buys several tokens. The holder receives the constituents. No share exists, and no creation and redemption loop closes a gap.</p>
          </article>
          <article>
            <span className={styles.plateLabel}>Alloy</span>
            <h3>The loop is the product.</h3>
            <p>Shares exist because a Formula entered the Hall. Any wallet can Strike the Formula or Melt shares into claims on its constituents.</p>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.workingSection}`}>
        <SectionHeading index="04" title="The working" question="How does evidence travel from observation to a checkable record?" />
        <div className={styles.loop}>
          {loop.map(([title, description], index) => (
            <article className={styles.loopStep} key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.proofSection}`}>
        <SectionHeading index="05" title="What you can inspect now" question="Which claims have a public artifact behind them today?" />
        <ProofStrip items={[
          { label: "Hall program", value: "Devnet program", href: "https://explorer.solana.com/address/4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx?cluster=devnet" },
          { label: "Issuer-power demonstration", value: "Open the run", href: "/app/hall" },
          { label: "Program authority", value: "Key still in hand", href: "/the-key" },
          { label: "Implementation", value: "Read the source", href: "https://github.com/BeyndtechArc/Seametry" },
        ]} />
      </section>

      <section className={`${styles.section} ${styles.boundarySection}`}>
        <SectionHeading index="06" title="Verification boundary" question="What can a visitor verify, and what remains unanchored?" />
        <div className={styles.unavailablePanel}>
          <div>
            <h3>The ritual is built. The anchor is not.</h3>
            <Stamp kind="warn" reason="No batch root is written on chain yet." />
          </div>
          <p>The generated Explorer recomputes a Hallmark&apos;s public digest and Merkle path in the visitor&apos;s browser. Until a root is anchored, it stops before claiming an on-chain Seal.</p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.agentSection}`}>
        <SectionHeading index="07" title="For agents and code" question="Where is the contract another system can build against?" />
        <AgentPanel
          title="The contract comes first."
          description="Terminal resource shapes are generated for Go and TypeScript. The current Alloy handlers still name their unbuilt stage rather than returning invented data."
          command="GET /v1/alloys/{address}"
          href="https://github.com/BeyndtechArc/Seametry/blob/main/contracts/openapi/openapi.yaml"
        />
      </section>
    </PublicShell>
  );
}
