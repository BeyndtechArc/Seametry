// Kept free of any Solana or Next import so tests/limits.spec.ts can exercise
// it directly, without a build, a wallet or a devnet round trip.

/**
 * Foundings allowed per client address per window. Founding spends the
 * funder's devnet SOL on rent for two mints, an alloy and five token
 * accounts, and the route is public, so without a bound one script empties
 * the funder before a presenter clicks.
 */
export const FOUNDINGS_PER_WINDOW = 5;
export const FOUNDING_WINDOW_MS = 60 * 60 * 1000;

/**
 * A fixed-window counter held in process memory. On a serverless host each
 * warm instance keeps its own map and a cold start empties it, so this bounds
 * a single client hammering one instance, not a determined attacker spread
 * across many; that would need shared storage this app does not have yet.
 */
export class WindowThrottle {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = FOUNDINGS_PER_WINDOW,
    private readonly windowMs = FOUNDING_WINDOW_MS,
  ) {}

  /** Milliseconds until `client` may act again, or zero when it may now. */
  retryAfter(client: string, now: number): number {
    const current = this.windows.get(client);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(client, { start: now, count: 1 });
      return 0;
    }
    if (current.count < this.limit) {
      current.count += 1;
      return 0;
    }
    return current.start + this.windowMs - now;
  }
}

/**
 * The first address in x-forwarded-for, which the host sets to the client it
 * accepted the connection from. NextRequest.ip was removed in Next 15.
 * Requests with no such header share one bucket rather than going unbounded.
 */
export function clientAddress(forwardedFor: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first ? first : "unknown";
}
