import "server-only";

import { admissions, isAdmitted } from "../allocation/admissions";
import { SLIPPAGE_BPS, USDC_MINT } from "../allocation/rules";
import { jupiter, type JupiterQuote } from "../jupiter";
import { ROUTE_SAMPLE_USDC_ATOMS, utcDay, type RouteObservation } from "./route-observations";

/**
 * Server-owned read-only sampler.
 *
 * No wallet signing, no mainnet transaction, no swaps, no oracle and no
 * conversion from a liquidity pool's raw reserves into a fictitious USD price.
 * Jupiter is asked what 25 USDC would purchase, including its route.
 */
export async function sampleAdmittedRoutes(apiKey: string): Promise<{
  observations: RouteObservation[];
  attempted: number;
  refused: { symbol: string; reason: string }[];
}> {
  const lots = admissions.instruments.filter((lot) =>
    isAdmitted(lot) && lot.capacity_usdc >= Number(ROUTE_SAMPLE_USDC_ATOMS) / 1_000_000,
  );
  const observations: RouteObservation[] = [];
  const refused: { symbol: string; reason: string }[] = [];

  // Deliberately sequential. The Jupiter client already paces requests
  // across this server instance; parallel capture only aggravates 429s.
  for (const lot of lots) {
    const mint = lot.instrument.mint;
    const symbol = lot.instrument.symbol ?? mint;
    const params = new URLSearchParams({
      inputMint: USDC_MINT,
      outputMint: mint,
      amount: ROUTE_SAMPLE_USDC_ATOMS.toString(),
      slippageBps: String(SLIPPAGE_BPS),
      instructionVersion: "V2",
    });
    try {
      const quote = await jupiter<JupiterQuote>(apiKey, "/quote?" + params);
      if (
        quote.inAmount !== ROUTE_SAMPLE_USDC_ATOMS.toString() ||
        !/^\d+$/.test(quote.outAmount) ||
        BigInt(quote.outAmount) <= 0n ||
        !Number.isInteger(quote.contextSlot) ||
        quote.contextSlot <= 0
      ) throw new Error("The route returned no usable fixed-size quote.");

      const now = new Date();
      observations.push({
        schema: "seametry-route-observation-v1",
        mint,
        symbol,
        sampledAt: now.toISOString(),
        utcDay: utcDay(now),
        inputUsdcAtoms: quote.inAmount,
        outputTokenAtoms: quote.outAmount,
        decimals: lot.decimals,
        contextSlot: quote.contextSlot,
        route: quote.routePlan.map((step) => step.swapInfo.label).slice(0, 12),
        issuer: lot.issuer,
        admissionDigest: lot.capacity_decision.input_digest,
      });
    } catch (error) {
      refused.push({
        symbol,
        reason: error instanceof Error ? error.message.slice(0, 180) : "The route could not be observed.",
      });
    }
  }

  return { observations, attempted: lots.length, refused };
}
