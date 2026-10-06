"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { WalletError } from "@solana/wallet-adapter-base";
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
 *
 * The provider connects, not WalletState. When WalletState called connect
 * from its own effect, a wallet that already trusted the site (Phantom, once
 * approved) connected synchronously inside that child effect, before the
 * provider's effect had subscribed to the new adapter, so its connect event
 * was lost: the wallet was connected and the header said "Log in" until a
 * reload. autoConnect runs in the provider after it subscribes, opens the
 * wallet's prompt after a deliberate selection, and reconnects silently on
 * reload without prompting.
 */
// The Hall, the Alloy register and Compose's founding all run on devnet, so
// a wallet there is shown its devnet balances; Allocation trades on mainnet.
const DEVNET_ROUTES = ["/app/hall", "/app/alloys", "/app/compose"];

export function walletNetwork(pathname: string): "devnet" | "mainnet" {
  return DEVNET_ROUTES.some((route) => pathname.startsWith(route)) ? "devnet" : "mainnet";
}

type ConnectionFailure = { failure?: string; clear: () => void };
const ConnectionFailureContext = createContext<ConnectionFailure>({ clear: () => {} });

/** The last error the wallet raised, for WalletState to show after a deliberate choice. */
export function useWalletFailure() {
  return useContext(ConnectionFailureContext);
}

export function SiteWalletProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallets = useMemo(() => [], []);
  const [failure, setFailure] = useState<string>();
  const onError = useCallback((error: WalletError) => setFailure(error.message || error.name), []);
  const clear = useCallback(() => setFailure(undefined), []);
  const failureValue = useMemo(() => ({ failure, clear }), [failure, clear]);
  const endpoint = walletNetwork(pathname) === "devnet"
    ? process.env.NEXT_PUBLIC_HALL_DEMO_RPC ?? clusterApiUrl("devnet")
    : clusterApiUrl("mainnet-beta");
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <ConnectionFailureContext.Provider value={failureValue}>{children}</ConnectionFailureContext.Provider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
