import type { Metadata } from "next";
import { connection } from "next/server";
import { Key, Stamp } from "@seametry/ui";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Sign in | Seametry",
  description: "The wallet sign-in boundary for the Seametry Terminal.",
};

export default async function SignInPage() {
  await connection();
  return (
    <PublicShell current="sign-in">
      <header className={styles.accessPanel}>
        <div>
          <span>Identity boundary</span>
          <h1>Enter with a wallet.</h1>
          <p>Seametry will use Sign In With Solana. A wallet signs a domain-bound, single-use message. No email or password enters the flow.</p>
        </div>
        <div className={styles.signInBoundary}>
          <Stamp kind="warn" reason="API step A6 is not built." />
          <Key disabled disabledReason="Wallet sign-in is not built. Public evidence needs no account.">Sign message</Key>
        </div>
      </header>

      <section className={styles.section}>
        <SectionHeading index="01" title="What the ceremony will do" question="What will the wallet sign, and what will the Office retain?" />
        <div className={styles.accessGrid}>
          <article className={styles.accessStep}>
            <b>Request a challenge.</b>
            <p>The Office issues a single-use message naming the domain, wallet address, URI, issue time and expiry.</p>
          </article>
          <article className={styles.accessStep}>
            <b>Sign the message.</b>
            <p>The wallet signs the challenge. It does not sign a transaction or transfer an asset.</p>
          </article>
          <article className={styles.accessStep}>
            <b>Open a session.</b>
            <p>The Office checks the signature, domain, nonce and times before it opens a session.</p>
          </article>
          <article className={styles.accessStep}>
            <b>Keep public evidence public.</b>
            <p>Catalogue, Hall demonstration and public Hallmarks remain readable without an account.</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading index="02" title="Data boundary" question="What personal data exists on this page now?" />
        <div className={styles.boundary}>
          <p>This page has no wallet field, connector or session request. It stores only the selected colour mode in this browser. The privacy notice and deletion path join the first functional sign-in release.</p>
        </div>
      </section>
    </PublicShell>
  );
}
