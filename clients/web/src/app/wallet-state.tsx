"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
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
  const { publicKey, connected, connecting, wallets, wallet, select, connect, disconnect } = useWallet();
  const [connectionError, setConnectionError] = useState<string>();
  const attempted = useRef<WalletName | null>(null);
  const address = publicKey?.toBase58();

  useEffect(() => {
    if (!wallet) {
      attempted.current = null;
      return;
    }
    if (connected || connecting || attempted.current === wallet.adapter.name) return;
    attempted.current = wallet.adapter.name;
    setConnectionError(undefined);
    void connect().catch((error: unknown) => {
      setConnectionError(error instanceof Error ? error.message : "The wallet did not complete the connection.");
    });
  }, [connect, connected, connecting, wallet]);

  const choose = (name: WalletName) => {
    attempted.current = null;
    setConnectionError(undefined);
    select(name);
  };

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
          <p>No wallet was detected in this browser. Open the site in a browser with a Solana wallet extension, or use your wallet&apos;s browser on a phone.</p>
        ) : (
          wallets.map((wallet) => (
            <QuietAction icon="wallet" key={wallet.adapter.name} disabled={connecting} onClick={() => choose(wallet.adapter.name)}>
              Connect {wallet.adapter.name}
            </QuietAction>
          ))
        )}
        {connectionError ? <p role="alert">Connection was not completed: {connectionError}</p> : null}
      </div>
    </details>
  );
}
