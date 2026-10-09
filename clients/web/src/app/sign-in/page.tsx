import type { Metadata } from "next";
import { connection } from "next/server";
import { TextAction } from "@seametry/ui";
import { accountServiceConfigured } from "@/lib/auth-proxy";
import { PublicShell, SectionHeading } from "../public-shell";
import { SignInControl } from "./sign-in-control";
import styles from "../site.module.css";

export const metadata: Metadata = {
  title: "Sign in | Seametry",
  description: "Open a Seametry account or continue with an external wallet.",
};

export default async function SignInPage() {
  await connection();
  return (
    <PublicShell current="sign-in">
      <header className={styles.accessPanel}>
        <div className={styles.accessThreshold} aria-hidden="true"><span /><span /></div>
        <div>
          <span>Access</span>
          <h1>Your account, your wallet.</h1>
          <p>
            An account keeps your sign-in across devices. Your external wallet still controls its address and approves each
            transaction. You can browse the catalogue without an account.
          </p>
        </div>
        <div className={styles.signInBoundary}>
          <SignInControl configured={accountServiceConfigured()} />
          <TextAction href="/app/alloys">Inspect live Alloys</TextAction>
        </div>
      </header>

      <section className={styles.section}>
        <SectionHeading index="01" title="Account and wallet" question="What does each connection authorize?" />
        <div className={styles.accessGrid}>
          <article className={styles.accessStep}>
            <b>Sign in to your account.</b>
            <p>Google confirms an account identity and the site opens a revocable session. This does not connect a wallet.</p>
          </article>
          <article className={styles.accessStep}>
            <b>Connect an external wallet.</b>
            <p>The address and its network are shown before any trade. Only the wallet can approve a transaction.</p>
          </article>
          <article className={styles.accessStep}>
            <b>Keep owners separate.</b>
            <p>Each Allocation belongs to its signing address. An account does not combine the holdings of different wallets.</p>
          </article>
          <article className={styles.accessStep}>
            <b>Keep public evidence public.</b>
            <p>Catalogue, Hall demonstration and public Hallmarks remain readable without an account.</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading index="02" title="Data boundary" question="What does the account retain?" />
        <div className={styles.boundary}>
          <p>
            If you sign in, the account service stores the identifier, name and email returned by Google, a session record, and
            the sign-in provider record. You can sign out or request account deletion above after signing in. Public on-chain
            transactions remain on-chain after deletion. No wallet key or seed phrase is requested.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
