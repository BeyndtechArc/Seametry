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

/** components.md, Page header: group, title with an optional Info note, one sentence at most, the network, and optional quiet links. */
export function PageHeader({
  group,
  title,
  titleId,
  sentence,
  info,
  network,
  children,
}: {
  group: string;
  title: string;
  titleId?: string;
  sentence?: string;
  /** The page's terms, behind an Info note beside the title. */
  info?: ReactNode;
  network: Network;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.titleLine}>
        <span>{group}</span>
        <div className={styles.titleRow}>
          <h1 id={titleId}>{title}</h1>
          {info ? <InfoNote label={`About ${title}`}>{info}</InfoNote> : null}
        </div>
      </div>
      <NetworkBadge network={network} />
      {sentence ? <p>{sentence}</p> : null}
      {children ? <div className={styles.links}>{children}</div> : null}
    </header>
  );
}
