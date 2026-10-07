import index from "../../../../../shared/evidence/alloys/index.json";
import { METADATA_ORIGIN } from "../compose/identity";
import { logoFor, logoForSymbol } from "../instrument-logos";
import type { Alloy } from "../terminal-contract";

// shared/evidence/alloys/index.json is written by scripts/record-founding.ts
// from devnet. It names a founded Alloy and maps each devnet stand-in to the
// captured stock it stands in for, a pointer a stand-in mint does not carry.
// It is evidence written by hand after a founding, so nothing here depends on
// it existing: an Alloy without one is named from its share mint, and its
// legs from the symbols their stand-ins state.

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
  const symbol = leg?.metadata?.symbol ?? recorded?.symbol;
  // A recorded leg points at the real stock, whose logo was captured. A leg
  // with no record, any Alloy founded after the record was written, finds
  // the logo by the symbol its stand-in states on chain; until 8 October
  // 2026 it fell to a lettered tile, so every new Alloy looked unfinished.
  return {
    symbol,
    logo: (recorded ? logoFor(recorded.real_mint) : logoFor(legMint)) ?? logoForSymbol(symbol),
    realMint: recorded?.real_mint,
  };
}
