import type { SourceObservation } from "@seametry/domain";

export function chainlinkCoverage(symbol: string, env: NodeJS.ProcessEnv = process.env): SourceObservation {
  const configured = parseMap(env.CHAINLINK_FEED_IDS_JSON);
  if (!env.CHAINLINK_DATA_STREAMS_CLIENT_ID || !env.CHAINLINK_DATA_STREAMS_CLIENT_SECRET) {
    return {
      source: "chainlink",
      state: "blocked-by-credentials",
      observedAt: new Date().toISOString(),
      note: configured[symbol]
        ? `Feed ID configured for ${symbol}; credentials required for a live report.`
        : "No feed ID asserted. Data Streams access is authenticated, so public absence is not treated as unsupported."
    };
  }
  return {
    source: "chainlink",
    state: configured[symbol] ? "configured" : "unavailable",
    observedAt: new Date().toISOString(),
    note: configured[symbol] ? `Configured feed ${configured[symbol]}; it is not live until report fetch and verification pass.` : "Credentials exist, but no explicit feed mapping was supplied."
  };
}

function parseMap(value?: string): Record<string, string> {
  if (!value) return {};
  try { return JSON.parse(value) as Record<string, string>; } catch { throw new Error("CHAINLINK_FEED_IDS_JSON must be a JSON object"); }
}
