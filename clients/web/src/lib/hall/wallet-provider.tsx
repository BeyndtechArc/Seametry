"use client";

import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { DEVNET_RPC_ENDPOINT } from "./constants";

/**
 * Points the Hall demo at devnet. The wallet itself comes from the site-wide
 * SiteWalletProvider in the root layout, so connecting here also shows as
 * connected in the house rail.
 */
export function HallDemoWalletProvider({ children }: { children: React.ReactNode }) {
  return <ConnectionProvider endpoint={DEVNET_RPC_ENDPOINT}>{children}</ConnectionProvider>;
}
