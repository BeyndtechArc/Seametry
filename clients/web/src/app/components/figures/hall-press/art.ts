import { HEIGHT, LEGS, STACK_MAX, STATIC, WIDTH, chit, coin, gateBlade, padlock, ramLower, ramUpper, stackCoin, unit } from "./geometry";

export const CHITS_PER_LEG = 4;

const group = (part: string, body: string, extra = "") => `<g data-part="${part}"${extra}>${body}</g>`;

/**
 * The whole press as one SVG string, in painter's order: base, then each
 * leg's canister and channel from far to near, the press bed, the back
 * column, the moving share and ram, the front column, the crosshead and the
 * flywheel, then the output stack and the Claims rack. Built on the server;
 * the client only moves the groups it names.
 */
export function pressSvg() {
  const legs = LEGS.map((leg, index) => [
    STATIC.canisters[index],
    STATIC.channels[index],
    group(`unit-${index}`, unit(leg.y), " data-hidden=\"\""),
    group(`gate-${index}`, gateBlade(leg.y)),
    group(`padlock-${index}`, padlock(leg.y), " data-hidden=\"\""),
  ].join("")).join("");

  // Each stack position has a plain share and a lit one over it; the live
  // component lights only the top share, so exactly one part is lit at rest.
  const stack = Array.from({ length: STACK_MAX }, (_, index) =>
    group(`stack-${index}`, stackCoin(index) + group(`stack-lit-${index}`, stackCoin(index, true), " data-hidden=\"\""), " data-hidden=\"\""),
  ).join("");
  const chits = LEGS.map((_, legIndex) =>
    Array.from({ length: CHITS_PER_LEG }, (__, index) => group(`chit-${legIndex}-${index}`, chit(legIndex, index), " data-hidden=\"\"")).join(""),
  ).join("");

  const body = [
    STATIC.base,
    legs,
    STATIC.bed,
    STATIC.columnBack,
    group("coin", coin(), " data-hidden=\"\""),
    group("ram-lower", ramLower()),
    STATIC.columnFront,
    STATIC.crosshead,
    group("ram-upper", ramUpper()),
    STATIC.tray,
    stack,
    STATIC.rack,
    chits,
  ].join("");

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="press-title press-desc" xmlns="http://www.w3.org/2000/svg"><title id="press-title">The Hall's press</title><desc id="press-desc">Three constituent canisters feed a screw press through gated channels. A Strike pulls the Formula's quantities and stamps one Alloy share onto the output stack; a Melt returns a share and files a Claim on every constituent in the rack. An issuer's padlock closes one channel's gate.</desc>${body}</svg>`;
}
