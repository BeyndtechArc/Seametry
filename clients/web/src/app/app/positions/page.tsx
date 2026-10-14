import type { Metadata } from "next";
import { Positions } from "./positions";
import styles from "./positions.module.css";

export const metadata: Metadata = {
  title: "Holdings | Seametry",
  description: "Read the listed instruments held by your connected wallet and review a mainnet exit quote.",
};

export default function PositionsPage() {
  return (
    <div className={styles.page}>
      <Positions />
    </div>
  );
}
