import type { Admission } from "./admissions";

export type TokenHolding = { mint: string; atoms: string; decimals: number; tokenProgram: string; account?: string };
export type ListedPosition = { mint: string; symbol: string; atoms: string; sellableAtoms: string; scale: number; tokenProgram: string };

/** A position as the holdings route serves it, named and pictured from the instrument identity. */
export type HeldPosition = ListedPosition & { name?: string; logo?: string };

/** A wallet can hold one mint in several accounts. Only the admissions register supplies its displayed identity. */
export function listedPositions(holdings: TokenHolding[], register: Admission[], associatedAccounts?: ReadonlyMap<string, string>): ListedPosition[] {
  const listed = new Map(register.map((lot) => [lot.instrument.mint, lot]));
  const totals = new Map<string, bigint>();
  const sellable = new Map<string, bigint>();
  for (const holding of holdings) {
    const lot = listed.get(holding.mint);
    if (!lot || holding.decimals !== lot.decimals || holding.tokenProgram !== lot.token_program) continue;
    totals.set(holding.mint, (totals.get(holding.mint) ?? 0n) + BigInt(holding.atoms));
    if (!associatedAccounts || holding.account === associatedAccounts.get(holding.mint)) {
      sellable.set(holding.mint, (sellable.get(holding.mint) ?? 0n) + BigInt(holding.atoms));
    }
  }
  return [...totals].filter(([, atoms]) => atoms > 0n).map(([mint, atoms]) => {
    const lot = listed.get(mint)!;
    return { mint, symbol: lot.instrument.symbol ?? mint, atoms: atoms.toString(), sellableAtoms: (sellable.get(mint) ?? 0n).toString(), scale: lot.decimals, tokenProgram: lot.token_program };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
}
