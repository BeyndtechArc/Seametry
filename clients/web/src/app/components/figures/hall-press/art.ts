import { HEIGHT, LEGS, STACK_MAX, STATIC, WALLET_DEPTH, WIDTH, chit, coin, freezeBand, frozenNote, gateBlade, padlock, ramLower, ramUpper, stackCoin, unit, walletIngot } from "./geometry";

const group = (part: string, body: string, extra = "") => `<g data-part="${part}"${extra}>${body}</g>`;
const hidden = " data-hidden=\"\"";

/**
 * The whole press as one SVG string, in painter's order: the base with its
 * engraved notes, then each leg's vault canister and channel from far to
 * near, the press bed, the back column, the moving share and ram, the front
 * column, the crosshead and the flywheel, then the shares stack, the wallet
 * with its ingots, the Claims rack and its chits. Chits and parcels are drawn
 * last because they fly over the bench: a Claim from the die to the rack, a
 * vault's payout from its spout to the wallet. Built on the server; the
 * client only moves the groups it names.
 */
export function pressSvg() {
  const legs = LEGS.map((leg, index) => [
    STATIC.canisters[index],
    group(`band-${index}`, freezeBand(leg.y), hidden),
    STATIC.channels[index],
    group(`unit-${index}`, unit(leg.y), hidden),
    group(`gate-${index}`, gateBlade(leg.y)),
    group(`padlock-${index}`, padlock(leg.y), hidden),
  ].join("")).join("");

  // Each stack position has a plain share and a lit one over it; the live
  // component lights only the top share, so exactly one part is lit at rest.
  const stack = Array.from({ length: STACK_MAX }, (_, index) =>
    group(`stack-${index}`, stackCoin(index) + group(`stack-lit-${index}`, stackCoin(index, true), hidden), hidden),
  ).join("");
  const ingots = LEGS.map((_, legIndex) =>
    Array.from({ length: WALLET_DEPTH }, (__, index) => group(`ingot-${legIndex}-${index}`, walletIngot(legIndex, index), hidden)).join(""),
  ).join("");

  const body = [
    STATIC.base,
    STATIC.labels,
    LEGS.map((leg, index) => group(`frozen-note-${index}`, frozenNote(leg.y), hidden)).join(""),
    legs,
    STATIC.bed,
    STATIC.columnBack,
    group("coin", coin(), hidden),
    group("ram-lower", ramLower()),
    STATIC.columnFront,
    STATIC.crosshead,
    group("ram-upper", ramUpper()),
    STATIC.tray,
    stack,
    STATIC.wallet,
    ingots,
    STATIC.rack,
    LEGS.map((_, index) => group(`chit-${index}`, chit(index), hidden)).join(""),
    LEGS.map((leg, index) => group(`parcel-${index}`, unit(leg.y), hidden)).join(""),
  ].join("");

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="press-title press-desc" xmlns="http://www.w3.org/2000/svg"><title id="press-title">The Hall's press</title><desc id="press-desc">The Hall's vault holds one canister per constituent. A Strike takes one ingot of each constituent from any wallet, pushes the units down their channels into the vault, and stamps one Alloy share onto the holder's stack. A Melt returns a share, records a Claim on every constituent in the rack, and each vault pays its unit out to the wallet. An issuer's freeze locks one vault: a Strike stops at its closed gate and nothing moves, and that leg's Claim stays recorded, marked, until the freeze lifts.</desc>${body}</svg>`;
}
