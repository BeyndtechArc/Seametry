import * as k from "@/lib/iso/iso-kit";
import type { Flat, Plan, Point3, Projection } from "@/lib/iso/iso-kit";
import { projectionOf, sceneOf, stationFor, type Poses, type Solid, type Station, type Travel } from "@/lib/iso/scene";

// The Hall as an assay line on one bench. At the left, the Hall's vault:
// one canister per constituent, each behind a meter that takes the
// Formula's amount. Each constituent's channel runs through its issuer's
// gate to the press, which strikes the share onto the holder's stack. At
// the right, the Claims rack and the holder's wallet tray, one lane per
// constituent. The story is the Hall's (docs/prd/HALL.md): a Strike takes
// one of each constituent from the wallet, carries it through the gates
// into the vault and strikes a share; an issuer freezes its leg; a Melt
// returns the share and records a Claim on every leg, every leg its issuer
// lets through is delivered to the wallet, and the frozen leg stays a
// Claim; the freeze lifts and that Claim is delivered, which brings the
// bench back to where it began. World units, z up. Every part is an
// upright prism standing on the bench or on another part, so
// lib/iso/scene.ts can order it from any camera at every pose.

export const WIDTH = 720;
export const HEIGHT = 600;

export const LEGS = [-48, 0, 48] as const;
/** The leg whose issuer freezes it in the story. */
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
/** How high a part that arrives or leaves travels above its place: out of the picture's way, not out of the frame. */
const LIFT = 40;
/** The ram's stroke on a Strike. */
const STROKE = 6;
/** How far a constituent's unit travels along the feed, and then along the channel. */
const FEED_RUN = 22;
const CHANNEL_RUN = 26;

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

const travel: Record<string, Travel> = {
  ram: { dz: [-STROKE, 0] },
  "share-new": { dz: [0, LIFT] },
  padlock: { dz: [0, LIFT] },
  [`blade-${FROZEN}`]: { dz: [-13, 0] },
};

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
  // The vault's canister for this constituent, banded, under a knurled lid.
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

  // The channel to the gate, ruled along its top, and the feed from the gate to the press bed.
  box(`channel-${leg}`, { x: -116, y: y - 4, w: 34, d: 8, r: 1 }, 0, 5, { tone: "lo", marks: (P) => ticks(k.topTicks(-113, -85, 4, 4, y - 4, 5, [1.4, 2.8], P)) });
  box(`feed-${leg}`, { x: -64, y: y - 4, w: 24, d: 8, r: 1 }, 0, 5, { tone: "lo" });

  // The issuer's gate: two posts, a lintel and a blade, raised while the
  // leg is open. The story's issuer lowers its blade and padlocks it.
  box(`post-a-${leg}`, { x: GATE_X - 3, y: y - 11, w: 6, d: 4, r: 0 }, 0, 24);
  box(`post-b-${leg}`, { x: GATE_X - 3, y: y + 7, w: 6, d: 4, r: 0 }, 0, 24);
  box(`blade-${leg}`, { x: GATE_X - 2, y: y - 7, w: 4, d: 14, r: 0 }, 13, 9, { tone: "hi", ...(leg === FROZEN ? { group: `blade-${leg}` } : {}) });
  box(`lintel-${leg}`, { x: GATE_X - 4, y: y - 12, w: 8, d: 24, r: 1 }, 24, 4, { marks: (P) => k.dotsSvg(k.pointsAt([[GATE_X, y - 9, 28], [GATE_X, y + 9, 28]], P), { size: 0.7, tone: "lo" }) });

  // A unit of the constituent in transit: along the feed, then, past the
  // gate, along the channel. Two parts rather than one, so neither's
  // travel crosses the blade, which may be down.
  travel[`unit-${leg}-feed`] = { dx: [-FEED_RUN, 0] };
  travel[`unit-${leg}-channel`] = { dx: [-CHANNEL_RUN, 0] };
  box(`unit-${leg}-feed`, { x: -46, y: y - 3, w: 6, d: 6, r: 1 }, 5, 4, { tone: "hi", group: `unit-${leg}-feed` });
  box(`unit-${leg}-channel`, { x: -88, y: y - 3, w: 6, d: 6, r: 1 }, 5, 4, { tone: "hi", group: `unit-${leg}-channel` });

  // The Claim a Melt records for this leg, and the holder's units of it in
  // the wallet tray: one always there, one the story spends and returns.
  travel[`claim-${leg}`] = { dz: [0, LIFT] };
  travel[`ingot-${leg}`] = { dz: [0, LIFT] };
  box(`claim-${leg}`, { x: RACK_X + 14, y: y - 9, w: 2, d: 18, r: 0 }, 4, 20, { tone: "hi", group: `claim-${leg}` });
  const lane = LANES[leg]!;
  box(`ingot-${leg}-kept`, { x: TRAY.x + 6, y: lane - 5, w: 12, d: 10, r: 1 }, 6, 4, { tone: "hi", bevel: 0.5 });
  box(`ingot-${leg}-spent`, { x: TRAY.x + 21, y: lane - 5, w: 12, d: 10, r: 1 }, 6, 4, { tone: "hi", bevel: 0.5, group: `ingot-${leg}` });
}

// The issuer's padlock on the frozen leg's lintel.
box(`padlock-${FROZEN}`, { x: GATE_X - 3, y: LEGS[FROZEN] - 4, w: 6, d: 8, r: 1 }, 28, 6, { group: "padlock", className: "frozen" });
can(`shackle-${FROZEN}`, [GATE_X, LEGS[FROZEN]], 1.8, 34, 3, { group: "padlock", className: "frozen" });

// The press: a bed, the die with the share being struck, two columns, the
// ram on its screw (the screw rides into a collar under the crosshead),
// the crosshead, and a flywheel with two handles.
box("bed", BED, 0, 10, { bevel: 1, marks: (P) => line(k.planOutline(k.insetPlan(BED, 4), 10, P), "faint") });
can("die", [0, 0], 12, 10, 5, { marks: (P) => line(k.ring(0, 0, 9.5, 15, P), "faint") });
can("share", [0, 0], 9, 15, 3, { lit: true, tone: "hi" });
for (const [index, y] of [-COLUMN_Y, COLUMN_Y].entries()) {
  can(`column-${index}`, [0, y], 5, 10, 90, { marks: (P) => line(k.sideArc(0, y, 5, 34, P), "faint") + line(k.sideArc(0, y, 5, 74, P), "faint") });
}
box("ram", { x: -12, y: -12, w: 24, d: 24, r: 2 }, 46, 18, { tone: "hi", bevel: 0.8, group: "ram", marks: (P) => line(k.sideSeam({ x: -12, y: -12, w: 24, d: 24, r: 2 }, 52, P), "faint") });
can("screw", [0, 0], 3, 64, 36, { group: "ram", marks: (P) => line(k.knurl(0, 0, 3, 64, 100, 10, P), "faint") });
can("collar", [0, 0], 5, 92, 8, { over: ["screw"] });
const CROSSHEAD: Plan = { x: -14, y: -48, w: 28, d: 96, r: 3 };
box("crosshead", CROSSHEAD, 100, 14, { bevel: 1, marks: (P) => k.dotsSvg(k.pointsAt([[0, -COLUMN_Y, 114], [0, COLUMN_Y, 114], [-8, -20, 114], [8, 20, 114]], P), { size: 0.9, tone: "lo" }) });
can("screw-top", [0, 0], 3, 114, 14);
can("flywheel", [0, 0], 24, 128, 4, { tone: "hi", marks: (P) => ticks(k.radialTicks(0, 0, 24, 24, 6, 132, [1.2, 2.6], P)) + line(k.knurl(0, 0, 24, 128, 132, 72, P), "faint") });
can("hub", [0, 0], 5, 132, 5);
for (const [index, x] of [-17, 17].entries()) can(`handle-${index}`, [x, 0], 2, 132, 10);

// The holder's shares on their tray, and the one a Strike adds.
box("shares-tray", { x: STACK[0] - 13, y: STACK[1] - 13, w: 26, d: 26, r: 2 }, 0, 3, { tone: "lo" });
for (let index = 0; index < 4; index++) can(`shares-${index}`, STACK, 9, 3 + index * 3, 3, { tone: "hi" });
can("share-new", STACK, 9, 15, 3, { tone: "hi", group: "share-new" });

// The Claims rack, its back plate on the press side so the Claims face
// the wallet tray, and the tray with one lane per leg.
box("rack", { x: RACK_X, y: -62, w: 24, d: 124, r: 2 }, 0, 4);
box("rack-back", { x: RACK_X, y: -62, w: 4, d: 124, r: 0 }, 4, 28, { marks: (P) => line(k.sideSeam({ x: RACK_X, y: -62, w: 4, d: 124, r: 0 }, 26, P), "faint") });
box("tray", TRAY, 0, 6, {
  bevel: 1,
  marks: (P) => [-16, 16].map((y) => line(k.lineOnTop([TRAY.x + 3, y], [TRAY.x + TRAY.w - 3, y], 6, P), "faint")).join(""),
});

export const SCENE = sceneOf(solids, travel);

// The story, as poses over time. Every function here is pure in its time,
// so the server, the client and the tests draw the same frame.

const clamp = (t: number) => Math.min(1, Math.max(0, t));
/** Eased in and out between two moments, 0 before and 1 after. */
const between = (t: number, from: number, to: number) => {
  const x = clamp((t - from) / (to - from));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
/** A part arriving from above, or leaving upward: hidden while out of place. */
const arrive = (t: number, from: number, to: number) => (t < from ? { hidden: true } : { dz: LIFT * (1 - between(t, from, to)) });
const leave = (t: number, from: number, to: number) => (t >= to ? { hidden: true } : { dz: LIFT * between(t, from, to) });
const frozen = { className: "frozen" };

/** Where the bench stands at the start of the tour, and again at its end. */
function rest(): Poses {
  const poses: Poses = { "share-new": { hidden: true }, padlock: { hidden: true } };
  for (const leg of LEGS.keys()) {
    poses[`unit-${leg}-feed`] = { hidden: true };
    poses[`unit-${leg}-channel`] = { hidden: true };
    poses[`claim-${leg}`] = { hidden: true };
  }
  return poses;
}

/** A unit going into the vault on a Strike (`outward` false) or coming out on a Melt; `halted` stops it at a shut gate. */
function transit(poses: Poses, leg: number, t: number, start: number, outward: boolean, halted = false) {
  const span = 0.8;
  const [first, second] = outward ? [`unit-${leg}-channel`, `unit-${leg}-feed`] : [`unit-${leg}-feed`, `unit-${leg}-channel`];
  const runs = { [`unit-${leg}-feed`]: FEED_RUN, [`unit-${leg}-channel`]: CHANNEL_RUN };
  const along = (name: string, from: number) => {
    if (t < from || t >= from + span + (halted && name === first ? 0.8 : 0)) return { hidden: true };
    const share = between(t, from, from + span);
    return { dx: -runs[name]! * (outward ? 1 - share : share) };
  };
  poses[first] = along(first, start);
  poses[second] = halted ? { hidden: true } : along(second, start + span);
}

export interface Callout {
  at: Point3;
  text: string;
  /** Which way the rule leaves the part on the figure. */
  toward: "left" | "right";
  /** How far the rule rises from the part before it turns under the label, in figure units, so the plate lands in clear space. */
  rise?: number;
  /** Seconds into the station's hold when the event it names happens and the callout appears. */
  from: number;
}

export interface Stop {
  name: string;
  station: Station;
  /** Seconds the camera holds while the station's part of the story plays. */
  hold: number;
  callouts: Callout[];
  /** The bench at `t` seconds into the hold. */
  poses: (t: number) => Poses;
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

const afterStrike = (): Poses => {
  const poses = rest();
  poses["share-new"] = {};
  for (const leg of LEGS.keys()) poses[`ingot-${leg}`] = { hidden: true };
  return poses;
};

const afterFreeze = (): Poses => ({ ...afterStrike(), [`blade-${FROZEN}`]: { dz: -13, ...frozen }, padlock: {} });

const afterMelt = (): Poses => {
  const poses = afterFreeze();
  poses["share-new"] = { hidden: true };
  for (const leg of LEGS.keys()) poses[`ingot-${leg}`] = leg === FROZEN ? { hidden: true } : {};
  poses[`claim-${FROZEN}`] = frozen;
  return poses;
};

export const STOPS: Stop[] = [
  {
    name: "Formula",
    station: framed([-130, 0, 20], 70, 30, 1.35, [WIDTH * 0.5, HEIGHT * 0.5]),
    hold: 4.5,
    callouts: [
      { at: [HOPPER_X, LEGS[0], 53], text: "The Hall's vault, a canister each", toward: "right", from: 0.3, rise: 60 },
      { at: [METER_X, LEGS[2], 14], text: "Formula: a fixed amount per share", toward: "left", from: 1.2 },
    ],
    poses: () => rest(),
  },
  {
    name: "Strike",
    station: framed([-34, 0, 30], 132, 26, 1.6, [WIDTH * 0.5, HEIGHT * 0.5]),
    hold: 6,
    callouts: [
      { at: [-52, LEGS[2], 9], text: "Strike: one of each constituent in", toward: "left", from: 0.8, rise: 70 },
      { at: [0, 0, 18], text: "One share struck to the holder", toward: "left", from: 3.4, rise: 120 },
    ],
    poses: (t) => {
      const poses = rest();
      for (const leg of LEGS.keys()) {
        poses[`ingot-${leg}`] = leave(t, 0.2, 0.8);
        transit(poses, leg, t, 0.8, false);
      }
      poses.ram = { dz: -STROKE * Math.sin(Math.PI * clamp((t - 3.0) / 0.6)) };
      poses["share-new"] = arrive(t, 3.6, 4.4);
      return poses;
    },
  },
  {
    name: "Issuer powers",
    station: framed([-66, 0, 16], 112, 26, 1.45, [WIDTH * 0.42, HEIGHT * 0.5]),
    hold: 4.5,
    callouts: [
      { at: [GATE_X, LEGS[0], 28], text: "Every issuer power named up front", toward: "right", from: 0.3 },
      { at: [GATE_X, LEGS[FROZEN], 37], text: "An issuer freezes its leg", toward: "left", from: 1.9 },
    ],
    poses: (t) => ({
      ...afterStrike(),
      [`blade-${FROZEN}`]: { dz: -13 * between(t, 0.5, 1.3), ...(t >= 0.5 ? frozen : {}) },
      padlock: arrive(t, 1.3, 2.1),
    }),
  },
  {
    name: "Melt",
    station: framed([30, 0, 14], -38, 32, 1.1, [WIDTH * 0.5, HEIGHT * 0.52]),
    hold: 7,
    callouts: [
      { at: [RACK_X + 15, LEGS[0], 24], text: "Melt: a Claim on every leg", toward: "left", from: 1.6 },
      { at: [RACK_X + 15, LEGS[FROZEN], 24], text: "A frozen leg stays a Claim", toward: "right", from: 4.6 },
    ],
    poses: (t) => {
      const poses = afterFreeze();
      poses["share-new"] = leave(t, 0.2, 0.9);
      for (const leg of LEGS.keys()) {
        const held = leg === FROZEN;
        transit(poses, leg, t, 1.8, true, held);
        poses[`claim-${leg}`] = held ? { ...arrive(t, 0.9, 1.6), ...frozen } : t < 3.6 ? arrive(t, 0.9, 1.6) : leave(t, 3.6, 4.2);
        poses[`ingot-${leg}`] = held ? { hidden: true } : arrive(t, 3.6, 4.4);
      }
      return poses;
    },
  },
];

/** Seconds the camera takes to turn from one station to the next. */
export const MOVE = 2.4;

/**
 * The bench while the camera moves on from `stop`. Leaving the Melt, the
 * issuer lifts its freeze and the held Claim is delivered, which returns
 * the bench to its rest for the next turn of the tour.
 */
export function movingPoses(stop: number, t: number): Poses {
  if (stop === 0) return rest();
  if (stop === 1) return afterStrike();
  if (stop === 2) return afterFreeze();
  const poses = afterMelt();
  poses.padlock = leave(t, 0, 0.6);
  poses[`blade-${FROZEN}`] = { dz: -13 * (1 - between(t, 0.4, 1.0)), ...(t < 0.4 ? frozen : {}) };
  poses[`claim-${FROZEN}`] = t < 1.0 ? frozen : { ...leave(t, 1.0, 1.6) };
  poses[`ingot-${FROZEN}`] = arrive(t, 1.0, 1.8);
  return poses;
}

/** The figure's still picture under reduced motion: the Melt delivered around the frozen leg. */
export const STILL = { stop: 3, poses: afterMelt() };

/** The callout's usual rise from its dot, and its plate's height, in figure units. */
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

/** How close a plate docks to the figure's side. */
const EDGE = 4;

/**
 * Where a callout sits at a camera: a dot on the part, a rise at the
 * drawing's own 30 degrees, then a level run out to a plate docked against
 * the figure's side, holding the station's number and the label, read
 * outward from the part. Plates placed beside their parts landed on the
 * machine they named and ran out of the frame (23 October 2026); docked to
 * the side they keep to the margins and inside it. Where the part is
 * already near that side, the rule rises straight into the plate's bottom
 * edge. The plate's outer corner is cut.
 * Returned in figure units so the server and a test draw it alike.
 */
export function calloutPath(callout: Callout, P: Projection) {
  const dot = k.iso(callout.at, P);
  const sign = callout.toward === "right" ? 1 : -1;
  const rise = callout.rise ?? CALLOUT_RISE;
  const elbow: Flat = [dot[0] + sign * rise * Math.cos(Math.PI / 6), dot[1] - rise * Math.sin(Math.PI / 6)];
  const width = PAD + NUMBER_W + callout.text.length * CHAR + PAD;
  const near = sign > 0 ? WIDTH - EDGE - width : EDGE + width;
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
