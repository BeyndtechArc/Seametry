import type { ExecutableQuote, Instrument, PreflightResult, RiskFlag, SourceObservation } from "@seametry/domain";

export interface PreflightInput {
  instrument: Instrument;
  observations: SourceObservation[];
  quote?: ExecutableQuote;
  now?: Date;
  maxQuoteAgeMs?: number;
  maxPriceImpactPct?: number;
  maxReferenceDivergencePct?: number;
}

export function derivePreflight(input: PreflightInput): PreflightResult {
  const now = input.now ?? new Date();
  const flags = new Set<RiskFlag>();
  const issuer = input.observations.find((item) => item.source === "issuer");
  const references = input.observations.filter((item) => item.source === "chainlink" || item.source === "stork");

  if (issuer?.state === "halted") flags.add("issuer-halt");
  if (issuer?.state === "closed") flags.add("reference-closed");

  const liveReferences = references.filter((item) => item.state === "live" && item.price !== undefined);
  if (liveReferences.length === 0) flags.add("reference-missing");
  if (liveReferences.length > 1) {
    const prices = liveReferences.map((item) => item.price as number);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const divergence = ((high - low) / low) * 100;
    if (divergence > (input.maxReferenceDivergencePct ?? 0.5)) flags.add("reference-divergence");
  }

  if (input.quote) {
    const age = now.getTime() - new Date(input.quote.fetchedAt).getTime();
    if (age > (input.maxQuoteAgeMs ?? 15_000)) flags.add("quote-expired");
    if ((input.quote.priceImpactPct ?? 0) > (input.maxPriceImpactPct ?? 1)) flags.add("thin-route");
  }

  const hardBlock = flags.has("issuer-halt") || flags.has("quote-expired");
  const status = hardBlock ? "blocked" : flags.size > 0 ? "caution" : "clear";
  const explanation = flags.size === 0
    ? "Issuer state, independent references, and the executable route agree within policy."
    : `Preflight found: ${[...flags].join(", ")}. This is market-state disclosure, not a trading recommendation.`;

  return {
    instrument: input.instrument,
    status,
    flags: [...flags],
    observations: input.observations,
    quote: input.quote,
    explanation,
    generatedAt: now.toISOString()
  };
}
