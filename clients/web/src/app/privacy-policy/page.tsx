import type { Metadata } from "next";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Privacy policy | Seametry",
  description: "How Seametry collects, uses, stores and deletes account and linked-wallet data.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Effective 9 October 2026</span>
          <h1>Privacy policy</h1>
          <p>This policy explains how Beyndtech Arc handles personal data when you use Seametry.</p>
        </header>

        <section className={styles.section}>
          <SectionHeading index="01" title="Google returns account identity data." question="What arrives when you sign in?" />
          <div className={styles.paperText}>
            <p>When you choose Google sign-in, Google returns the account identifier and profile fields you authorize, which ordinarily include your name, email address and profile image. Seametry uses them to create your account, maintain your session, display the signed-in identity and help you return to saved records.</p>
            <p>Seametry requests identity scopes for account access. It does not use Google account data for advertising or sell it. Google&apos;s own handling of the sign-in request is governed by Google&apos;s policies.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="02" title="A linked wallet remains public." question="What does wallet linking store?" />
          <div className={styles.paperText}>
            <p>To link a wallet, Seametry issues a single-use challenge and verifies the signature returned by that wallet. We store the public wallet address, network, challenge status and the account link. We do not receive or store the wallet&apos;s private key or seed phrase.</p>
            <p>Wallet addresses, transaction signatures, token balances and on-chain activity are public blockchain data. Deleting a Seametry account cannot remove records from Solana or another public network.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="03" title="Saved work names its owner address." question="What else can the account service retain?" />
          <div className={styles.paperText}>
            <p>When account storage is enabled, Seametry may retain saved Allocation plans, execution records, Hallmarks, linked addresses and the network attached to each record. A reusable basket template copied to another wallet becomes a new plan for that wallet.</p>
            <p>We also process session cookies, request timestamps, IP-derived country codes, browser and device information, and security logs needed to operate, rate-limit and investigate the service. We do not create an account merely because you browse the public site or connect a wallet.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="04" title="Providers receive only what their task requires." question="Who processes data for Seametry?" />
          <div className={styles.paperText}>
            <p>Google processes account sign-in. Better Auth supplies account software and its infrastructure connection supplies account management and service analytics. Database, hosting, network and security providers process the data required to run the service. Wallets, Solana RPC providers, issuers and trading venues receive transaction or public-chain data when you use their services.</p>
            <p>We may disclose data when required by law, to protect the service and its users, or as part of a business transfer subject to the protections applicable to the data.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="05" title="You may delete your account." question="What control do you retain?" />
          <div className={styles.paperText}>
            <p>You may request access, correction or deletion of account data and may delete the account through Seametry when that control is available. Deletion removes the account and linked-address records held by Seametry, subject to records we must retain for security, disputes or legal obligations.</p>
            <p>Session records and operational logs are retained only for the period needed for their stated purpose. Public evidence and public blockchain history remain available independently of the account.</p>
            <p>Questions or requests about this policy may be raised through the public Seametry source repository. We may update this policy when the data we process or the providers we use change; the effective date identifies the published version.</p>
          </div>
        </section>
      </article>
    </PublicShell>
  );
}
