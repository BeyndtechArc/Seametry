import type { Metadata } from "next";
import { PageHeader } from "../_shell/page-header";
import { Positions } from "./positions";
import styles from "./positions.module.css";

export const metadata: Metadata = {
  title: "Holdings | Seametry",
  description: "Read the listed instruments held by your connected wallet and review a mainnet exit quote.",
};

export default function PositionsPage() {
  return (
    <div className={styles.page}>
      <PageHeader group="Allocation" title="Your holdings" network="Mainnet" info={<p>These quantities are read from your connected wallet on mainnet. A sale is a separate swap into USDC, not an Alloy Melt or an issuer redemption.</p>} />
      <Positions />
    </div>
  );
}
