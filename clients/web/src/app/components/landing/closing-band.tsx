import { QuietLink, RouteAction } from "@seametry/ui";
import { ClosingDrawing } from "./drawings";
import { founded } from "./founding";
import styles from "./landing.module.css";

/**
 * components.md, Closing band: the hero's two actions again, under one
 * line, beside the opened Alloy's orbit drawn small and without words, so
 * the page closes on the object it opened.
 */
export function ClosingBand() {
  const alloy = founded();
  return (
    <section className={styles.closing} aria-labelledby="closing-title">
      <div className={styles.closingText}>
        <h2 id="closing-title">Strike, Melt and read every leg <span>for yourself.</span></h2>
        <div>
          <RouteAction href="/app">Open app</RouteAction>
          <QuietLink href="/docs/how-it-works" icon="arrow-up-right">Read mechanism</QuietLink>
        </div>
      </div>
      {alloy ? <ClosingDrawing legs={alloy.legs} artwork={alloy.artwork} /> : null}
    </section>
  );
}
