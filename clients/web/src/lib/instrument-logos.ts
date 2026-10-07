import manifest from "../../../../shared/evidence/instrument-logos.json";

// shared/evidence/instrument-logos.json is written by
// go run ./server/cmd/capture -logos, which mirrors the logo each mint's
// on-chain metadata names into public/instruments. Only a captured entry
// yields a path; every other state draws the lettered tile.

const captured = new Map(manifest.logos.filter((logo) => logo.state === "captured" && logo.path).map((logo) => [logo.mint, logo.path as string]));

export function logoFor(mint: string): string | undefined {
  return captured.get(mint);
}

const capturedBySymbol = new Map(manifest.logos.filter((logo) => logo.state === "captured" && logo.path).map((logo) => [logo.symbol, logo.path as string]));

/**
 * The captured logo for an instrument named by its symbol. For a devnet
 * stand-in, whose mint is not the real one: the stand-in names the stock it
 * stands in for in its own metadata, and captured symbols are distinct
 * across issuers (SPCX and SPCXx are two instruments).
 */
export function logoForSymbol(symbol: string | undefined): string | undefined {
  return symbol ? capturedBySymbol.get(symbol) : undefined;
}
