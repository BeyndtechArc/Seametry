import { HallLineLive } from "./live";
import styles from "./line.module.css";

/** The landing hero: the Hall as an assay line, its story told from four camera stations in turn. */
export function HallLine() {
  return (
    <figure className={styles.line} aria-label="The Hall's assay line">
      <HallLineLive />
    </figure>
  );
}
