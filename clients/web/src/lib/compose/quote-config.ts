import "server-only";

/**
 * The Jupiter key Compose quotes with, or the reason it cannot quote. The page
 * reads this while it renders, so an unconfigured deployment states the reason
 * at once instead of sending a browser request that can only answer 503.
 */
export function quoteKey(): { apiKey: string } | { problem: string } {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  return apiKey ? { apiKey } : { problem: "This deployment cannot quote constituents: JUPITER_API_KEY is not set." };
}
