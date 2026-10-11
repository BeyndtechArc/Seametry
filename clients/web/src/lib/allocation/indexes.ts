export type AllocationIndexMember = {
  /** Symbol as it appears in Seametry's admissions register. */
  symbol: string;
  /** Underlying public-equity ticker used only for reference market data. */
  oracleTicker: string;
};

export type AllocationIndex = {
  id: string;
  name: string;
  industry: string;
  description: string;
  members: AllocationIndexMember[];
  weighting: "equal";
  methodologyVersion: string;
  review: string;
  driftBandPp: number;
  illustration: "wafer" | "platform" | "signal";
};

/**
 * Published-rule Allocation indexes.
 *
 * These are direct-wallet Allocations, not Alloy share tokens. Membership is
 * constrained to instruments already admitted by Seametry. Equal weighting is
 * intentionally used first because it is deterministic, inspectable and does
 * not require market-cap data to execute.
 */
export const allocationIndexes: readonly AllocationIndex[] = [
  {
    id: "semiconductor-compute-ew",
    name: "Semiconductor & Compute EW",
    industry: "Semiconductors",
    description: "Design, foundry, memory and compute exposure across admitted tokenized equities.",
    members: [
      { symbol: "NVDAx", oracleTicker: "NVDA" },
      { symbol: "AMD", oracleTicker: "AMD" },
      { symbol: "MU", oracleTicker: "MU" },
      { symbol: "TSMx", oracleTicker: "TSM" },
      { symbol: "AVGOx", oracleTicker: "AVGO" },
      { symbol: "INTC", oracleTicker: "INTC" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    illustration: "wafer",
  },
  {
    id: "platform-technology-ew",
    name: "Platform Technology EW",
    industry: "Software & platforms",
    description: "Large technology platforms and cloud businesses available through the current admissions register.",
    members: [
      { symbol: "AAPLx", oracleTicker: "AAPL" },
      { symbol: "MSFTx", oracleTicker: "MSFT" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
      { symbol: "GOOGLx", oracleTicker: "GOOGL" },
      { symbol: "METAx", oracleTicker: "META" },
      { symbol: "NVDAx", oracleTicker: "NVDA" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    illustration: "platform",
  },
  {
    id: "digital-media-ew",
    name: "Digital Media EW",
    industry: "Digital media",
    description: "Streaming, advertising and digital distribution businesses represented by admitted instruments.",
    members: [
      { symbol: "NFLX", oracleTicker: "NFLX" },
      { symbol: "GOOGLx", oracleTicker: "GOOGL" },
      { symbol: "METAx", oracleTicker: "META" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    illustration: "signal",
  },
] as const;

export function findAllocationIndex(id: string | undefined): AllocationIndex | undefined {
  return allocationIndexes.find((index) => index.id === id);
}
