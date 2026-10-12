// The Hall's recipe arithmetic for one constituent, ported from
// server/internal/basket/recipe.go so a docs page can let a reader move the
// numbers. tests/hall-recipe.spec.ts replays shared/spec/recipe/vectors.json
// through it, so it computes what the Hall computes or the build fails.

export type Leg = { ledger: bigint; unclaimed: bigint };
export type RecipeState = { supply: bigint; leg: Leg };

/** ceil(n * ledger / supply): what a caller deposits to Strike n shares. Rounding up stops a fraction of a unit being taken for free. */
export function requiredIn(ledger: bigint, shares: bigint, supply: bigint): bigint {
  if (supply === 0n) throw new Error("required input is undefined at zero supply");
  const product = shares * ledger;
  return product / supply + (product % supply === 0n ? 0n : 1n);
}

/** floor(n * ledger / supply): what Melting n shares credits to the holder's Claim. Rounding down leaves the fraction with the Hall. */
export function out(ledger: bigint, shares: bigint, supply: bigint): bigint {
  if (supply === 0n) throw new Error("output is undefined at zero supply");
  return (shares * ledger) / supply;
}

/** Strike: deposit the required units and mint the shares. */
export function strike(state: RecipeState, shares: bigint): { state: RecipeState; paid: bigint } {
  const paid = requiredIn(state.leg.ledger, shares, state.supply);
  return { paid, state: { supply: state.supply + shares, leg: { ledger: state.leg.ledger + paid, unclaimed: state.leg.unclaimed } } };
}

/** Melt: burn the shares and credit the holder's Claim; no constituent moves, which is why no issuer power can block it. */
export function melt(state: RecipeState, shares: bigint): { state: RecipeState; credited: bigint } {
  if (shares > state.supply) throw new Error("cannot melt more shares than exist");
  const credited = out(state.leg.ledger, shares, state.supply);
  return { credited, state: { supply: state.supply - shares, leg: { ledger: state.leg.ledger - credited, unclaimed: state.leg.unclaimed + credited } } };
}
