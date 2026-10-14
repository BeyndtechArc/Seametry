import "server-only";

import backpack from "../../../../shared/evidence/listings/backpack-securities.json";
import xstocks from "../../../../shared/evidence/listings/xstocks.json";
import { admissions, isAdmitted } from "./allocation/admissions";
import type { CatalogueInstrument, CatalogueResponse } from "./instrument-catalogue-contract";

type ListingSnapshot = {
  issuer: string;
  captured_at: string;
  slot: number;
  tokens: Array<{ symbol: string; name: string; mint: string }>;
};

const admissionByMint = new Map(admissions.instruments.map((entry) => [entry.instrument.mint, entry]));
const snapshots = [backpack as ListingSnapshot, xstocks as ListingSnapshot];

export const instrumentCatalogue: CatalogueInstrument[] = snapshots
  .flatMap((snapshot) => snapshot.tokens.map((token) => {
    const admission = admissionByMint.get(token.mint);
    return {
      symbol: token.symbol,
      name: token.name,
      mint: token.mint,
      issuer: snapshot.issuer,
      capturedAt: snapshot.captured_at,
      slot: snapshot.slot,
      state: admission ? (isAdmitted(admission) ? "available" as const : "assayed" as const) : "listed" as const,
    };
  }))
  .sort((left, right) => left.symbol.localeCompare(right.symbol) || left.issuer.localeCompare(right.issuer));

export function findCatalogueInstrument(mint: string) {
  return instrumentCatalogue.find((entry) => entry.mint === mint);
}

export function cataloguePage({ query = "", issuer = "any", page = 1, pageSize = 48 }: { query?: string; issuer?: string; page?: number; pageSize?: number }): CatalogueResponse {
  const needle = query.trim().toLowerCase();
  const filtered = instrumentCatalogue.filter((entry) =>
    (issuer === "any" || entry.issuer === issuer) &&
    (!needle || entry.symbol.toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle) || entry.mint.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return {
    data: filtered.slice((current - 1) * pageSize, current * pageSize),
    meta: {
      total: instrumentCatalogue.length,
      filtered: filtered.length,
      page: current,
      pages,
      pageSize,
      issuers: snapshots.map((snapshot) => snapshot.issuer),
    },
  };
}
