import { founded } from "../drawn/founding";
import { HallBench } from "./hall-bench";
import styles from "./hall-bench.module.css";

/** components.md, Hall bench: the footer's scene under its one line; the bench's own status says what to try. */
export function FooterScene() {
  const alloy = founded();
  if (!alloy) return null;
  return (
    <section className={styles.footerScene} aria-labelledby="bench-title">
      <h2 id="bench-title" className={styles.footerTitle}>Work the Hall <span>by hand.</span></h2>
      <HallBench legs={alloy.legs.map((leg) => ({ symbol: leg.symbol, logo: leg.logo }))} symbol={alloy.symbol} artwork={alloy.artwork} />
    </section>
  );
}
