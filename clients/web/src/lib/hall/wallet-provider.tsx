"use client";

/**
 * The site-wide provider follows the route and points Hall at devnet. This
 * boundary remains so Hall call sites keep stating that the demo owns the
 * cluster choice, while the wallet session stays shared with the house rail.
 */
export function HallDemoWalletProvider({ children }: { children: React.ReactNode }) {
  return children;
}
