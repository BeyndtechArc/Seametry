import Link from "next/link";
import styles from "./baskets.module.css";

export function BasketSectionNav({ current }: { current: "baskets" | "build" }) {
  return (
    <nav className={styles.sectionSwitch} aria-label="Basket view">
      <Link href="/app/baskets" aria-current={current === "baskets" ? "page" : undefined}>Baskets</Link>
      <Link href="/app/baskets/build" aria-current={current === "build" ? "page" : undefined}>Build a basket</Link>
    </nav>
  );
}
