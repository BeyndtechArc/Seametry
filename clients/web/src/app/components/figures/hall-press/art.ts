import { HEIGHT, LEGS, STACK_MAX, STATIC, WALLET_DEPTH, WIDTH, chit, coin, freezeBand, gateBlade, padlock, ramLower, ramUpper, stackCoin, unit, walletIngot } from "./geometry";

const group = (part: string, body: string, extra = "") => `<g data-part="${part}"${extra}>${body}</g>`;
const hidden = " data-hidden=\"\"";

/**
 * The whole press as one SVG string, in painter's order: base, then each
 * leg's canister and channel from far to near, the press bed, the back
 * column, the moving share and ram, the front column, the crosshead and the
 * flywheel, then the output stack, the wallet with its delivered ingots, the
 * Claims rack and its chits. A chit is drawn last because it lifts out of the
 * rack and crosses the wallet on its way to delivery. Built on the server;
 * the client only moves the groups it names.
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
  const chits = LEGS.map((_, legIndex) => group(`chit-${legIndex}`, chit(legIndex), hidden)).join("");

  const body = [
    STATIC.base,
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
    chits,
  ].join("");

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="press-title press-desc" xmlns="http://www.w3.org/2000/svg"><title id="press-title">The Hall's press</title><desc id="press-desc">Three constituent canisters feed a screw press through gated channels. A Strike pulls the Formula's quantities and stamps one Alloy share onto the output stack. A Melt returns a share and files a Claim on every constituent in the rack, and each Claim is delivered to the holder's wallet. An issuer's padlock closes one channel's gate: Strike is refused, and that leg's Claim is held in the rack, marked, while the others are delivered.</desc>${body}</svg>`;
}
