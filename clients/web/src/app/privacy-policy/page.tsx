import type { Metadata } from "next";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Privacy policy | Seametry",
  description: "How Seametry collects, uses, stores and deletes account, linked-wallet and trading activity data.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Effective 16 October 2026</span>
          <h1>Privacy policy</h1>
          <p>This policy explains how Beyndtech Arc handles personal data when you use Seametry.</p>
        </header>

        <section className={styles.section}>
          <SectionHeading index="01" title={["Google returns account identity data", "when you sign in."]} />
          <div className={styles.paperText}>
            <p>When you choose Google sign-in, Google returns the account identifier and profile fields you authorize, which ordinarily include your name, email address and profile image. Seametry uses them to create your account, maintain your session, display the signed-in identity and help you return to saved records.</p>
            <p>Seametry requests identity scopes for account access. It does not use Google account data for advertising or sell it. Google&apos;s own handling of the sign-in request is governed by Google&apos;s policies.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="02" title={["A linked wallet remains public.", "Linking stores its address, network and challenge status."]} />
          <div className={styles.paperText}>
            <p>To link a wallet, Seametry issues a single-use challenge and verifies the signature returned by that wallet. We store the public wallet address, network, challenge status and the account link. We do not receive or store the wallet&apos;s private key or seed phrase.</p>
            <p>Wallet addresses, transaction signatures, token balances and on-chain activity are public blockchain data. Deleting a Seametry account cannot remove records from Solana or another public network.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="03" title={["Trades through Seametry are recorded", "by the wallet that asked for them."]} />
          <div className={styles.paperText}>
            <p>When you ask Seametry for a quote, or buy or sell through it, we record the public address of the wallet that asked, whether or not you have signed in: each quote we prepared or refused and the reason we gave, the terms of each leg, and whether each leg was sent. Your browser also reports steps only it can see: a wallet connecting, a review opening, a signature being requested, declined or failing, and a review closed without signing.</p>
            <p>With a wallet&apos;s first quote, your browser sends where it first arrived on Seametry: the referring site&apos;s address, the first page you opened and any campaign tags in that link. If you arrived through a Seametry referral link (/r/ followed by a code), that referral code is kept with this first touch; a code made for a direct message can name the account it was sent to. It is held in your browser until then, sent once, and never sent if you do not trade. None of this uses a cookie, and we do not store your IP address with it.</p>
            <p>When you send feedback, we keep your message, the page you came from, and the email address and wallet only if you chose to give them, and we mail them to the team&apos;s inbox.</p>
            <p>Trade records are kept as the history of what Seametry did for that wallet. Funnel steps are deleted after 24 months. If you sign in and link a wallet, your account shows that wallet&apos;s records. You may ask us to delete the records kept for a wallet you control; its transactions remain public on chain.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="04" title={["Saved work names its owner address,", "with what else the account service can retain."]} />
          <div className={styles.paperText}>
            <p>When account storage is enabled, Seametry may also retain saved Allocation plans, Hallmarks, linked addresses and the network attached to each record. A reusable basket template copied to another wallet becomes a new plan for that wallet.</p>
            <p>We also process session cookies, request timestamps, IP-derived country codes, browser and device information, and security logs needed to operate, rate-limit and investigate the service. We do not create an account merely because you browse the public site or connect a wallet.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="05" title={["Providers receive only what their task requires,", "and these are the providers."]} />
          <div className={styles.paperText}>
            <p>Google processes account sign-in. Better Auth supplies account software and its infrastructure connection supplies account management and service analytics. Database, hosting, network and security providers process the data required to run the service. Hostinger carries the team&apos;s email, including feedback. Wallets, Solana RPC providers, issuers and trading venues receive transaction or public-chain data when you use their services.</p>
            <p>We may disclose data when required by law, to protect the service and its users, or as part of a business transfer subject to the protections applicable to the data.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="06" title={["You may delete your account,", "and the control you keep over your data."]} />
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
