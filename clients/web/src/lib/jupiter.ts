import "server-only";

import { Refusal } from "./refusal";

// The Jupiter base the Go liquidity client uses (server/internal/liquidity/jupiter.go).
// JUPITER_API_URL points the tests at the local fixture, so no test run
// depends on mainnet liquidity or on the network at all.
function base() {
  return process.env.JUPITER_API_URL?.trim() || "https://api.jup.ag/swap/v1";
}

// The free plan allows one request a second and answers 429 with a
// retry-after header (developers.jup.ag/docs/portal/rate-limits). A 429 is
// the plan's limit, not a market fact, so it is waited out a bounded number of
// times before it is reported as what it is.
const RATE_LIMIT_RETRIES = 2;
const LONGEST_WAIT_MS = 3_000;

export type JupiterQuote = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  contextSlot: number;
  routePlan: { swapInfo: { label: string } }[];
};

/** Jupiter refused, with its own HTTP status and error code kept so a caller can say which kind of refusal it was. */
export class JupiterRefusal extends Refusal {
  constructor(
    readonly upstream: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(502, message);
  }
}

function waitFor(retryAfter: string | null) {
  const seconds = Number.parseInt(retryAfter ?? "", 10);
  const ms = Number.isNaN(seconds) ? 1_000 : Math.min(seconds * 1_000, LONGEST_WAIT_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function jupiter<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base()}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
      await waitFor(response.headers.get("retry-after"));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      const code = /"errorCode"\s*:\s*"([A-Z_]+)"/.exec(detail)?.[1];
      throw new JupiterRefusal(response.status, code, `Jupiter answered ${response.status} for ${path.split("?")[0]}: ${detail}`);
    }
    return (await response.json()) as T;
  }
}
