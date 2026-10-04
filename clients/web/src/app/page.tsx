import type { Metadata } from "next";
import { connection } from "next/server";
import {
  AgentPanel,
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

const changes = [
  ["Keyless by design.", "No instruction can alter a Formula, move a holder's assets, or stop a Melt.", "keyless"],
  ["Every claim graded.", "The legal shape leads before price, ticker or issuer language.", "graded"],
  ["Issuer powers named.", "Freeze, pause, seizure, recipient gates and multiplier controls appear as plain sentences.", "powers"],
  ["Held legs remain claims.", "A Melt records the holder's entitlement before any constituent is delivered.", "claims"],
] as const;

function ChangeIllustration({ kind }: { kind: (typeof changes)[number][2] }) {
  if (kind === "keyless") {
    return (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <path d="M28 126h184M48 126V54h144v72M62 54l58-30 58 30M78 126V72M104 126V72M136 126V72M162 126V72" />
        <path d="M108 94h24v24h-24zM120 94V78" />
      </svg>
    );
  }
  if (kind === "graded") {
    return (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <ellipse cx="120" cy="75" rx="70" ry="46" />
        <ellipse cx="120" cy="75" rx="49" ry="31" />
        <path d="m120 42 9 22 24 2-18 15 6 23-21-13-21 13 6-23-18-15 24-2 9-22ZM36 75h24M180 75h24" />
      </svg>
    );
  }
  if (kind === "powers") {
    return (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <path d="M38 34h164v82H38zM56 52h128M56 75h128M56 98h128" />
        <path d="M68 45v14M101 68v14M151 91v14M174 45v14" />
        <circle cx="68" cy="52" r="4" /><circle cx="101" cy="75" r="4" /><circle cx="151" cy="98" r="4" /><circle cx="174" cy="52" r="4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <path d="M34 120h172M48 120V45h144v75M64 45l56-24 56 24M72 120V64M168 120V64" />
      <path d="M91 62h58v58H91zM104 75h32v32h-32zM120 107v13" />
    </svg>
  );
}

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
        <div className={styles.claimGrid} data-testid="change-register">
          {changes.map(([title, description, kind], index) => (
            <article className={styles.changePlate} key={title} data-testid="change-plate">
              <header><small>0{index + 1}</small><h3>{title}</h3></header>
              <div className={styles.changeArtwork}><ChangeIllustration kind={kind} /></div>
              <p>{description}</p>
            </article>
          ))}
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
