import "server-only";

import { Refusal } from "./refusal";
import { slidingWindow } from "./request-window";

// The Jupiter base the Go liquidity client uses (server/internal/liquidity/jupiter.go).
// JUPITER_API_URL points the tests at the local fixture, so no test run
// depends on mainnet liquidity or on the network at all.
function base() {
  return process.env.JUPITER_API_URL?.trim() || "https://api.jup.ag/swap/v1";
}

// The free plan as measured on this deployment's key, 15 October 2026: ten
// requests sent at once all passed, the eleventh was refused, and its
// x-ratelimit-reset named the second ten seconds after the oldest. The docs
// call this one a second, sixty a minute, counted per organisation rather
// than per key (developers.jup.ag/docs/portal/rate-limits). Every call from
// this server instance takes the next slot in that window, so a basket's
// calls go ten at once and then one a second instead of bursting into 429s;
// the quarter second is margin against the two clocks disagreeing. It paces
// one instance only: another instance, a local server on the same key, or
// the daily route sample can still take slots, which the wait below absorbs.
const nextSlot = slidingWindow(10, 10_250);

function paced() {
  const now = Date.now();
  return new Promise((resolve) => setTimeout(resolve, nextSlot(now) - now));
}

// A 429 is the plan's limit, not a market fact, so it is waited out while the
// wait is short, and otherwise reported with how long it has left.
const RATE_LIMIT_RETRIES = 3;
const LONGEST_WAIT_MS = 11_000;

/** Jupiter's x-ratelimit-reset is the second a slot opens; Retry-After is what the test fixture sends. */
function rateLimitWaitMs(headers: Headers, now: number): number {
  const reset = Number.parseInt(headers.get("x-ratelimit-reset") ?? "", 10);
  if (!Number.isNaN(reset)) return Math.max(0, reset * 1_000 - now) + 250;
  const seconds = Number.parseInt(headers.get("retry-after") ?? "", 10);
  return Number.isNaN(seconds) ? 1_000 : seconds * 1_000;
}

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

export async function jupiter<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await paced();
    const response = await fetch(`${base()}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (response.status === 429) {
      const wait = rateLimitWaitMs(response.headers, Date.now());
      if (attempt < RATE_LIMIT_RETRIES && wait <= LONGEST_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      throw new JupiterRefusal(429, undefined, `Jupiter is limiting how often Seametry may ask for routes; a request frees up in ${Math.ceil(wait / 1_000)}s. Nothing was signed or sent.`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      const code = /"errorCode"\s*:\s*"([A-Z_]+)"/.exec(detail)?.[1];
      throw new JupiterRefusal(response.status, code, `Jupiter answered ${response.status} for ${path.split("?")[0]}: ${detail}`);
    }
    return (await response.json()) as T;
  }
}
