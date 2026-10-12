import * as k from "@/lib/iso/iso-kit";
import type { Plan, Point3, Projection } from "@/lib/iso/iso-kit";

// The Hall's press: three constituent canisters feed a screw press through
// gated channels; a Strike drops the ram and stamps one Alloy share onto the
// output stack, a Melt returns a share and files a Claim chit for every leg,
// and each Claim is then delivered to the holder's wallet tray unless its
// issuer has frozen it.
// World units, z up; the camera looks from +x, +y.

export const WIDTH = 640;
export const HEIGHT = 440;

export const LEGS = [
  { symbol: "AAPLx", y: -46 },
  { symbol: "NVDAx", y: 0 },
  { symbol: "TSLAx", y: 46 },
] as const;

const PLATE: Plan = { x: -196, y: -84, w: 404, d: 168, r: 9 };
const PLATE_H = 12;
const FOOT_H = 5;
const CAN_X = -150;
const CAN_R = 15;
const CAN_TOP = 44;
const CHANNEL_FROM = CAN_X + CAN_R - 2;
const CHANNEL_TO = -44;
export const GATE_X = -104;
const BED: Plan = { x: -44, y: -58, w: 88, d: 116, r: 3 };
const BED_H = 14;
const DIE_R = 13;
export const DIE_TOP = BED_H + 6;
const COLUMN_Y = 42;
const CROSS_Z = 112;
const CROSS_H = 16;
export const RAM_REST = 64;
export const RAM_H = 18;
const SCREW_TOP = 160;
const ARM_Z = SCREW_TOP;
export const COIN_R = 10;
export const COIN_H = 3;
export const STACK = [92, -14] as const;
const TRAY: Plan = { x: 70, y: -36, w: 44, d: 44, r: 3 };
const RACK_X = 150;
const RACK: Plan = { x: RACK_X - 18, y: -66, w: 36, d: 132, r: 2 };
const WALLET: Plan = { x: 70, y: 24, w: 46, d: 50, r: 3 };
const WALLET_FLOOR = 3.6;
const WALLET_LANES = [35, 49, 63];
const CHIT: Plan = { x: RACK.x + 9, y: -13, w: 2, d: 26, r: 0.3 };
const CHIT_MID: Point3 = [RACK.x + 10, 0, 15];
const INGOT_H = 3.6;
export const WALLET_DEPTH = 3;
export const STACK_MAX = 8;

export const P: Projection = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, -82, SCREW_TOP + 14], [0, 82, SCREW_TOP + 14], [RACK_X, 66, 70]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 58, elevation: 30 },
);

const at = (point: Point3) => k.iso(point, P);
const S = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (points: Point3[], style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(points.map(at), style);
const depth = (point: Point3) => k.depthOf(point, P);

/** Each drawn part with the point its painter's order is judged by. */
type Part = { at: Point3; svg: string };
const ordered = (parts: Part[]) => [...parts].sort((a, b) => depth(a.at) - depth(b.at)).map((part) => part.svg).join("");

function base() {
  const out: string[] = [];
  for (const [x, y] of [...k.corners(PLATE, 24)].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => [x, y, 0]), { size: 0.55 }));
  // A ruler strip along the front edge, ticks every 5 units, every fifth long.
  const strip: Plan = { x: -170, y: PLATE.y + PLATE.d - 16, w: 225, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2.2, 4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // A label plate with its three rule lines and four screws.
  const label: Plan = { x: 120, y: PLATE.y + PLATE.d - 26, w: 54, d: 18, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4, 0.3), { tone: "mid" }));
  out.push(L([0, 1, 2].map((row) => k.lineOnTop([label.x + 6, label.y + 5 + row * 4], [label.x + label.w - (row === 2 ? 20 : 6), label.y + 5 + row * 4], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D(k.corners(label, 2.4).map(([x, y]) => [x, y, 0.8]), { size: 0.45 }));
  return out.join("");
}

function canister(y: number) {
  const out: string[] = [];
  out.push(S(k.cylinder(CAN_X, y, CAN_R + 3, 0, 3, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(CAN_X, y, CAN_R, 3, CAN_TOP - 7, P, 44, 0.5), { tone: "mid" }));
  out.push(L([12, 24].map((z) => k.sideArc(CAN_X, y, CAN_R, z, P, 24)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(CAN_X, y, CAN_R + 1.2, CAN_TOP - 4, 4, P, 44, 0.4), { tone: "mid" }));
  out.push(L(k.knurl(CAN_X, y, CAN_R + 1.2, CAN_TOP - 4, CAN_TOP, 40, P), { tone: "lo" }));
  out.push(L(k.ring(CAN_X, y, CAN_R - 3, CAN_TOP, P, 40), { tone: "lo" }));
  // The spout where units leave toward the press.
  out.push(S(k.slabOf({ x: CAN_X + CAN_R - 3, y: y - 4, w: 7, d: 8, r: 1 }, 3, 6, P, 3, 0.4), { tone: "mid" }));
  return out.join("");
}

function channel(y: number) {
  const out: string[] = [];
  out.push(S(k.slabOf({ x: CHANNEL_FROM, y: y - 6, w: CHANNEL_TO - CHANNEL_FROM, d: 12, r: 1 }, 0, 2.4, P, 3, 0.3), { tone: "lo" }));
  for (const side of [-6, 4.4]) {
    out.push(S(k.slabOf({ x: CHANNEL_FROM, y: y + side, w: CHANNEL_TO - CHANNEL_FROM, d: 1.6, r: 0.4 }, 2.4, 4, P, 2), { tone: "mid", crease: "none" }));
  }
  out.push(D([CHANNEL_FROM + 8, (CHANNEL_FROM + CHANNEL_TO) / 2, CHANNEL_TO - 6].map((x) => [x, y + 5.2, 6.4]), { size: 0.4 }));
  // The gate's two posts; the blade itself moves (see gateBlade).
  for (const side of [-7.6, 6]) out.push(S(k.slabOf({ x: GATE_X - 1.6, y: y + side, w: 3.2, d: 1.6, r: 0.4 }, 2.4, 14, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: GATE_X - 1.6, y: y - 7.6, w: 3.2, d: 15.2, r: 0.4 }, 16.4, 1.4, P, 2), { tone: "mid" }));
  return out.join("");
}

/** The gate blade, drawn at rest (open, raised); an issuer freeze lowers it into the channel. */
export function gateBlade(y: number) {
  return S(k.slabOf({ x: GATE_X - 0.8, y: y - 5.6, w: 1.6, d: 11.2, r: 0.3 }, 9, 7, P, 2), { tone: "hi", crease: "lo" });
}

/** An issuer's padlock set on a canister's lid, where a frozen leg is seen first. */
export function padlock(y: number) {
  const out: string[] = [];
  const body: Plan = { x: CAN_X - 5, y: y - 6, w: 10, d: 12, r: 1.6 };
  out.push(L(k.sideRing([CAN_X, y, CAN_TOP + 13], 4.4, "x", P, 20), { tone: "hi" }));
  out.push(S(k.slabOf(body, CAN_TOP, 9, P, 4, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(body, 2), CAN_TOP + 9, P, 4), { tone: "faint" }));
  out.push(S(k.cylinder(CAN_X, y, 1.4, CAN_TOP + 9, 0.6, P, 16), { tone: "lo" }));
  return out.join("");
}

/** One constituent unit, an ingot standing proud of the channel walls, drawn at the spout. */
export function unit(y: number) {
  const plan: Plan = { x: CHANNEL_FROM + 1, y: y - 3.4, w: 7, d: 6.8, r: 1 };
  return [
    S(k.slabOf(plan, 2.4, 6.4, P, 3, 0.6), { tone: "hi", crease: "lo" }),
    L(k.planOutline(k.insetPlan(plan, 1.4), 8.8, P, 3), { tone: "faint" }),
  ].join("");
}

function bed() {
  return [
    S(k.slabOf(BED, 0, BED_H, P, 6, 1), { tone: "mid" }),
    L(k.planOutline(k.insetPlan(BED, 4), BED_H, P, 6), { tone: "faint" }),
    // T-slots across the bed, edge to edge inside the border, where a die is clamped.
    L([-24, 24].map((x) => k.lineOnTop([x, BED.y + 4], [x, BED.y + BED.d - 4], BED_H, P)).join(""), { tone: "lo" }),
    L([-27, -21, 21, 27].map((x) => k.lineOnTop([x, BED.y + 4], [x, BED.y + BED.d - 4], BED_H, P)).join(""), { tone: "faint" }),
    D(k.corners(BED, 6).map(([x, y]) => [x, y, BED_H]), { size: 0.5 }),
    ...k.corners(BED, 6).map(([x, y]) => L(k.ring(x, y, 2.2, BED_H, P, 16), { tone: "lo" })),
    S(k.cylinder(0, 0, DIE_R + 3, BED_H, 2, P, 44), { tone: "lo" }),
    S(k.cylinder(0, 0, DIE_R, BED_H + 2, DIE_TOP - BED_H - 2, P, 44, 0.6), { tone: "hi", crease: "lo" }),
    L(k.ring(0, 0, DIE_R - 3, DIE_TOP, P, 40), { tone: "lo" }),
  ].join("");
}

// The back column sits behind the ram and the share, the front column in
// front of them, so the press is drawn in three parts around its moving core.
function column(y: number) {
  return [
    S(k.cylinder(0, y, 8, BED_H, 4, P, 32), { tone: "mid" }),
    S(k.cylinder(0, y, 5, BED_H + 4, CROSS_Z - BED_H - 8, P, 32), { tone: "mid", crease: "none" }),
    L([40, 70, 96].map((z) => k.sideArc(0, y, 5, z, P, 16)).join(""), { tone: "faint" }),
    S(k.cylinder(0, y, 8, CROSS_Z - 4, 4, P, 32), { tone: "mid" }),
  ].join("");
}

function crosshead() {
  const plan: Plan = { x: -15, y: -54, w: 30, d: 108, r: 3 };
  return [
    S(k.slabOf(plan, CROSS_Z, CROSS_H, P, 6, 0.8), { tone: "mid" }),
    L(k.planOutline(k.insetPlan(plan, 3.5), CROSS_Z + CROSS_H, P, 6), { tone: "faint" }),
    D([-COLUMN_Y, COLUMN_Y].flatMap((y) => [[-8, y, CROSS_Z + CROSS_H], [8, y, CROSS_Z + CROSS_H]] as Point3[]), { size: 0.5 }),
    // Where each column passes through, a nut and washer hold the crosshead down.
    ...[-COLUMN_Y, COLUMN_Y].flatMap((y) => [
      S(k.cylinder(0, y, 7.4, CROSS_Z + CROSS_H, 1.2, P, 32), { tone: "lo" }),
      S(k.cylinder(0, y, 6, CROSS_Z + CROSS_H + 1.2, 4, P, 6, 0.4), { tone: "mid" }),
      L(k.ring(0, y, 2.6, CROSS_Z + CROSS_H + 5.2, P, 16), { tone: "lo" }),
    ]),
    S(k.cylinder(0, 0, 9, CROSS_Z + CROSS_H, 5, P, 36, 0.5), { tone: "mid" }),
    L(k.knurl(0, 0, 9, CROSS_Z + CROSS_H, CROSS_Z + CROSS_H + 5, 36, P), { tone: "lo" }),
  ].join("");
}

/** Below the crosshead: the ram and the lower screw, drawn at rest. */
export function ramLower() {
  return [
    S(k.cylinder(0, 0, 3.6, RAM_REST + RAM_H, CROSS_Z - RAM_REST - RAM_H, P, 24), { tone: "mid", crease: "none" }),
    L([92, 102].map((z) => k.sideArc(0, 0, 3.6, z, P, 12)).join(""), { tone: "lo" }),
    S(k.cylinder(0, 0, 11, RAM_REST, RAM_H, P, 40, 0.8), { tone: "mid" }),
    L(k.sideArc(0, 0, 11, RAM_REST + 5, P, 30), { tone: "faint" }),
    S(k.cylinder(0, 0, 8, RAM_REST - 3, 3, P, 36), { tone: "hi", crease: "lo" }),
  ].join("");
}

/** Above the crosshead: the upper screw and the flywheel bar with its two weights, drawn at rest. */
export function ramUpper() {
  const parts: Part[] = [];
  parts.push({ at: [0, 0, 2], svg: S(k.cylinder(0, 0, 3.6, CROSS_Z + CROSS_H + 5, ARM_Z - CROSS_Z - CROSS_H - 5, P, 24), { tone: "mid", crease: "none" }) });
  const bar: Plan = { x: -2.6, y: -74, w: 5.2, d: 148, r: 2 };
  parts.push({ at: [0, 0, 3], svg: [S(k.slabOf(bar, ARM_Z, 4, P, 4, 0.4), { tone: "mid" }), S(k.cylinder(0, 0, 6, ARM_Z, 7, P, 32, 0.5), { tone: "mid" })].join("") });
  for (const y of [-78, 78]) {
    parts.push({ at: [0, y, 3], svg: [
      S(k.cylinder(0, y, 9, ARM_Z - 4, 12, P, 40, 0.8), { tone: "mid" }),
      L(k.knurl(0, y, 9, ARM_Z - 1, ARM_Z + 5, 40, P), { tone: "lo" }),
      D([[0, y, ARM_Z + 8]], { size: 0.6, tone: "hi" }),
    ].join("") });
  }
  return ordered(parts);
}

/** The share being struck: the one lit part. Drawn on the die. */
export function coin() {
  return S(k.cylinder(0, 0, COIN_R, DIE_TOP, COIN_H, P, 40, 0.5), { tone: "hi", lit: true });
}

/** One share resting on the output stack at a given height. The top one is lit: the share the reader just made or is about to melt. */
export function stackCoin(index: number, lit = false) {
  return [
    S(k.cylinder(STACK[0], STACK[1], COIN_R, 4 + index * COIN_H, COIN_H, P, 40, 0.4), lit ? { tone: "hi", lit: true } : { tone: "hi", crease: "lo" }),
    L(k.sideArc(STACK[0], STACK[1], COIN_R, 4 + index * COIN_H + COIN_H / 2, P, 30), { tone: "faint" }),
  ].join("");
}

function tray() {
  return [
    S(k.slabOf(TRAY, 0, 2, P, 6, 0.4), { tone: "lo" }),
    S(k.slabOf(k.insetPlan(TRAY, 1), 2, 2, P, 6), { tone: "mid", crease: "none" }),
    L(k.planOutline(k.insetPlan(TRAY, 4), 4, P, 6), { tone: "faint" }),
    D(k.corners(TRAY, 3).map(([x, y]) => [x, y, 4]), { size: 0.45 }),
  ].join("");
}

function rack() {
  const parts: Part[] = [];
  // A low back rail rather than a wall, so the filed chits stay in view; it
  // carries a label strip with one rule line per slot.
  parts.push({ at: [RACK_X, -66, 0], svg: [
    S(k.slabOf(RACK, 0, 4, P, 4, 0.5), { tone: "mid" }),
    L(k.planOutline(k.insetPlan(RACK, 3), 4, P, 4), { tone: "faint" }),
    S(k.slabOf({ x: RACK.x, y: RACK.y, w: 4, d: RACK.d, r: 1 }, 4, 16, P, 3, 0.4), { tone: "mid" }),
    S(k.slabOf({ x: RACK.x - 0.6, y: RACK.y + 6, w: 0.6, d: RACK.d - 12, r: 0.2 }, 9, 6, P, 2), { tone: "lo", crease: "none" }),
    D([RACK.y + 3, RACK.y + RACK.d - 3].map((y) => [RACK.x + 2, y, 20] as Point3), { size: 0.45 }),
  ].join("") });
  // Dividers between the three slots, one slot per leg.
  for (const y of [-66, -23, 23, 64]) {
    parts.push({ at: [RACK_X, y, 1], svg: [
      S(k.slabOf({ x: RACK.x + 4, y, w: RACK.w - 4, d: 2, r: 0.4 }, 4, 14, P, 2), { tone: "mid", crease: "none" }),
      D([[RACK.x + RACK.w - 3, y + 1, 18]], { size: 0.4 }),
    ].join("") });
  }
  return ordered(parts);
}

/** A leg's Claim chit, filed upright in its slot of the rack. */
export function chit(legIndex: number) {
  const plan: Plan = { ...CHIT, y: LEGS[legIndex].y + CHIT.y };
  return S(k.slabOf(plan, 4, 22, P, 2), { tone: "hi", crease: "lo" });
}

// The holder's wallet: a shallow tray with one lane per leg, where a delivered
// Claim lands as an ingot of that constituent.
function wallet() {
  return [
    S(k.slabOf(WALLET, 0, 2, P, 6, 0.4), { tone: "lo" }),
    S(k.slabOf(k.insetPlan(WALLET, 1), 2, WALLET_FLOOR - 2, P, 6), { tone: "mid", crease: "none" }),
    L(k.planOutline(k.insetPlan(WALLET, 3), WALLET_FLOOR, P, 6), { tone: "faint" }),
    L([42, 56].map((y) => k.lineOnTop([WALLET.x + 3, y], [WALLET.x + WALLET.w - 3, y], WALLET_FLOOR, P)).join(""), { tone: "faint" }),
    D(k.corners(WALLET, 1.8).map(([x, y]) => [x, y, WALLET_FLOOR]), { size: 0.45 }),
  ].join("");
}

/** One delivered ingot in a leg's wallet lane, at its height in the pile. */
export function walletIngot(legIndex: number, index: number) {
  const plan: Plan = { x: WALLET.x + 12, y: WALLET_LANES[legIndex] - 4, w: 22, d: 8, r: 1 };
  const z = WALLET_FLOOR + index * INGOT_H;
  return [
    S(k.slabOf(plan, z, INGOT_H, P, 3, 0.5), { tone: "hi", crease: "lo" }),
    L(k.planOutline(k.insetPlan(plan, 1.8), z + INGOT_H, P, 3), { tone: "faint" }),
  ].join("");
}

export const STATIC = {
  base: base(),
  canisters: LEGS.map((leg) => canister(leg.y)),
  channels: LEGS.map((leg) => channel(leg.y)),
  bed: bed(),
  columnBack: column(-COLUMN_Y),
  columnFront: column(COLUMN_Y),
  crosshead: crosshead(),
  tray: tray(),
  rack: rack(),
  wallet: wallet(),
};

const UNIT_FRONT = CHANNEL_FROM + 8;

/** Screen offsets for moving parts, from world vectors, so the client never imports the kit. */
export const MOVES = {
  ramPerUnit: k.axisVector(P, [0, 0, -1]),
  channelPerUnit: k.axisVector(P, [1, 0, 0]),
  gateDrop: k.axisVector(P, [0, 0, -6.6]),
  coinToStack: k.axisVector(P, [STACK[0], STACK[1], 4 - DIE_TOP]),
  stackStep: k.axisVector(P, [0, 0, COIN_H]),
  strokeUnits: RAM_REST - 3 - DIE_TOP - COIN_H,
  channelUnits: CHANNEL_TO - CHANNEL_FROM - 8,
  // A unit bound for a frozen leg stops against its lowered gate blade.
  gateStopUnits: GATE_X - 0.8 - UNIT_FRONT - 0.4,
  chitToWallet: LEGS.map((leg, legIndex) =>
    k.axisVector(P, [WALLET.x + 23 - CHIT_MID[0], WALLET_LANES[legIndex] - leg.y, WALLET_FLOOR + INGOT_H - CHIT_MID[2]])),
};
