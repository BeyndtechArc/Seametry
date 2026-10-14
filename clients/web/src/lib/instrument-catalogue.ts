import "server-only";

import backpack from "../../../../shared/evidence/listings/backpack-securities.json";
import xstocks from "../../../../shared/evidence/listings/xstocks.json";
import { admissions, gradeOf, isAdmitted } from "./allocation/admissions";
import { identityOf } from "./instrument-identity";
import { CATALOGUE_STATES, type CatalogueInstrument, type CatalogueResponse, type CatalogueState } from "./instrument-catalogue-contract";

type ListingSnapshot = {
  issuer: string;
  captured_at: string;
  slot: number;
  tokens: Array<{ symbol: string; mint: string }>;
};

const admissionByMint = new Map(admissions.instruments.map((entry) => [entry.instrument.mint, entry]));
const snapshots = [backpack as ListingSnapshot, xstocks as ListingSnapshot];

export const instrumentCatalogue: CatalogueInstrument[] = snapshots
  .flatMap((snapshot) => snapshot.tokens.map((token): CatalogueInstrument => {
    const admission = admissionByMint.get(token.mint);
    const identity = identityOf(token.mint);
    return {
      symbol: token.symbol,
      ...(identity?.name ? { name: identity.name } : {}),
      mint: token.mint,
      issuer: snapshot.issuer,
      ...(identity?.logo ? { logo: identity.logo } : {}),
      ...(admission ? { grade: gradeOf(admission) } : {}),
      capturedAt: snapshot.captured_at,
      slot: snapshot.slot,
      state: admission ? (isAdmitted(admission) ? "available" : "assayed") : "listed",
    };
  }))
  .sort((left, right) => left.symbol.localeCompare(right.symbol) || left.issuer.localeCompare(right.issuer));

export function findCatalogueInstrument(mint: string) {
  return instrumentCatalogue.find((entry) => entry.mint === mint);
}

export function cataloguePage({ query = "", issuer = "any", state = "any", page = 1, pageSize = 48 }: { query?: string; issuer?: string; state?: CatalogueState | "any"; page?: number; pageSize?: number }): CatalogueResponse {
  const needle = query.trim().toLowerCase();
  const searched = instrumentCatalogue.filter((entry) =>
    (issuer === "any" || entry.issuer === issuer) &&
    (!needle || entry.symbol.toLowerCase().includes(needle) || entry.name?.toLowerCase().includes(needle) || entry.mint.toLowerCase().includes(needle)),
  );
  const states = Object.fromEntries(CATALOGUE_STATES.map((name) => [name, searched.filter((entry) => entry.state === name).length])) as Record<CatalogueState, number>;
  const filtered = state === "any" ? searched : searched.filter((entry) => entry.state === state);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return {
    data: filtered.slice((current - 1) * pageSize, current * pageSize),
    meta: {
      total: instrumentCatalogue.length,
      capturedAt: snapshots.map((snapshot) => snapshot.captured_at).sort().at(-1)!,
      filtered: filtered.length,
      states,
      page: current,
      pages,
      pageSize,
      issuers: snapshots.map((snapshot) => snapshot.issuer),
    },
  };
}
