import "server-only";

import { Refusal } from "./refusal";

// The Jupiter base the Go liquidity client uses (server/internal/liquidity/jupiter.go).
// JUPITER_API_URL points the tests at the local fixture, so no test run
// depends on mainnet liquidity or on the network at all.
function base() {
  return process.env.JUPITER_API_URL?.trim() || "https://api.jup.ag/swap/v1";
}

export type JupiterQuote = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  contextSlot: number;
  routePlan: { swapInfo: { label: string } }[];
};

export async function jupiter<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: { "x-api-key": apiKey, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Refusal(502, `Jupiter answered ${response.status} for ${path.split("?")[0]}: ${detail}`);
  }
  return (await response.json()) as T;
}
