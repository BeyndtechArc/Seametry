import index from "../../../../../shared/evidence/alloys/index.json";
import { METADATA_ORIGIN } from "../compose/identity";
import { logoFor } from "../instrument-logos";
import type { Alloy } from "../terminal-contract";

// shared/evidence/alloys/index.json is written by scripts/record-founding.ts
// from devnet. It names each founded Alloy and maps every devnet stand-in to
// the captured xStock it stands in for, which is the only way a stand-in leg
// gets its stock's logo: a stand-in carries no pointer to the real mint.

type FoundingRecord = (typeof index.alloys)[number];

const byAddress = new Map<string, FoundingRecord>(index.alloys.map((record) => [record.alloy, record]));

export type AlloyIdentity = {
  title: string;
  symbol?: string;
  /** Where the name came from, said beside it. */
  source: "share mint" | "founding record" | "none";
  /** A same-origin path, or nothing: the site's CSP loads images from this origin only. */
  artwork?: string;
};

function sameOriginPath(url: string | null | undefined) {
  return url && url.startsWith(`${METADATA_ORIGIN}/`) ? url.slice(METADATA_ORIGIN.length) : undefined;
}

export function alloyIdentity(alloy: Alloy): AlloyIdentity {
  const record = byAddress.get(alloy.address);
  const artwork = sameOriginPath(record?.image);
  if (alloy.metadata) return { title: alloy.metadata.name, symbol: alloy.metadata.symbol, source: "share mint", artwork };
  if (record) return { title: record.name, symbol: record.symbol, source: "founding record", artwork };
  return { title: `Alloy ${alloy.id}`, source: "none" };
}

export type LegIdentity = { symbol?: string; logo?: string; realMint?: string };

export function legIdentity(alloy: Alloy, legMint: string): LegIdentity {
  const leg = alloy.legs.find((candidate) => candidate.mint === legMint);
  const recorded = byAddress.get(alloy.address)?.legs.find((candidate) => candidate.stand_in === legMint);
  // A recorded leg points at the real xStock, whose logo was captured; a
  // leg without a record shows its own mint's symbol and a lettered tile.
  return {
    symbol: leg?.metadata?.symbol ?? recorded?.symbol,
    logo: recorded ? logoFor(recorded.real_mint) : logoFor(legMint),
    realMint: recorded?.real_mint,
  };
}
