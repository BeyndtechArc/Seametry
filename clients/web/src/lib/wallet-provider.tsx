"use client";

import { useMemo } from "react";
import { WalletProvider } from "@solana/wallet-adapter-react";

/**
 * One wallet session for the whole site, so the house rail and every page
 * agree on whether a wallet is connected. Each page that talks to a cluster
 * supplies its own ConnectionProvider inside this one (the Hall demo on
 * devnet); the Allocation sends through this app's own route handlers and
 * needs none in the browser.
 *
 * No adapters are listed: @solana/wallet-adapter-react detects any Wallet
 * Standard wallet (Phantom, Solflare, Backpack and the rest), which injects
 * no script of its own and so needs no change to proxy.ts's script-src.
 * autoConnect reconnects only a wallet the holder already approved here.
 */
export function SiteWalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <WalletProvider wallets={wallets} autoConnect>
      {children}
    </WalletProvider>
  );
}
