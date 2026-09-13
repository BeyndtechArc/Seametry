import type { Instrument, SourceObservation } from "@seametry/domain";

const BASE_URL = "https://api.xstocks.fi/api/v2/public";

interface XStocksAssetResponse {
  symbol: string;
  underlyingSymbol: string;
  isTradingHalted: boolean;
  trading?: { currentPeriod?: string; openNow?: boolean; nextChangeAt?: string; isTradingHalted?: boolean };
  deployments?: Array<{ network: string; address: string; decimals?: number }>;
}

export async function fetchXStocksAsset(symbol: string): Promise<{ instrument: Instrument; observation: SourceObservation; nextChangeAt?: string }> {
  const response = await fetch(`${BASE_URL}/assets/${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`xStocks ${symbol}: HTTP ${response.status}`);
  const asset = await response.json() as XStocksAssetResponse;
  const deployment = asset.deployments?.find((item) => item.network.toLowerCase() === "solana");
  if (!deployment) throw new Error(`xStocks ${symbol}: no Solana deployment`);
  const halted = asset.isTradingHalted || asset.trading?.isTradingHalted;
  const state = halted ? "halted" : asset.trading?.openNow ? "live" : "closed";
  return {
    instrument: {
      symbol: asset.symbol,
      underlying: asset.underlyingSymbol,
      mint: deployment.address,
      decimals: deployment.decimals ?? 8
    },
    observation: {
      source: "issuer",
      state,
      observedAt: new Date().toISOString(),
      note: asset.trading?.currentPeriod ? `Issuer period: ${asset.trading.currentPeriod}` : undefined
    },
    nextChangeAt: asset.trading?.nextChangeAt
  };
}
