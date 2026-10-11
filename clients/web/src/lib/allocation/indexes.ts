export type AllocationIndexMember = {
  /** Symbol as it appears in Seametry's admissions register or research register. */
  symbol: string;
  /** Underlying public-equity ticker used only for reference market data. */
  oracleTicker?: string;
};

export type BasketFilter =
  | "megacap"
  | "ai-compute"
  | "cloud-software"
  | "media"
  | "space-frontier"
  | "backpack"
  | "xstocks"
  | "mixed"
  | "private-markets";

export type AllocationIndex = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  thesis: string;
  members: AllocationIndexMember[];
  weighting: "equal";
  methodologyVersion: string;
  review: string;
  driftBandPp: number;
  filters: BasketFilter[];
  researchOnly?: boolean;
  researchBoundary?: string;
  literature?: { label: string; href: string }[];
};

/**
 * Published-rule direct-wallet Allocation baskets.
 *
 * "Equal weight" is methodology, not branding. It belongs in the record and
 * order terms, never in the basket name. The catalogue can also carry a
 * research-only basket whose constituents are not yet admitted, but such a
 * basket must never expose a purchase action.
 */
export const allocationIndexes: readonly AllocationIndex[] = [
  {
    id: "prime-seven",
    code: "P7",
    name: "Prime Seven",
    category: "Megacap technology",
    description: "Seven large platform, compute and consumer-technology companies in the current admitted universe.",
    thesis: "A compact view of the megacap technology complex without turning the basket into a pooled share.",
    members: [
      { symbol: "AAPLx", oracleTicker: "AAPL" },
      { symbol: "MSFTx", oracleTicker: "MSFT" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
      { symbol: "GOOGLx", oracleTicker: "GOOGL" },
      { symbol: "METAx", oracleTicker: "META" },
      { symbol: "NVDAx", oracleTicker: "NVDA" },
      { symbol: "TSLAx", oracleTicker: "TSLA" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["megacap", "ai-compute", "xstocks"],
  },
  {
    id: "compute-chain",
    code: "CMP",
    name: "Compute Chain",
    category: "AI and semiconductors",
    description: "Chip design, foundry, memory and compute capacity across the admitted tokenized-equity set.",
    thesis: "Tracks the physical compute chain behind accelerated computing rather than one headline chip company.",
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
    filters: ["ai-compute", "backpack", "xstocks", "mixed"],
  },
  {
    id: "intelligence-layer",
    code: "AIL",
    name: "Intelligence Layer",
    category: "AI software and data",
    description: "Cloud platforms, model distribution, advertising data and applied AI software.",
    thesis: "Separates the software and distribution layer of the AI build-out from the semiconductor layer.",
    members: [
      { symbol: "MSFTx", oracleTicker: "MSFT" },
      { symbol: "GOOGLx", oracleTicker: "GOOGL" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
      { symbol: "METAx", oracleTicker: "META" },
      { symbol: "PLTRx", oracleTicker: "PLTR" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["ai-compute", "cloud-software", "xstocks"],
  },
  {
    id: "cloud-core",
    code: "CLD",
    name: "Cloud Core",
    category: "Cloud and software",
    description: "The admitted cloud infrastructure and enterprise-platform names with direct tokenized routes.",
    thesis: "A direct-wallet basket for the cloud layer, kept separate from hardware and consumer-device exposure.",
    members: [
      { symbol: "MSFTx", oracleTicker: "MSFT" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
      { symbol: "GOOGLx", oracleTicker: "GOOGL" },
      { symbol: "ORCLx", oracleTicker: "ORCL" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["cloud-software", "xstocks"],
  },
  {
    id: "data-center-stack",
    code: "DCS",
    name: "Data Center Stack",
    category: "Compute infrastructure",
    description: "Compute, memory, storage, interconnect and cloud demand in one direct-wallet basket.",
    thesis: "Groups the infrastructure layers that have to exist together for modern data-center capacity to ship.",
    members: [
      { symbol: "NVDAx", oracleTicker: "NVDA" },
      { symbol: "AMD", oracleTicker: "AMD" },
      { symbol: "MU", oracleTicker: "MU" },
      { symbol: "SNDK", oracleTicker: "SNDK" },
      { symbol: "AVGOx", oracleTicker: "AVGO" },
      { symbol: "MSFTx", oracleTicker: "MSFT" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["ai-compute", "cloud-software", "backpack", "xstocks", "mixed"],
  },
  {
    id: "memory-cycle",
    code: "MEM",
    name: "Memory Cycle",
    category: "Memory and storage",
    description: "Memory, storage and adjacent compute names represented through Backpack Securities.",
    thesis: "Keeps the memory and storage cycle visible as its own theme rather than burying it inside a broad semiconductor basket.",
    members: [
      { symbol: "MU", oracleTicker: "MU" },
      { symbol: "SNDK", oracleTicker: "SNDK" },
      { symbol: "INTC", oracleTicker: "INTC" },
      { symbol: "AMD", oracleTicker: "AMD" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["ai-compute", "backpack"],
  },
  {
    id: "attention-economy",
    code: "ATTN",
    name: "Attention Economy",
    category: "Digital media",
    description: "Advertising, streaming, commerce and device distribution competing for consumer time.",
    thesis: "Treats digital attention as the shared economic surface across otherwise different platform businesses.",
    members: [
      { symbol: "METAx", oracleTicker: "META" },
      { symbol: "GOOGLx", oracleTicker: "GOOGL" },
      { symbol: "NFLX", oracleTicker: "NFLX" },
      { symbol: "AMZNx", oracleTicker: "AMZN" },
      { symbol: "AAPLx", oracleTicker: "AAPL" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["media", "backpack", "xstocks", "mixed"],
  },
  {
    id: "frontier-systems",
    code: "FRNT",
    name: "Frontier Systems",
    category: "Space and autonomy",
    description: "Space systems, autonomy, applied software and accelerated compute from the current admitted set.",
    thesis: "A cross-industry frontier-technology basket built around systems that combine software with expensive physical infrastructure.",
    members: [
      { symbol: "SPCX", oracleTicker: "SPCX" },
      { symbol: "PLTRx", oracleTicker: "PLTR" },
      { symbol: "TSLAx", oracleTicker: "TSLA" },
      { symbol: "NVDAx", oracleTicker: "NVDA" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["space-frontier", "ai-compute", "backpack", "xstocks", "mixed"],
  },
  {
    id: "physical-ai",
    code: "PAI",
    name: "Physical AI",
    category: "Autonomy and infrastructure",
    description: "Autonomy, accelerated compute, applied software and distributed power in one researched theme.",
    thesis: "Looks at AI where software meets machines, power and real-world deployment rather than treating the theme as model providers alone.",
    members: [
      { symbol: "TSLAx", oracleTicker: "TSLA" },
      { symbol: "NVDAx", oracleTicker: "NVDA" },
      { symbol: "AMD", oracleTicker: "AMD" },
      { symbol: "PLTRx", oracleTicker: "PLTR" },
      { symbol: "BE", oracleTicker: "BE" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; rebalance only when the holder approves.",
    driftBandPp: 5,
    filters: ["space-frontier", "ai-compute", "backpack", "xstocks", "mixed"],
  },
  {
    id: "private-ai-venture",
    code: "PRIV",
    name: "Private AI & Venture",
    category: "Private markets research",
    description: "A research register for tokenized routes into late-stage private technology before they meet Seametry's admission standard.",
    thesis: "Keeps private-market exposure visible without pretending a note, fund interest and public-equity token are the same legal object.",
    members: [
      { symbol: "OPAIPon" },
      { symbol: "VCXx" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-private-research-0.1",
    review: "Research review on issuer, legal Grade, transfer controls and executable route before admission.",
    driftBandPp: 5,
    filters: ["private-markets"],
    researchOnly: true,
    researchBoundary: "Research only. These private-market instruments are not admitted for Seametry Allocation execution.",
    literature: [
      { label: "Ondo Private Markets", href: "https://ondo.finance/private-markets" },
      { label: "xStocks VCXx announcement", href: "https://blog.kraken.com/product/asset-listings/vcxx" },
    ],
  },
] as const;

export function findAllocationIndex(id: string | undefined): AllocationIndex | undefined {
  return allocationIndexes.find((index) => index.id === id);
}
