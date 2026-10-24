import type { Metadata } from "next";
import { PublicShell } from "../public-shell";
import styles from "../site.module.css";
import { SiteWalletProvider } from "@/lib/wallet-provider";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Send feedback | Seametry",
  description: "Tell the Seametry team what happened or what should change. No account is needed.",
};

export default function FeedbackPage() {
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Contact</span>
          <h1>Send feedback</h1>
          <p>It goes straight to the team&apos;s inbox. No account is needed, and nothing else is required.</p>
        </header>
        <SiteWalletProvider>
          <FeedbackForm />
        </SiteWalletProvider>
      </article>
    </PublicShell>
  );
}
