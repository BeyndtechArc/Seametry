// Drafting a Formula from live quotes. Everything is integer atoms: a quote
// says inAtoms of USDC bought outAtoms of a stock, and every value below is
// derived from that ratio with bigint arithmetic, never from a float price.

export const USDC_SCALE = 6;
const BPS = 10_000n;

export type QuotedLeg = {
  mint: string;
  symbol: string;
  decimals: number;
  quote: { inAtoms: bigint; outAtoms: bigint };
};

export type Weighting = { method: "value"; usdcPerShare: bigint } | { method: "units"; unitsPerShare: string };

export type DraftLeg = {
  mint: string;
  symbol: string;
  decimals: number;
  atomsPerShare: bigint;
  usdcPerShare: bigint;
  weightBps: bigint;
};

export type Draft = { legs: DraftLeg[]; usdcPerShare: bigint } | { refused: string };

/** USDC atoms a quantity of stock atoms is worth at the quote, rounded down. */
export function valueOf(atoms: bigint, quote: QuotedLeg["quote"]): bigint {
  return (atoms * quote.inAtoms) / quote.outAtoms;
}

/** Whole units typed as a decimal, "0.05", into atoms at a scale; refuses rather than rounds. */
export function unitsToAtoms(typed: string, decimals: number): bigint | { refused: string } {
  const text = typed.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return { refused: `"${typed}" is not a quantity. Type digits, with at most one decimal point.` };
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) return { refused: `This stock carries ${decimals} decimal places; "${typed}" has ${fraction.length}.` };
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function draftFormula(legs: QuotedLeg[], weighting: Weighting): Draft {
  if (legs.length === 0) return { refused: "Choose at least one constituent." };
  const unusable = legs.find((leg) => leg.quote.inAtoms <= 0n || leg.quote.outAtoms <= 0n);
  if (unusable) return { refused: `${unusable.symbol} has no usable quote, so it cannot be priced.` };

  const quantities: bigint[] = [];
  for (const leg of legs) {
    if (weighting.method === "value") {
      if (weighting.usdcPerShare <= 0n) return { refused: "Set a value per share above zero." };
      const legValue = weighting.usdcPerShare / BigInt(legs.length);
      quantities.push((legValue * leg.quote.outAtoms) / leg.quote.inAtoms);
    } else {
      const atoms = unitsToAtoms(weighting.unitsPerShare, leg.decimals);
      if (typeof atoms !== "bigint") return atoms;
      quantities.push(atoms);
    }
  }
  const tooSmall = quantities.findIndex((atoms) => atoms === 0n);
  if (tooSmall >= 0) return { refused: `${legs[tooSmall].symbol} would hold zero atoms per share. Raise the value or quantity per share.` };

  const values = quantities.map((atoms, i) => valueOf(atoms, legs[i].quote));
  const total = values.reduce((sum, value) => sum + value, 0n);
  return {
    usdcPerShare: total,
    legs: legs.map((leg, i) => ({
      mint: leg.mint,
      symbol: leg.symbol,
      decimals: leg.decimals,
      atomsPerShare: quantities[i],
      usdcPerShare: values[i],
      weightBps: total === 0n ? 0n : (values[i] * BPS) / total,
    })),
  };
}

const SYMBOL = /^[A-Z][A-Z0-9]{1,9}$/;

/**
 * The share mint's metadata is immutable once founded, so the draft checks it
 * now. The Hall itself enforces no length (initialize_alloy writes whatever it
 * is given); these limits are this draft's convention, chosen so wallets show
 * the whole name and symbol.
 */
export function identityProblem(name: string, symbol: string): string | undefined {
  if (name.trim().length < 3 || name.trim().length > 32) return "A name runs from 3 to 32 characters.";
  if (!SYMBOL.test(symbol)) return "A symbol is 2 to 10 capital letters or digits, starting with a letter.";
  return undefined;
}
