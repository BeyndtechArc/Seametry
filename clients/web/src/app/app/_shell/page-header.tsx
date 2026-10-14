import type { ReactNode } from "react";
import { InfoNote } from "@seametry/ui";
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

/**
 * components.md, Page header: the page's one title with an optional Info
 * note, the network, and optional quiet links. The product tabs already name
 * the page's group, so the header does not repeat it, and no section below
 * restates the title.
 */
export function PageHeader({
  title,
  titleId,
  info,
  network,
  tabs,
  children,
}: {
  title: string;
  titleId?: string;
  /** What the page holds or assumes, behind an Info note beside the title. */
  info?: ReactNode;
  network: Network;
  /** The page's view Tabs, drawn as the header's bottom edge so one rule closes both. */
  tabs?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader} data-tabs={tabs ? "" : undefined}>
      <div className={styles.titleLine}>
        <div className={styles.titleRow}>
          <h1 id={titleId}>{title}</h1>
          {info ? <InfoNote label={`About ${title}`}>{info}</InfoNote> : null}
        </div>
      </div>
      <NetworkBadge network={network} />
      {children ? <div className={styles.links}>{children}</div> : null}
      {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
    </header>
  );
}
