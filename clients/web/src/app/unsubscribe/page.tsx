import type { Metadata } from "next";
import { PublicShell } from "../public-shell";
import styles from "../site.module.css";
import { UnsubscribeControl } from "./unsubscribe-control";

export const metadata: Metadata = {
  title: "Unsubscribe | Seametry",
  description: "Stop Seametry's launch and settlement emails and erase the address.",
  robots: { index: false },
};

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return (
    <PublicShell>
      <article className={styles.paper}>
        <header className={styles.storyHero}>
          <span>Email</span>
          <h1>Unsubscribe</h1>
          <p>Stop the Hall launch and settlement emails. The address is erased, not only marked; only the dates consent was given and withdrawn are kept.</p>
        </header>
        <UnsubscribeControl token={typeof token === "string" ? token : undefined} />
      </article>
    </PublicShell>
  );
}
