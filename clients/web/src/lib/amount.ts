// Amounts are integer atoms plus a scale (server/internal/amount), so every
// conversion here works on digit strings and bigint, never on a float.

function groupedInteger(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Atoms at a scale as the interface shows them: thousands separated, every
 * digit the scale supports, and a true minus (voice.md, Formats).
 */
export function formatAmount(atoms: string | bigint, scale: number): string {
  const text = atoms.toString();
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  const sign = negative ? "−" : "";
  if (scale === 0) return `${sign}${groupedInteger(digits)}`;
  const padded = digits.padStart(scale + 1, "0");
  const split = padded.length - scale;
  return `${sign}${groupedInteger(padded.slice(0, split))}.${padded.slice(split)}`;
}

export type ParsedAmount = { atoms: bigint } | { refused: string };

/**
 * Reads what a person typed as a whole-unit amount, "250" or "250.5" or
 * "1,000", into atoms at `scale`. Refuses rather than rounds: a digit the
 * scale cannot hold is a value the person did not mean.
 */
export function parseAmount(typed: string, scale: number): ParsedAmount {
  const text = typed.trim().replace(/,/g, "");
  if (!/^\d+(\.\d*)?$/.test(text)) {
    return { refused: `"${typed}" is not an amount. Type digits, with at most one decimal point.` };
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > scale) {
    return { refused: `This asset carries ${scale} decimal places; "${typed}" has ${fraction.length}.` };
  }
  return { atoms: BigInt(whole + fraction.padEnd(scale, "0")) };
}

/**
 * Splits `total` atoms into `parts` shares that sum to exactly `total`. The
 * remainder of the division goes one atom at a time to the first shares, so
 * no atom is created or lost and the result depends only on the inputs.
 */
export function splitEvenly(total: bigint, parts: number): bigint[] {
  if (parts <= 0) return [];
  const count = BigInt(parts);
  const base = total / count;
  const remainder = Number(total % count);
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1n : 0n));
}

/**
 * One line for a splitEvenly result, in list order. Naming every share made a
 * 23-way split a paragraph; each share's exact amount is still stated where
 * that purchase is reviewed. Exact: the remainder atoms are named, not rounded.
 */
export function describeSplit(shares: { symbol: string; atoms: bigint }[], scale: number, unit: string): string {
  if (shares.length === 0) return "";
  if (shares.length === 1) return `All ${formatAmount(shares[0].atoms, scale)} ${unit} to ${shares[0].symbol}.`;
  const base = shares[shares.length - 1].atoms;
  const larger = shares.filter((share) => share.atoms > base);
  const each = `${formatAmount(base, scale)} ${unit} to each of ${shares.length}`;
  if (larger.length === 0) return `${each}.`;
  const one = formatAmount(1n, scale);
  const who = larger.length <= 3 ? larger.map((share) => share.symbol).join(", ") : `the first ${larger.length}`;
  return `${each}; ${who} ${larger.length === 1 ? "gets" : "get"} ${one} ${unit} more, so the total is exact.`;
}
