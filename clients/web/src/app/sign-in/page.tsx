import type { Metadata } from "next";
import { connection } from "next/server";
import { RouteAction, Stamp, TextAction } from "@seametry/ui";
import { PublicShell, SectionHeading } from "../public-shell";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Sign in | Seametry",
  description: "No account is needed. Connect a wallet to use the Hall demonstration and the Allocation.",
};

export default async function SignInPage() {
  await connection();
  return (
    <PublicShell current="sign-in">
      <header className={styles.accessPanel}>
        <div className={styles.accessThreshold} aria-hidden="true"><span /><span /></div>
        <div>
          <span>Access</span>
          <h1>No account needed.</h1>
          <p>
            Open the app and connect a wallet from its top bar. That is enough to run the Hall demonstration on devnet and to
            buy an Allocation on mainnet. Connecting signs nothing: every transaction is shown to you before your wallet asks
            you to sign it.
          </p>
        </div>
        <div className={styles.signInBoundary}>
          <Stamp kind="warn" reason="Signing in, for saved formulas and watchlists, is API step A6 and is not built." />
          <RouteAction href="/app/allocation">Open the Allocation</RouteAction>
          <TextAction href="/app/hall">Run the Hall demonstration</TextAction>
        </div>
      </header>

      <section className={styles.section}>
        <SectionHeading index="01" title="What signing in will add" question="What will the wallet sign, and what will the Office retain?" />
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
          <p>
            This page asks for nothing and opens no session. The site keeps two things, only in this browser: the colour mode you
            chose, and the name of the wallet you last connected, so a returning visit reconnects it. The privacy notice and
            deletion path join the first functional sign-in release.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
