// Kept free of any Solana or Next import so tests/hall-demo-limits.spec.ts can
// exercise it directly, without a build, a wallet or a devnet round trip.

/**
 * chain/programs/hall/src/state.rs: `space = 8 + Claim::INIT_SPACE` on
 * redeem's `init_if_needed`, where Claim is alloy (32), owner (32), bump (1)
 * and MAX_CONSTITUENTS (12) ClaimEntry of units u64, index u128, epoch u64.
 * redeem makes the caller pay this rent, so a visitor's wallet must hold it.
 */
export const CLAIM_ACCOUNT_SPACE = 8 + 32 + 32 + 1 + 12 * (8 + 16 + 8);

/**
 * The transactions the connected wallet signs itself in flow.tsx: create,
 * redeem, and three withdraw attempts (leg A refused while frozen, leg B,
 * leg A again after the thaw). Everything else the funder signs.
 */
export const HOLDER_SIGNED_TRANSACTIONS = 5n;

/**
 * Per transaction, in lamports. The protocol's base fee is 5,000 per
 * signature; the rest is headroom for a priority fee some wallets add on
 * their own, which this page does not control. An assumption, not a
 * measurement: raise it if a devnet run shows a wallet asking for more.
 */
export const HOLDER_FEE_ALLOWANCE_LAMPORTS = 100_000n;

/**
 * Lamports to send a visitor so the whole flow can complete, or zero when
 * the wallet already holds enough. Tops up to the target, never beyond it,
 * so a wallet that returns for a second alloy costs the funder only what it
 * spent on the first.
 */
export function holderTopUp(holderBalance: bigint, claimRent: bigint): bigint {
  const target = claimRent + HOLDER_SIGNED_TRANSACTIONS * HOLDER_FEE_ALLOWANCE_LAMPORTS;
  return holderBalance >= target ? 0n : target - holderBalance;
}

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
export class FoundingThrottle {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = FOUNDINGS_PER_WINDOW,
    private readonly windowMs = FOUNDING_WINDOW_MS,
  ) {}

  /** Milliseconds until `client` may found again, or zero when it may now. */
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
