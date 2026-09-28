"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { DEVNET_RPC_ENDPOINT } from "./constants";

/**
 * No wallet adapters are listed: @solana/wallet-adapter-react auto-detects
 * any Wallet Standard compliant extension (Phantom, Solflare, Backpack and
 * the rest all implement it), which needs no injected script of its own and
 * so needs no change to proxy.ts's script-src.
 */
export function HallDemoWalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={DEVNET_RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
