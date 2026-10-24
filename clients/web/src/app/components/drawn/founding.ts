import "server-only";

import index from "../../../../../../shared/evidence/alloys/index.json";
import { findAdmission } from "@/lib/allocation/admissions";
import { formatAmount } from "@/lib/amount";
import { identityOf } from "@/lib/instrument-identity";

// The Alloy the public pages draw, as its founding record states it. Stoic
// Crew is the one Alloy with a founding record (shared/evidence/alloys/
// index.json, written by scripts/record-founding.ts from devnet); its legs are devnet
// stand-ins, each recorded against the real mint it stands in for, whose
// decimals, name and logo come from the admissions snapshot and the logo
// manifest rather than from this file.

export const evidenceDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export type FoundedLeg = {
  symbol: string;
  realMint: string;
  issuer: string;
  /** Units of the real token per share, at that token's decimals. */
  units: string;
  name?: string;
  logo?: string;
};

export function founded() {
  const record = index.alloys[0];
  if (!record) return undefined;
  const legs: FoundedLeg[] = [];
  for (const leg of record.legs) {
    const admission = findAdmission(leg.real_mint);
    // A leg whose real mint the snapshot no longer holds has no stated
    // decimals, so its units cannot be written; the shot is left out rather
    // than shown with a leg missing.
    if (!admission) return undefined;
    const identity = identityOf(leg.real_mint);
    legs.push({
      symbol: leg.symbol,
      realMint: leg.real_mint,
      issuer: leg.issuer,
      units: formatAmount(leg.atoms_per_share, admission.decimals),
      name: identity?.name,
      logo: identity?.logo,
    });
  }
  return {
    id: record.id,
    name: record.name,
    symbol: record.symbol,
    cluster: record.cluster,
    artwork: new URL(record.image).pathname,
    signature: record.founding.signature,
    slot: BigInt(record.founding.slot).toLocaleString("en-US"),
    foundedOn: evidenceDate.format(new Date(record.founding.block_time)),
    legs,
  };
}
