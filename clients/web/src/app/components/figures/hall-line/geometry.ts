import * as k from "@/lib/iso/iso-kit";
import type { Flat, Plan, Point3, Projection } from "@/lib/iso/iso-kit";
import { projectionOf, sceneOf, stationFor, type Solid, type Station } from "@/lib/iso/scene";

// The Hall as an assay line on one bench, read left to right: each
// constituent's canister feeds a meter that takes the Formula's amount, a
// channel carries it through its issuer's gate to the press, the press
// strikes the share, and on a Melt the rack files a Claim per leg while the
// wallet tray takes back every leg its issuer lets through. The third leg's
// issuer has frozen it: its gate is down and padlocked, its Claim stays in
// the rack, and its lane in the tray is empty (docs/prd/HALL.md, Melt).
// World units, z up. Every part is an upright prism standing on the bench
// or on another part, so lib/iso/scene.ts can order it from any camera.

export const WIDTH = 720;
export const HEIGHT = 600;

export const LEGS = [-48, 0, 48] as const;
const FROZEN = 2;

const PLATE: Plan = { x: -200, y: -92, w: 400, d: 184, r: 8 };
const HOPPER_X = -160;
const METER_X = -126;
const GATE_X = -73;
const BED: Plan = { x: -40, y: -56, w: 80, d: 112, r: 3 };
const COLUMN_Y = 40;
const STACK: Flat = [61, -29];
const RACK_X = 96;
const TRAY: Plan = { x: 146, y: -50, w: 40, d: 100, r: 3 };
/** The tray is narrower than the line, so its three lanes sit closer than the legs. */
const LANES = LEGS.map((y) => (y * 2) / 3);

const solids: Solid[] = [];
type Extra = Omit<Partial<Solid>, "id" | "ring" | "z" | "h">;

function box(id: string, plan: Plan, z: number, h: number, extra: Extra = {}) {
  solids.push({ id, ring: k.ringOf(plan, plan.r > 0 ? 4 : 1), bound: k.corners(plan), z, h, tone: "mid", ...extra });
}

/** A round part, its ring as coarse as it can be while still reading round at its size, and bounded by a twelve-sided polygon drawn round it. */
function can(id: string, [cx, cy]: Flat, r: number, z: number, h: number, extra: Extra = {}) {
  const bound = k.circleRing(cx, cy, r / Math.cos(Math.PI / 12), 12);
  solids.push({ id, ring: k.circleRing(cx, cy, r, r < 6 ? 12 : r < 14 ? 20 : 28), bound, z, h, tone: "mid", ...extra });
}

const line = (d: string, tone: k.LineTone = "lo") => k.lineSvg(d, { tone });
const ticks = ({ minor, major }: k.Ticks) => line(minor, "faint") + line(major, "lo");

// Bench: a plate on four feet, a groove, ruled edges, a screw at each corner
// and an engraved plate.
for (const [index, [x, y]] of k.corners(PLATE, 16).entries()) can(`foot-${index}`, [x, y], 6, -17, 5, { tone: "lo" });
box("bench", PLATE, -12, 12, {
  tone: "lo",
  bevel: 1,
  marks: (P) =>
    line(k.planOutline(k.insetPlan(PLATE, 5), 0, P), "faint") +
    ticks(k.topTicks(-190, 190, 5, 5, PLATE.y + 1, 0, [2, 4], P)) +
    ticks(k.topTicks(-190, 190, 5, 5, PLATE.y + PLATE.d - 1, 0, [-2, -4], P)) +
    k.dotsSvg(k.pointsAt(k.corners(PLATE, 8).map(([x, y]) => [x, y, 0]), P), { size: 0.9, tone: "lo" }),
});
const NAMEPLATE: Plan = { x: -30, y: 66, w: 60, d: 16, r: 1 };
box("nameplate", NAMEPLATE, 0, 0.6, {
  tone: "lo",
  flat: true,
  marks: (P) => [0, 1, 2].map((row) => line(k.lineOnTop([NAMEPLATE.x + 6, NAMEPLATE.y + 4 + row * 4], [NAMEPLATE.x + (row === 1 ? 40 : 54), NAMEPLATE.y + 4 + row * 4], 0.6, P), "faint")).join(""),
});

for (const [leg, y] of LEGS.entries()) {
  const frozen = leg === FROZEN;
  const held = frozen ? { className: "frozen" } : {};

  // The constituent's canister, banded, under a knurled lid.
  can(`pedestal-${leg}`, [HOPPER_X, y], 16, 0, 4);
  can(`canister-${leg}`, [HOPPER_X, y], 12, 4, 40, { tone: "hi", marks: (P) => line(k.sideArc(HOPPER_X, y, 12, 14, P), "faint") + line(k.sideArc(HOPPER_X, y, 12, 34, P), "faint") });
  can(`lid-${leg}`, [HOPPER_X, y], 13.5, 44, 4, { marks: (P) => line(k.knurl(HOPPER_X, y, 13.5, 44, 48, 36, P), "faint") });
  can(`knob-${leg}`, [HOPPER_X, y], 3.5, 48, 5);

  // The meter that takes the Formula's amount of this constituent.
  box(`meter-${leg}`, { x: METER_X - 8, y: y - 8, w: 16, d: 16, r: 2 }, 0, 12, { bevel: 0.8 });
  can(`dial-${leg}`, [METER_X, y], 6, 12, 2, {
    tone: "hi",
    marks: (P) => ticks(k.radialTicks(METER_X, y, 6, 12, 3, 14, [1, 2], P)) + line(k.lineOnTop([METER_X, y], [METER_X + 3.4, y - 3.4], 14, P), "hi"),
  });

  // The channel to the gate, ruled along its top.
  box(`channel-${leg}`, { x: -116, y: y - 4, w: 34, d: 8, r: 1 }, 0, 5, { tone: "lo", marks: (P) => ticks(k.topTicks(-113, -85, 4, 4, y - 4, 5, [1.4, 2.8], P)) });

  // The issuer's gate: two posts, a lintel and a blade, raised when open,
  // lowered and padlocked when the issuer freezes this leg.
  box(`post-a-${leg}`, { x: GATE_X - 3, y: y - 11, w: 6, d: 4, r: 0 }, 0, 24);
  box(`post-b-${leg}`, { x: GATE_X - 3, y: y + 7, w: 6, d: 4, r: 0 }, 0, 24);
  box(`blade-${leg}`, { x: GATE_X - 2, y: y - 7, w: 4, d: 14, r: 0 }, frozen ? 0 : 13, frozen ? 10 : 9, { tone: "hi", ...held });
  box(`lintel-${leg}`, { x: GATE_X - 4, y: y - 12, w: 8, d: 24, r: 1 }, 24, 4, { marks: (P) => k.dotsSvg(k.pointsAt([[GATE_X, y - 9, 28], [GATE_X, y + 9, 28]], P), { size: 0.7, tone: "lo" }) });
  if (frozen) {
    box(`padlock-${leg}`, { x: GATE_X - 3, y: y - 4, w: 6, d: 8, r: 1 }, 28, 6, held);
    can(`shackle-${leg}`, [GATE_X, y], 1.8, 34, 3, held);
  }

  // The feed from the gate to the press bed.
  box(`feed-${leg}`, { x: -64, y: y - 4, w: 24, d: 8, r: 1 }, 0, 5, { tone: "lo" });

  // The Claim filed for this leg on a Melt, and the leg delivered to the
  // wallet tray unless its issuer holds it.
  box(`claim-${leg}`, { x: RACK_X + 14, y: y - 9, w: 2, d: 18, r: 0 }, 4, 20, { tone: "hi", ...held });
  if (!frozen) {
    const lane = LANES[leg]!;
    for (const [slot, x] of [TRAY.x + 6, TRAY.x + 21].entries()) box(`ingot-${leg}-${slot}`, { x, y: lane - 5, w: 12, d: 10, r: 1 }, 6, 4, { tone: "hi", bevel: 0.5 });
  }
}

// The press: a bed, the die with the share being struck, two columns, the
// ram on its screw, the crosshead, and a flywheel with two handles.
box("bed", BED, 0, 10, { bevel: 1, marks: (P) => line(k.planOutline(k.insetPlan(BED, 4), 10, P), "faint") });
can("die", [0, 0], 12, 10, 5, { marks: (P) => line(k.ring(0, 0, 9.5, 15, P), "faint") });
can("share", [0, 0], 9, 15, 3, { lit: true, tone: "hi" });
for (const [index, y] of [-COLUMN_Y, COLUMN_Y].entries()) {
  can(`column-${index}`, [0, y], 5, 10, 90, { marks: (P) => line(k.sideArc(0, y, 5, 34, P), "faint") + line(k.sideArc(0, y, 5, 74, P), "faint") });
}
box("ram", { x: -12, y: -12, w: 24, d: 24, r: 2 }, 46, 18, { tone: "hi", bevel: 0.8, marks: (P) => line(k.sideSeam({ x: -12, y: -12, w: 24, d: 24, r: 2 }, 52, P), "faint") });
can("screw", [0, 0], 3, 64, 36, { marks: (P) => line(k.knurl(0, 0, 3, 64, 100, 10, P), "faint") });
const CROSSHEAD: Plan = { x: -14, y: -48, w: 28, d: 96, r: 3 };
box("crosshead", CROSSHEAD, 100, 14, { bevel: 1, marks: (P) => k.dotsSvg(k.pointsAt([[0, -COLUMN_Y, 114], [0, COLUMN_Y, 114], [-8, -20, 114], [8, 20, 114]], P), { size: 0.9, tone: "lo" }) });
can("screw-top", [0, 0], 3, 114, 14);
can("flywheel", [0, 0], 24, 128, 4, { tone: "hi", marks: (P) => ticks(k.radialTicks(0, 0, 24, 24, 6, 132, [1.2, 2.6], P)) + line(k.knurl(0, 0, 24, 128, 132, 72, P), "faint") });
can("hub", [0, 0], 5, 132, 5);
for (const [index, x] of [-17, 17].entries()) can(`handle-${index}`, [x, 0], 2, 132, 10);

// The holder's shares, struck onto a tray.
box("shares-tray", { x: STACK[0] - 13, y: STACK[1] - 13, w: 26, d: 26, r: 2 }, 0, 3, { tone: "lo" });
for (let index = 0; index < 4; index++) can(`shares-${index}`, STACK, 9, 3 + index * 3, 3, { tone: "hi" });

// The Claims rack, its back plate on the press side so the Claims face
// the wallet tray, and the tray with one lane per leg.
box("rack", { x: RACK_X, y: -62, w: 24, d: 124, r: 2 }, 0, 4);
box("rack-back", { x: RACK_X, y: -62, w: 4, d: 124, r: 0 }, 4, 28, { marks: (P) => line(k.sideSeam({ x: RACK_X, y: -62, w: 4, d: 124, r: 0 }, 26, P), "faint") });
box("tray", TRAY, 0, 6, {
  bevel: 1,
  marks: (P) => [-16, 16].map((y) => line(k.lineOnTop([TRAY.x + 3, y], [TRAY.x + TRAY.w - 3, y], 6, P), "faint")).join(""),
});

export const SCENE = sceneOf(solids);

/** A note the camera shows at one station: a rule from a dot on its part out to a short label. */
export interface Callout {
  at: Point3;
  text: string;
  /** Which way the rule leaves the part on the figure. */
  toward: "left" | "right";
}

export interface Stop {
  name: string;
  station: Station;
  callouts: Callout[];
}

const MACHINE: Point3[] = solids.flatMap((solid) => solid.ring.flatMap(([x, y]) => [[x, y, solid.z], [x, y, solid.z + solid.h]] as Point3[]));
/** Room the drawing keeps from the figure's left and top edges, in figure units; it may run off the right and bottom. */
const MARGIN = 12;

/**
 * A station looking at `focus` from an azimuth and elevation, `zoom` times
 * closer than the whole machine fits, with the focus placed at `at` on the
 * figure. Zooming from the whole machine rather than fitting the focus
 * alone keeps every station's scale in one family, and the drawing is then
 * slid right or down until it clears the figure's left and top edges: the
 * hero's copy sits to the left and the house rail above, and a station
 * fitted to a small region spread the bench over both (23 October 2026).
 */
function framed(focus: Point3, azimuth: number, elevation: number, zoom: number, at: Flat): Station {
  const whole = stationFor(MACHINE, WIDTH, HEIGHT, { azimuth, elevation, pad: MARGIN });
  const station: Station = { azimuth, elevation, scale: whole.scale * zoom, focus, screen: at };
  const P = projectionOf(station);
  const flat = MACHINE.map((point) => k.iso(point, P));
  const left = Math.min(...flat.map(([x]) => x));
  const top = Math.min(...flat.map(([, y]) => y));
  return { ...station, screen: [at[0] + Math.max(0, MARGIN - left), at[1] + Math.max(0, MARGIN - top)] };
}

// Each station frames one part of the line from the angle where it reads
// best, leaving room on one side for its callouts.
export const STOPS: Stop[] = [
  {
    name: "Formula",
    station: framed([-130, 0, 20], 70, 30, 1.35, [WIDTH * 0.44, HEIGHT * 0.5]),
    callouts: [
      { at: [HOPPER_X, LEGS[0], 53], text: "Formula: fixed per share", toward: "right" },
      { at: [METER_X, LEGS[2], 14], text: "Each constituent read first", toward: "left" },
    ],
  },
  {
    name: "Issuer powers",
    station: framed([-66, 0, 16], 112, 26, 1.45, [WIDTH * 0.42, HEIGHT * 0.5]),
    callouts: [
      { at: [GATE_X, LEGS[FROZEN], 37], text: "Freeze: gate shut, leg held", toward: "left" },
      { at: [GATE_X, LEGS[0], 28], text: "Issuer powers named up front", toward: "right" },
    ],
  },
  {
    name: "Strike",
    station: framed([0, 0, 60], 38, 20, 1.3, [WIDTH * 0.5, HEIGHT * 0.46]),
    callouts: [
      { at: [0, 9, 18], text: "Strike: any wallet mints", toward: "right" },
      { at: [0, 0, 137], text: "No instruction alters the Formula", toward: "left" },
    ],
  },
  {
    name: "Melt",
    station: framed([120, 0, 12], -32, 34, 1.4, [WIDTH * 0.5, HEIGHT * 0.52]),
    callouts: [
      { at: [RACK_X + 15, LEGS[FROZEN], 24], text: "A held leg stays a Claim", toward: "left" },
      { at: [TRAY.x + 12, LANES[0]!, 10], text: "Melt: legs return to the wallet", toward: "right" },
    ],
  },
];

/** How long the camera holds a station, and how long it takes to reach the next, in milliseconds. */
export const HOLD_MS = 4500;
export const MOVE_MS = 1600;

/** The callout's rise from its dot, and its plate's height, in figure units. */
const CALLOUT_RISE = 40;
const PLATE_H = 20;
/**
 * The label face's advance per character at 12 units: Fragment Mono
 * measured 7.42 (178.0 units for 24 characters) in the page on 23 October
 * 2026, with a little over for its fallback face.
 */
const CHAR = 7.6;
const NUMBER_W = 22;
const PAD = 8;

/**
 * Where a callout sits at a camera: a dot on the part, a rise at the
 * drawing's own 30 degrees, then a run along the bottom of a plate holding
 * the station's number and the label, read outward from the part. The
 * plate's outer corner is cut. Returned in figure units so the server and
 * a test draw it alike.
 */
export function calloutPath(callout: Callout, P: Projection) {
  const dot = k.iso(callout.at, P);
  const sign = callout.toward === "right" ? 1 : -1;
  const elbow: Flat = [dot[0] + sign * CALLOUT_RISE * Math.cos(Math.PI / 6), dot[1] - CALLOUT_RISE * Math.sin(Math.PI / 6)];
  const width = PAD + NUMBER_W + callout.text.length * CHAR + PAD;
  const near = elbow[0];
  const far = near + sign * width;
  const [y0, y1] = [elbow[1] - PLATE_H, elbow[1]];
  const cut = 6;
  const plate: Flat[] = [[near, y0], [far - sign * cut, y0], [far, y0 + cut], [far, y1], [near, y1]];
  const baseline = y1 - 6;
  return {
    dot,
    elbow,
    end: [far, y1] as Flat,
    plate,
    number: [near + sign * PAD, baseline] as Flat,
    label: [near + sign * (PAD + NUMBER_W), baseline] as Flat,
    anchor: sign > 0 ? ("start" as const) : ("end" as const),
  };
}
