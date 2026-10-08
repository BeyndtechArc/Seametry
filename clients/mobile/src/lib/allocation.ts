import { ORIGIN } from "./config";

// The app computes nothing the server decides: the offer, the fee tier and
// every leg's terms come from the web app's routes, which run the same rules
// as its own page (clients/web/src/lib/allocation).

export type Grade = "Entitlement" | "Certificate" | "Interest" | "Ungraded";

export type OfferedLot = {
  mint: string;
  symbol: string;
  issuer: string;
  grade: Grade;
  decision: string;
  capacityUsdc: number;
  stampReason: string;
  prerogatives: string[];
  multiplier: string;
  slot: string;
  logo?: string;
};

export type Offer = {
  policyVersion: string;
  asOf: string;
  age: string;
  offered: OfferedLot[];
  refused: { symbol: string; fact: string }[];
  unavailable: string | null;
  feeTiers: { fromConstituents: number; bps: number }[];
  feeSchedule: string;
  slippageBps: number;
};

export type PreparedLeg = {
  mint: string;
  symbol: string;
  inAtoms: string;
  outAtoms: string;
  floorAtoms: string;
  outScale: number;
  route: string[];
  receivedAt: string;
  expiresAt: string;
  routingFeeBps: number;
  routingFeeAtoms: string;
  simulated: { atoms: string; scale: number; unit: string }[];
  transaction: string;
  approval: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ORIGIN}${path}`, init);
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(body?.error ?? `${path} answered ${response.status}.`);
  return body as T;
}

export const fetchOffer = () => call<Offer>("/api/allocation/offer");

export const prepareLeg = (wallet: string, mint: string, usdcAtoms: bigint, planMints: string[]) =>
  call<PreparedLeg>("/api/allocation/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, mint, usdcAtoms: usdcAtoms.toString(), planMints }),
  });

export const submitLeg = (transaction: string, approval: string) =>
  call<{ signature: string }>("/api/allocation/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction, approval }),
  });

export const legStatus = (signature: string) => call<{ state?: string; detail?: string }>(`/api/allocation/status?signature=${signature}`);

/** The fee tier the server will charge for a plan of `constituents`, read from the tiers it published. */
export function feeBpsFor(offer: Offer, constituents: number): number {
  const tier = [...offer.feeTiers].sort((a, b) => b.fromConstituents - a.fromConstituents).find((candidate) => constituents >= candidate.fromConstituents);
  return tier?.bps ?? offer.feeTiers[offer.feeTiers.length - 1]?.bps ?? 0;
}

export const logoUri = (path: string | undefined) => (path ? `${ORIGIN}${path}` : undefined);
