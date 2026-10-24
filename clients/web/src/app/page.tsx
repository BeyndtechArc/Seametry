import type { Metadata } from "next";
import { connection } from "next/server";
import { ProofStrip, QuietLink, RouteAction } from "@seametry/ui";
import { MechanismPlate } from "@seametry/ui/plates";
import { Discs } from "./components/figures/discs/discs";
import { HallLine } from "./components/figures/hall-line/figure";
import { AnchorChain } from "./components/landing/anchor-chain";
import { BasketCards } from "./components/landing/basket-cards";
import { OpenedAlloy } from "./components/landing/opened-alloy";
import { QuestionList } from "./components/landing/question-list";
import { StrikeSteps } from "./components/landing/strike-steps";
import { IncidentLedger, PublicShell, SectionHeading } from "./public-shell";
import styles from "./site.module.css";

export const metadata: Metadata = {
  title: "Seametry | Know what it's made of",
  description: "Seametry strikes baskets of tokenized stocks, grades every claim inside them, and hallmarks every trade.",
};

const changes = [
  ["keyless", "Formula", "Keyless by design.", "No instruction can alter a Formula, move a holder's assets or stop a Melt."],
  ["graded", "Grade", "Every claim graded.", "A claim's legal shape is read before its price, ticker or issuer language."],
  ["powers", "Issuer powers", "Issuer powers named.", "Freeze, pause, seizure, recipient gates and multipliers, as plain sentences."],
  ["claims", "Melt", "Held legs remain claims.", "A Melt records the holder's entitlement before any constituent is delivered."],
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
            <QuietLink className={styles.inkAction} href="/docs/how-it-works" icon="arrow-up-right">Read mechanism</QuietLink>
          </div>
        </div>
        <div className={styles.heroFigure}>
          <HallLine />
        </div>
        <div className={styles.heroDiscs}>
          <Discs />
        </div>
      </section>

      <section className={`${styles.section} ${styles.incidentSection}`}>
        <IncidentLedger />
      </section>

      <section className={styles.section}>
        <SectionHeading index="01" title={["Four things the Hall makes checkable", "before any basket moves."]} />
        <div className={styles.claimGrid} data-testid="change-register">
          {changes.map(([kind, subject, title, description], index) => (
            <MechanismPlate key={kind} kind={kind} index={index + 1} subject={subject} title={title}>{description}</MechanismPlate>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading index="02" title={["One Alloy, opened to every leg", "and to what each leg's issuer can still do."]} />
        <OpenedAlloy />
      </section>

      <section className={styles.section}>
        <SectionHeading index="03" title={["Strike a share from its stocks.", "Melt it back, and a frozen leg stays yours as a Claim."]} />
        <StrikeSteps />
      </section>

      <section className={styles.section}>
        <SectionHeading index="04" title={["Baskets a wallet can buy today,", "each stock settled straight to that wallet."]} />
        <BasketCards />
      </section>

      <section className={`${styles.section} ${styles.proofSection}`}>
        <SectionHeading index="05" title={["Four public artifacts back this page.", "Hallmarks are not anchored on chain yet."]} />
        <ProofStrip items={[
          { label: "Hall program", value: "Devnet program", href: "https://explorer.solana.com/address/GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE?cluster=devnet" },
          { label: "Issuer-power demonstration", value: "Read the recorded run", href: "/docs/papers/the-exit" },
          { label: "Program authority", value: "Key still in hand", href: "/docs/the-key" },
          { label: "Implementation", value: "Read the source", href: "https://github.com/BeyndtechArc/Seametry" },
        ]} />
        <AnchorChain />
      </section>

      <section className={styles.section}>
        <SectionHeading index="06" title={["Questions people ask", "before they hold an Alloy share."]} />
        <QuestionList />
      </section>

    </PublicShell>
  );
}
