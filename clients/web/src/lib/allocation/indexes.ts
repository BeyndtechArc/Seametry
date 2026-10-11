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
  | "digital-capital"
  | "global-markets"
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
  /** Permanently research-only under this methodology, not merely incomplete today. */
  researchOnly?: boolean;
  researchBoundary?: string;
  literature?: { label: string; href: string }[];
};

/**
 * Published-rule direct-wallet Allocation baskets.
 *
 * The catalogue may include an incomplete research candidate before every
 * constituent has passed Good Delivery. Those rows are inspectable but cannot
 * be bought. "Equal weight" is methodology, not branding, and therefore never
 * appears in a basket name.
 */
export const allocationIndexes: readonly AllocationIndex[] = [
  {
    id: "prime-seven",
    code: "P7",
    name: "Prime Seven",
    category: "Megacap technology",
    description: "Seven platform, compute and consumer-technology leaders in the current admitted universe.",
    thesis: "A compact direct-wallet view of the megacap technology complex without introducing a pooled basket share.",
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
    category: "Semiconductors",
    description: "Chip design, foundry, memory and interconnect across admitted tokenized equities.",
    thesis: "Tracks the physical compute chain behind accelerated computing instead of concentrating the theme in one headline chip company.",
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
    id: "ai-cloud",
    code: "AIC",
    name: "AI Cloud",
    category: "AI infrastructure",
    description: "GPU clouds, data-center operators, compute silicon and architecture around AI workloads.",
    thesis: "A research basket for the companies selling the infrastructure required to train and serve models, rather than the model layer itself.",
    members: [
      { symbol: "NBIS", oracleTicker: "NBIS" },
      { symbol: "CRWV", oracleTicker: "CRWV" },
      { symbol: "IREN", oracleTicker: "IREN" },
      { symbol: "NVDAx", oracleTicker: "NVDA" },
      { symbol: "ARM", oracleTicker: "ARM" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; admission must be recaptured before an incomplete basket becomes executable.",
    driftBandPp: 5,
    filters: ["ai-compute", "cloud-software", "backpack", "mixed"],
    literature: [
      { label: "Backpack: Nebius", href: "https://learn.backpack.exchange/blog/tokenized-nebius-group-nbis" },
      { label: "Backpack: CoreWeave", href: "https://learn.backpack.exchange/blog/tokenized-coreweave-crwv" },
    ],
  },
  {
    id: "physical-ai",
    code: "PAI",
    name: "Physical AI",
    category: "Autonomy and infrastructure",
    description: "Autonomy, accelerated compute, applied software and distributed power in one admitted theme.",
    thesis: "Looks at AI where software meets machines, power and real-world deployment instead of model providers alone.",
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
    id: "defense-autonomy",
    code: "DEF",
    name: "Defense & Autonomy",
    category: "Defense technology",
    description: "Autonomous systems, defense software, space infrastructure and compute with onchain representations.",
    thesis: "A research basket around the software, sensing and autonomous-system stack now appearing in tokenized public markets.",
    members: [
      { symbol: "PUSA", oracleTicker: "PUSA" },
      { symbol: "PLTRx", oracleTicker: "PLTR" },
      { symbol: "SPCX" },
      { symbol: "NVDAx", oracleTicker: "NVDA" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; new representations require Good Delivery capture before execution.",
    driftBandPp: 5,
    filters: ["space-frontier", "ai-compute", "backpack", "xstocks", "mixed"],
    literature: [
      { label: "Backpack: Powerus", href: "https://learn.backpack.exchange/blog/tokenized-powerus-pusa" },
      { label: "Backpack: SpaceX", href: "https://learn.backpack.exchange/blog/tokenized-spacex-spcx" },
    ],
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
    id: "digital-capital",
    code: "DCP",
    name: "Digital Capital",
    category: "Onchain finance equities",
    description: "Public companies whose business or balance sheet is unusually exposed to crypto market infrastructure.",
    thesis: "Groups the listed-company layer around crypto capital markets without mixing their stocks with the underlying crypto assets.",
    members: [
      { symbol: "MSTR", oracleTicker: "MSTR" },
      { symbol: "FWDI", oracleTicker: "FWDI" },
      { symbol: "HOOD", oracleTicker: "HOOD" },
      { symbol: "BLK", oracleTicker: "BLK" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; admission must be captured before execution.",
    driftBandPp: 5,
    filters: ["digital-capital", "backpack"],
    literature: [
      { label: "Backpack: Strategy", href: "https://learn.backpack.exchange/blog/tokenized-strategy-mstr" },
      { label: "Backpack: Forward Industries", href: "https://learn.backpack.exchange/blog/tokenized-forward-industries-fwdi" },
      { label: "Backpack: Robinhood", href: "https://learn.backpack.exchange/blog/tokenized-robinhood-hood" },
    ],
  },
  {
    id: "global-rotation",
    code: "GLB",
    name: "Global Rotation",
    category: "Country and resource ETFs",
    description: "Country and resource exposures that are appearing as transferable tokenized ETF shares on Solana.",
    thesis: "A research basket for rotating outside the U.S. single-stock complex while keeping each ETF representation explicit.",
    members: [
      { symbol: "EWY", oracleTicker: "EWY" },
      { symbol: "EWZ", oracleTicker: "EWZ" },
      { symbol: "COPX", oracleTicker: "COPX" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-theme-ew-0.1",
    review: "Quarterly membership review; ETF methodology remains the responsibility of each underlying fund.",
    driftBandPp: 5,
    filters: ["global-markets", "backpack"],
    literature: [
      { label: "Backpack: South Korea ETF", href: "https://learn.backpack.exchange/blog/tokenized-ishares-msci-south-korea-etf-ewy" },
      { label: "Backpack: Brazil ETF", href: "https://learn.backpack.exchange/blog/tokenized-ishares-msci-brazil-etf-ewz" },
    ],
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
    id: "private-frontier",
    code: "PRIV",
    name: "Private Frontier",
    category: "Private markets research",
    description: "Three different routes to private-company exposure now appearing onchain.",
    thesis: "A research register that deliberately keeps direct security entitlements, private-market notes and a venture fund token distinguishable instead of flattening them into one legal claim.",
    members: [
      { symbol: "SPCX" },
      { symbol: "OPAIPon" },
      { symbol: "VCXx" },
    ],
    weighting: "equal",
    methodologyVersion: "seametry-private-research-0.1",
    review: "Research review on issuer, legal Grade, transfer controls and executable route before any future allocation rule.",
    driftBandPp: 5,
    filters: ["private-markets", "backpack", "xstocks", "mixed"],
    researchOnly: true,
    researchBoundary: "Research only. These instruments do not share one legal claim shape and are not admitted as a Seametry Allocation.",
    literature: [
      { label: "Backpack: SpaceX", href: "https://learn.backpack.exchange/blog/tokenized-spacex-spcx" },
      { label: "Ondo: OpenAI private-market note", href: "https://app.ondo.finance/private-markets/opaipon" },
      { label: "xStocks: VCXx", href: "https://xstocks.com/news/xstocks-and-fundrise-partner-to-tokenize-vcx-fund-unlocking-onchain-exposure-to-leading-private-tech-companies" },
    ],
  },
] as const;

export function findAllocationIndex(id: string | undefined): AllocationIndex | undefined {
  return allocationIndexes.find((index) => index.id === id);
}
