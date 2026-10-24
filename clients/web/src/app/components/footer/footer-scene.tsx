import { founded } from "../drawn/founding";
import { HallBench } from "./hall-bench";
import styles from "./hall-bench.module.css";

/** components.md, Hall bench: the footer's scene, with one line saying what it answers to. */
export function FooterScene() {
  const alloy = founded();
  if (!alloy) return null;
  return (
    <section className={styles.footerScene} aria-labelledby="bench-title">
      <div className={styles.footerIntro}>
        <h2 id="bench-title">Work the Hall <span>by hand.</span></h2>
        <p>A model that keeps the Hall&apos;s rules. Tap a stock to Strike a share, the share to Melt it, and the lock to freeze one leg.</p>
      </div>
      <HallBench legs={alloy.legs.map((leg) => ({ symbol: leg.symbol, logo: leg.logo }))} symbol={alloy.symbol} artwork={alloy.artwork} />
    </section>
  );
}
