import type { GradeName } from "@seametry/ui";
import { admissions, blockingFact, gradeOf, partitionAdmissions } from "./admissions";
import { allocationConfig, requestCountry } from "./config";
import { countryGate } from "./rules";
import { formatAmount } from "../amount";
import { logoFor } from "../instrument-logos";
import { relativeEvidenceAge } from "../storm-fixture";

// What an Allocation offers, built once for the web page and for
// GET /api/allocation/offer, which the mobile app reads, so the two can never
// list different lots or state a lot differently.

export type OfferedLot = {
  mint: string;
  symbol: string;
  issuer: string;
  grade: GradeName;
  decision: string;
  capacityUsdc: number;
  stampReason: string;
  prerogatives: string[];
  multiplier: string;
  slot: string;
  /** A path on this site, or nothing when no logo was captured. */
  logo?: string;
};

export type RefusedLot = { symbol: string; fact: string };

function multiplierLine(lot: (typeof admissions.instruments)[number]) {
  const multiplier = lot.instrument.multiplier;
  if (!multiplier) return "No Scaled UI multiplier on this mint.";
  const effective = new Date(multiplier.effective_at).toUTCString().slice(5, 16);
  return `Wallets that apply the Scaled UI multiplier show what you receive multiplied by ${formatAmount(multiplier.value.atoms, multiplier.value.scale)}, effective ${effective}, as resolved at the snapshot instant.`;
}

export function allocationOffer() {
  const { admitted, refused } = partitionAdmissions(admissions.instruments);
  const offered: OfferedLot[] = admitted.map((lot) => {
    const prerogatives = lot.instrument.prerogatives.map((p) => p.sentence);
    // The issuer-power reasons repeat the condition report word for word, so
    // the stamp cites only what the report does not already state.
    const beyondPowers = lot.capacity_decision.reasons
      .filter((reason) => reason.severity !== "ALLOW" && !prerogatives.includes(reason.fact))
      .map((reason) => reason.fact);
    return {
      mint: lot.instrument.mint,
      symbol: lot.instrument.symbol ?? lot.instrument.mint,
      issuer: lot.issuer,
      grade: gradeOf(lot),
      decision: lot.capacity_decision.decision,
      capacityUsdc: lot.capacity_usdc,
      stampReason: beyondPowers[0] ?? `Admitted through ${formatAmount(BigInt(lot.capacity_usdc), 0)} USDC on the captured depth curve.`,
      prerogatives,
      multiplier: multiplierLine(lot),
      slot: lot.instrument.capture.slot,
      logo: logoFor(lot.instrument.mint),
    };
  });
  const refusedLots: RefusedLot[] = refused.map((lot) => ({ symbol: lot.instrument.symbol ?? lot.instrument.mint, fact: blockingFact(lot) }));
  return {
    policyVersion: admissions.policy_version,
    asOf: admissions.as_of,
    age: relativeEvidenceAge(admissions.as_of),
    offered,
    refused: refusedLots,
  };
}

/** Why this request cannot buy, or undefined when it can: missing configuration first, then the country gate. */
export function purchasesUnavailable(requestHeaders: Headers): string | undefined {
  const configured = allocationConfig();
  if ("missing" in configured) return "Purchases are unavailable in this deployment. You can still build and inspect a plan.";
  const gate = countryGate(requestCountry(requestHeaders), configured.config.blockedCountries);
  return gate.open ? undefined : gate.reason;
}
