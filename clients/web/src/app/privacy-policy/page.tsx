import type { Metadata } from "next";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Privacy policy | Seametry",
  description: "How Seametry collects, uses, stores and deletes account, linked-wallet, trading activity and email opt-in data.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Effective 30 October 2026</span>
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
            <p>Separately, when you open a Seametry page from another site or from a typed or saved link, your browser reports that page and any referral code in the link to a daily count. For a code made for a direct message, only the channel is counted, never the account it names. The count keeps the day, the page, the code and how many times each was reported, and nothing that tells one visitor from another: no address, wallet, cookie or identifier, and nothing is stored in your browser for it.</p>
            <p>When you send feedback, we keep your message, the page you came from, and the email address and wallet only if you chose to give them, and we mail them to the team&apos;s inbox.</p>
            <p>Trade records are kept as the history of what Seametry did for that wallet. Funnel steps are deleted after 24 months. If you sign in and link a wallet, your account shows that wallet&apos;s records on any device you sign in from; without signing in, a browser shows only the records it kept itself, and no one can read a wallet&apos;s records by typing its address. You may ask us to delete the records kept for a wallet you control; its transactions remain public on chain.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="04" title={["An email address is kept only if you ask,", "and erased when you unsubscribe."]} />
          <div className={styles.paperText}>
            <p>After a first purchase, and on the feedback page, you may give an email address to hear when the Hall launches on mainnet and when your trades settle. It is kept only if you tick the box agreeing to that. We keep the address, the version of the sentence you agreed to, when you agreed, the referral code your browser first arrived with if there was one, the page you gave it on, and your connected wallet only if you ticked the second box to include it.</p>
            <p>We use the address for those two kinds of email and nothing else, and we do not sell or share it. Today no email is sent to these addresses at all; when sending starts, the provider that carries it will be named here first.</p>
            <p>When you give the address you are shown an unsubscribe link, and every email will carry one. Opening it and pressing Unsubscribe erases the address, the wallet and the link itself; we keep only the dates you agreed and withdrew and the version of the sentence, which name no one. Giving the address again replaces the earlier link. You can also write to seametry@beyndtech.com to have it removed. Until you unsubscribe, the address is kept.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="05" title={["Saved work names its owner address,", "with what else the account service can retain."]} />
          <div className={styles.paperText}>
            <p>When account storage is enabled, Seametry may also retain saved Allocation plans, Hallmarks, linked addresses and the network attached to each record. A reusable basket template copied to another wallet becomes a new plan for that wallet.</p>
            <p>We also process session cookies, request timestamps, IP-derived country codes, browser and device information, and security logs needed to operate, rate-limit and investigate the service. We do not create an account merely because you browse the public site or connect a wallet.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="06" title={["Providers receive only what their task requires,", "and these are the providers."]} />
          <div className={styles.paperText}>
            <p>Google processes account sign-in. Better Auth supplies the account software, which runs on Seametry&apos;s own server; no Better Auth hosted service receives account data. Database, hosting, network and security providers process the data required to run the service. Hostinger carries the team&apos;s email, including feedback. Wallets, Solana RPC providers, issuers and trading venues receive transaction or public-chain data when you use their services.</p>
            <p>We may disclose data when required by law, to protect the service and its users, or as part of a business transfer subject to the protections applicable to the data.</p>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading index="07" title={["You may delete your account,", "and the control you keep over your data."]} />
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
