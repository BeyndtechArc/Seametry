import "server-only";

import { senderEndpoint } from "./sender";

export type AllocationConfig = {
  jupiterApiKey: string;
  mainnetRpcUrl: string;
  approvalSecret: string;
  blockedCountries: string | undefined;
  /** The wallet whose USDC account receives the routing fee. */
  feeWallet: string;
  /**
   * Helius Sender's endpoint for the RPC's own API key, which lifts Sender's
   * rate limit from one send a second to fifty (helius.dev Sender docs, 14
   * October 2026); HELIUS_SENDER_URL overrides it. Absent when the RPC is not
   * a keyed Helius URL, and then every leg is built by Jupiter's /swap and
   * sent through the RPC.
   */
  senderUrl?: string;
};

/**
 * Every variable the Allocation needs, named when absent so deployment checks
 * can identify the missing setup without exposing it in the visitor interface.
 * ALLOCATION_BLOCKED_COUNTRIES is read but not required here: its absence is
 * the country gate's to refuse, with its own reason.
 */
export function allocationConfig(): { config: AllocationConfig } | { missing: string[] } {
  const required = {
    JUPITER_API_KEY: process.env.JUPITER_API_KEY?.trim(),
    MAINNET_RPC_URL: process.env.MAINNET_RPC_URL?.trim(),
    ALLOCATION_APPROVAL_SECRET: process.env.ALLOCATION_APPROVAL_SECRET?.trim(),
    // Required, not optional: an Allocation without its routing fee would be
    // an unannounced free tier, so a missing fee wallet keeps it unavailable.
    ALLOCATION_FEE_WALLET: process.env.ALLOCATION_FEE_WALLET?.trim(),
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) return { missing };
  return {
    config: {
      jupiterApiKey: required.JUPITER_API_KEY!,
      mainnetRpcUrl: required.MAINNET_RPC_URL!,
      approvalSecret: required.ALLOCATION_APPROVAL_SECRET!,
      blockedCountries: process.env.ALLOCATION_BLOCKED_COUNTRIES,
      feeWallet: required.ALLOCATION_FEE_WALLET!,
      senderUrl: senderEndpoint(required.MAINNET_RPC_URL!, process.env.HELIUS_SENDER_URL),
    },
  };
}

/**
 * The requesting client's country, as the host reports it. Vercel sets
 * x-vercel-ip-country and overwrites any value a client sends, which is the
 * only reason it can be trusted; on any other host a client could forge it.
 * ALLOCATION_ASSUME_COUNTRY stands in only when the header is absent, which
 * is a local run, never a deployment on Vercel.
 */
export function requestCountry(headers: Headers): string | null {
  return headers.get("x-vercel-ip-country") ?? process.env.ALLOCATION_ASSUME_COUNTRY ?? null;
}
