import type { ExecutableQuote } from "@seametry/domain";

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string;
  routePlan?: Array<{ swapInfo?: { label?: string } }>;
  error?: string;
}

export async function fetchJupiterQuote(inputMint: string, outputMint: string, amount: string): Promise<ExecutableQuote> {
  const query = new URLSearchParams({ inputMint, outputMint, amount, slippageBps: "50", restrictIntermediateTokens: "true" });
  const response = await fetch(`https://lite-api.jup.ag/swap/v1/quote?${query}`);
  const body = await response.json() as JupiterQuoteResponse;
  if (!response.ok || body.error || !body.outAmount) throw new Error(body.error ?? `Jupiter quote: HTTP ${response.status}`);
  return {
    inputMint: body.inputMint,
    outputMint: body.outputMint,
    inputAmount: body.inAmount,
    outputAmount: body.outAmount,
    minimumOutputAmount: body.otherAmountThreshold,
    priceImpactPct: body.priceImpactPct === undefined ? undefined : Number(body.priceImpactPct),
    routeLabels: [...new Set((body.routePlan ?? []).flatMap((step) => step.swapInfo?.label ? [step.swapInfo.label] : []))],
    fetchedAt: new Date().toISOString()
  };
}
