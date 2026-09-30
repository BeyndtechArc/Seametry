import type { ReactNode } from "react";
import styles from "./page-header.module.css";

export type Network = "Mainnet" | "Devnet" | "Mainnet evidence";

/** components.md, Network badge: which cluster this page reads or writes. Never green: a statement, not an action. */
export function NetworkBadge({ network }: { network: Network }) {
  return (
    <strong className={styles.network} data-network={network === "Devnet" ? "devnet" : "mainnet"}>
      {network}
    </strong>
  );
}

/** components.md, Page header: group, title, one sentence at most, the network, and optional quiet links. */
export function PageHeader({
  group,
  title,
  titleId,
  sentence,
  network,
  children,
}: {
  group: string;
  title: string;
  titleId?: string;
  sentence?: string;
  network: Network;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.titleLine}>
        <span>{group}</span>
        <h1 id={titleId}>{title}</h1>
      </div>
      <NetworkBadge network={network} />
      {sentence ? <p>{sentence}</p> : null}
      {children ? <div className={styles.links}>{children}</div> : null}
    </header>
  );
}
