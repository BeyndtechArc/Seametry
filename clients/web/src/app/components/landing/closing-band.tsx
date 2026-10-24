import { QuietLink, RouteAction } from "@seametry/ui";
import styles from "./landing.module.css";

/** components.md, Closing band: the hero's two actions again, under one line. */
export function ClosingBand() {
  return (
    <section className={styles.closing} aria-labelledby="closing-title">
      <h2 id="closing-title">Strike, Melt and read every leg <span>for yourself.</span></h2>
      <div>
        <RouteAction href="/app">Open app</RouteAction>
        <QuietLink href="/docs/how-it-works" icon="arrow-up-right">Read mechanism</QuietLink>
      </div>
    </section>
  );
}
