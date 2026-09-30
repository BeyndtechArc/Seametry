import { connection } from "next/server";
import { RouteAction, TextAction } from "@seametry/ui";
import { PublicShell } from "./public-shell";
import styles from "./site.module.css";

export default async function NotFound() {
  await connection();
  return (
    <PublicShell>
      <header className={styles.storyHero}>
        <span>Route register</span>
        <h1>That route is not in the register.</h1>
        <p>The address does not match a public Seametry surface. Choose the public overview or enter the Terminal.</p>
        <div className={styles.heroActions}>
          <RouteAction href="/">Open the overview</RouteAction>
          <TextAction href="/app">Open the app</TextAction>
        </div>
      </header>
    </PublicShell>
  );
}
