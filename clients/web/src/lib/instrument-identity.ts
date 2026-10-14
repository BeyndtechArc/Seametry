import "server-only";

import backpack from "../../../../shared/evidence/listings/backpack-securities.json";
import xstocks from "../../../../shared/evidence/listings/xstocks.json";
import manifest from "../../../../shared/evidence/instrument-logos.json";

// One answer to "what is this instrument called and what does it look like",
// for every page. The name is the one the issuer wrote into the mint itself
// (recorded by go run ./server/cmd/survey -listings), with the issuer's own
// suffix removed, because the issuer is shown once beside it and never inside
// the name. The logo is the issuer's, mirrored with its digest by
// go run ./server/cmd/capture -logos. Server only: the two files cover every
// listed mint, which no browser should download to draw one row; client
// components ask /instruments/logo/<mint> instead (logo-src.ts).

type ListedToken = { symbol: string; name?: string; mint: string; metadata_name?: string };
type Listing = { issuer: string; tokens: ListedToken[] };

export type InstrumentIdentity = {
  mint: string;
  symbol: string;
  /** The company or fund, from the mint's own metadata; undefined when the mint names none. */
  name?: string;
  issuer: string;
  /** A mirrored logo's path on this site, or undefined when none was captured. */
  logo?: string;
};

// Each issuer's suffix on its mints' names, measured on the 14 October 2026
// listings: every Backpack name ends " - Backpack Securities", every xStocks
// name " xStock".
const ISSUER_SUFFIXES = [" - Backpack Securities", " xStock"];

export function displayName(metadataName: string | undefined): string | undefined {
  let name = metadataName?.trim();
  if (!name) return undefined;
  for (const suffix of ISSUER_SUFFIXES) {
    if (name.endsWith(suffix)) name = name.slice(0, -suffix.length).trim();
  }
  return name || undefined;
}

const logos = new Map(manifest.logos.filter((logo) => logo.state === "captured" && logo.path).map((logo) => [logo.mint, logo.path as string]));
const logosBySymbol = new Map(manifest.logos.filter((logo) => logo.state === "captured" && logo.path).map((logo) => [logo.symbol, logo.path as string]));

const identities = new Map<string, InstrumentIdentity>(
  ([backpack, xstocks] as Listing[]).flatMap((listing) => listing.tokens.map((token) => [token.mint, {
    mint: token.mint,
    symbol: token.symbol,
    name: displayName(token.metadata_name),
    issuer: listing.issuer,
    logo: logos.get(token.mint),
  }] as const)),
);

export function identityOf(mint: string): InstrumentIdentity | undefined {
  return identities.get(mint);
}

export function logoOf(mint: string): string | undefined {
  return logos.get(mint);
}

/**
 * The captured logo for an instrument named by its symbol. For a devnet
 * stand-in, whose mint is not the real one: the stand-in names the stock it
 * stands in for in its own metadata, and listed symbols are distinct across
 * issuers (SPCX and SPCXx are two instruments).
 */
export function logoOfSymbol(symbol: string | undefined): string | undefined {
  return symbol ? logosBySymbol.get(symbol) : undefined;
}
