"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { QuietAction } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import styles from "./site.module.css";

function middle(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * components.md, Wallet state. A native disclosure, so opening it by
 * keyboard and announcing it need no script of this component's own.
 * Connecting signs nothing and moves nothing, so it is never a Key.
 */
export function WalletState() {
  const { publicKey, connected, connecting, wallets, select, disconnect } = useWallet();
  const address = publicKey?.toBase58();

  return (
    <details className={styles.walletState}>
      <summary data-connected={connected || undefined}>
        <span className={styles.walletIcon}><Icon name="wallet" /></span>
        {connecting ? "Connecting" : connected && address ? <span aria-label={`Wallet ${address}`}>{middle(address)}</span> : "Connect wallet"}
      </summary>
      <div className={styles.walletPanel}>
        {connected && address ? (
          <>
            <code>{address}</code>
            <QuietAction icon="wallet" onClick={() => void disconnect()}>Disconnect wallet</QuietAction>
          </>
        ) : wallets.length === 0 ? (
          <p>No wallet was detected in this browser. On a phone, open this site inside your wallet&apos;s own browser.</p>
        ) : (
          wallets.map((wallet) => (
            <QuietAction icon="wallet" key={wallet.adapter.name} disabled={connecting} onClick={() => select(wallet.adapter.name)}>
              Connect {wallet.adapter.name}
            </QuietAction>
          ))
        )}
      </div>
    </details>
  );
}
