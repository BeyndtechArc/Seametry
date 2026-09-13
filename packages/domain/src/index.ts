export type SourceName = "issuer" | "chainlink" | "stork" | "jupiter" | "solana";
export type SourceState = "live" | "stale" | "closed" | "halted" | "configured" | "unavailable" | "blocked-by-credentials";

export interface SourceObservation {
  source: SourceName;
  state: SourceState;
  observedAt: string;
  price?: number;
  ageMs?: number;
  note?: string;
}

export interface Instrument {
  symbol: string;
  underlying: string;
  mint: string;
  decimals: number;
}

export interface ExecutableQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  minimumOutputAmount?: string;
  priceImpactPct?: number;
  routeLabels: string[];
  fetchedAt: string;
}

export type RiskFlag =
  | "issuer-halt"
  | "reference-closed"
  | "reference-missing"
  | "reference-divergence"
  | "thin-route"
  | "quote-expired";

export interface PreflightResult {
  instrument: Instrument;
  status: "clear" | "caution" | "blocked";
  flags: RiskFlag[];
  observations: SourceObservation[];
  quote?: ExecutableQuote;
  explanation: string;
  generatedAt: string;
}

export interface CandidateCoverage {
  instrument: Instrument;
  issuer: SourceState;
  jupiter: SourceState;
  chainlink: SourceState;
  stork: SourceState;
  route?: string;
  priceImpactPct?: number;
  notes: string[];
}
