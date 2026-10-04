"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * One wallet session for the whole site, so the house rail and every page
 * agree on whether a wallet is connected. The route selects devnet for the
 * Hall demo and mainnet for the rest of the application, which also gives the
 * mobile wallet adapter the cluster it must announce.
 *
 * No adapters are listed: @solana/wallet-adapter-react detects any Wallet
 * Standard wallet (Phantom, Solflare, Backpack and the rest), which injects
 * no script of its own and so needs no change to proxy.ts's script-src.
 * WalletState performs the connection after a deliberate selection and also
 * reconnects the stored selection on reload, with connection failures shown.
 */
export function walletNetwork(pathname: string): "devnet" | "mainnet" {
  return pathname.startsWith("/app/hall") ? "devnet" : "mainnet";
}

export function SiteWalletProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallets = useMemo(() => [], []);
  const endpoint = walletNetwork(pathname) === "devnet"
    ? process.env.NEXT_PUBLIC_HALL_DEMO_RPC ?? clusterApiUrl("devnet")
    : clusterApiUrl("mainnet-beta");
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
