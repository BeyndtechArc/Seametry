import type { Metadata } from "next";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Terms of service | Seametry",
  description: "The terms that govern access to Seametry and its account, wallet and transaction tools.",
};

export default function TermsPage() {
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Effective 9 October 2026</span>
          <h1>Terms of service</h1>
          <p>These terms govern your access to Seametry, operated by Beyndtech Arc from Port Harcourt, Nigeria.</p>
        </header>

        <section className={styles.section}>
          <SectionHeading index="01" title="Seametry publishes instruments and execution tools." question="What service do these terms cover?" />
          <div className={styles.paperText}>
            <p>Seametry presents evidence about tokenized instruments, lets a wallet prepare Allocations, and exposes the Hall&apos;s Strike, Melt, Claim and Hallmark records where those functions are available.</p>
            <p>Some records come from public blockchains, issuers, market venues or other providers. Their availability and age appear with the record. Devnet demonstrations use controlled assets and do not establish how a mainnet issuer will behave.</p>
            <p>Seametry does not provide investment, legal or tax advice. You decide whether an instrument, transaction or provider meets your requirements.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="02" title="Accounts return you to Seametry." question="What does signing in create?" />
          <div className={styles.paperText}>
            <p>Signing in with Google creates a Seametry account and session. The account may store your saved plans and links to wallet addresses that you prove you control. You are responsible for access to your Google account and devices.</p>
            <p>A Seametry account does not hold assets and does not sign wallet transactions. We may suspend or close an account that abuses the service, attempts unauthorized access, or breaches these terms.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="03" title="Wallets remain under their owners' control." question="Who approves an Allocation, Strike or Melt?" />
          <div className={styles.paperText}>
            <p>You connect a wallet and approve each signature in that wallet. Seametry does not receive or store wallet private keys or seed phrases.</p>
            <p>Every Allocation, execution and Hallmark belongs to its named wallet address and network. Linking several wallets to one account does not combine their assets, move their records, or transfer ownership between them.</p>
            <p>Blockchain transactions are public and may be irreversible after submission. Before signing, review the wallet address, network, assets, amounts, issuer terms, quoted path, fees and simulated balance changes shown to you.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="04" title="Issuers and providers keep their own powers." question="Which parts of a transaction sit outside Seametry?" />
          <div className={styles.paperText}>
            <p>Token issuers may freeze, pause, reclaim, gate or alter tokens according to their programs and terms. Wallets, Solana, trading venues, data sources, Google and hosting providers operate under their own terms.</p>
            <p>Seametry may refuse an action when required evidence, eligibility information, liquidity, provider access or network service is unavailable. A displayed route can change or expire before approval.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="05" title="The service and these terms can change." question="How are updates and disputes handled?" />
          <div className={styles.paperText}>
            <p>We may change, restrict or discontinue parts of Seametry and may update these terms as the service changes. The effective date at the top identifies the published version.</p>
            <p>To the extent permitted by applicable law, Seametry is provided without a promise of uninterrupted access, and Beyndtech Arc is not liable for indirect, incidental or consequential loss arising from use of the service.</p>
            <p>These terms are governed by the laws of the Federal Republic of Nigeria. Questions about these terms may be raised through the public Seametry source repository.</p>
          </div>
        </section>
      </article>
    </PublicShell>
  );
}
