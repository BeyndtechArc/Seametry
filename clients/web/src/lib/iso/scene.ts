import * as k from "./iso-kit";
import type { Flat, Plane, Point3, Projection, Tone } from "./iso-kit";

// A machine the camera can move around. The vendored kit draws one solid at
// any azimuth and elevation, but it leaves painter's order to the figure,
// and a figure ordered by eye at one camera is wrong at another. Here every
// part is an upright prism on a convex footprint, and any two parts are
// separated either by a horizontal plane (one stands on or above the other)
// or by a vertical one (their footprints are disjoint). Two convex solids
// whose pictures overlap are both crossed by some view ray, and a plane
// that separates them crosses that ray once, so the side of the plane the
// viewer is on says which is nearer, at every camera above the floor.
// Planes are found once; a frame only reads which side the viewer is on.
// The kit's own 3D mode solves the same problem for parts that move
// relative to each other, at the cost of a 3,600 line runtime; a machine
// that only turns as one body does not need it.

export interface Solid {
  id: string;
  /** Convex footprint, in either winding. */
  ring: Plane[];
  z: number;
  h: number;
  tone?: Tone;
  crease?: Tone | "none";
  lit?: boolean;
  flat?: boolean;
  bevel?: number;
  className?: string;
  /** Lines drawn on this part, painted with it, under its outline. */
  marks?: (projection: Projection) => string;
  /**
   * A footprint with few points that encloses `ring`, used only to test
   * whether two pictures meet: a round part's 40 points cost the ordering
   * more than drawing it did. Enclosing can only add a pair to order, never
   * miss one. Defaults to `ring`.
   */
  bound?: Plane[];
}

/** b is nearer than a when the viewer is on b's side: above for a horizontal plane, along `normal` for a vertical one. */
type Separation = { kind: "above" } | { kind: "below" } | { kind: "beside"; normal: Plane };

export interface Scene {
  solids: Solid[];
  separations: (Separation | undefined)[][];
}

const CONTACT = 1e-6;

function axesOf(ring: Plane[]): Plane[] {
  return ring.map(([ax, ay], index) => {
    const [bx, by] = ring[(index + 1) % ring.length]!;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    return [(by - ay) / length, -(bx - ax) / length] as Plane;
  });
}

function spanOf(ring: Plane[], [nx, ny]: Plane): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const [x, y] of ring) {
    const value = x * nx + y * ny;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return [low, high];
}

/** The vertical plane with the widest gap between two footprints, oriented from a to b, or undefined when they overlap. */
function besideOf(a: Plane[], b: Plane[]): Plane | undefined {
  let best: { gap: number; normal: Plane } | undefined;
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const [a0, a1] = spanOf(a, axis);
    const [b0, b1] = spanOf(b, axis);
    const forward = b0 - a1;
    const backward = a0 - b1;
    const gap = Math.max(forward, backward);
    if (!best || gap > best.gap) best = { gap, normal: forward >= backward ? axis : [-axis[0], -axis[1]] };
  }
  return best && best.gap >= -CONTACT ? best.normal : undefined;
}

function separationOf(a: Solid, b: Solid): Separation {
  if (a.z + a.h <= b.z + CONTACT) return { kind: "above" };
  if (b.z + b.h <= a.z + CONTACT) return { kind: "below" };
  const normal = besideOf(a.ring, b.ring);
  if (!normal) throw new Error(`${a.id} and ${b.id} share height and footprint, so no plane separates them: move one, or stack it on the other.`);
  return { kind: "beside", normal };
}

/** Finds every pair's separating plane once, and refuses two parts that pass through each other. */
export function sceneOf(solids: Solid[]): Scene {
  const ids = new Set<string>();
  for (const solid of solids) {
    if (ids.has(solid.id)) throw new Error(`Two parts are named ${solid.id}; each needs its own name.`);
    ids.add(solid.id);
  }
  const separations = solids.map((a, i) => solids.map((b, j) => (j > i ? separationOf(a, b) : undefined)));
  return { solids, separations };
}

/** +1 when b is nearer than a at this camera, -1 when a is, 0 when the plane is edge-on and the pictures cannot overlap. */
function nearer(separation: Separation, [vx, vy]: Plane): number {
  if (separation.kind === "above") return 1;
  if (separation.kind === "below") return -1;
  const side = separation.normal[0] * vx + separation.normal[1] * vy;
  return side > 1e-9 ? 1 : side < -1e-9 ? -1 : 0;
}

type Box = [number, number, number, number];

function hullOf(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Flat[]) => {
    const out: Flat[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** The kit's projection with the camera's sines worked out once per frame instead of once per point. */
function projector(projection: Projection) {
  const { sinA, cosA, sinE, cosE, k: scale } = k.cameraOf(projection);
  const [ox, oy] = projection.origin;
  return (x: number, y: number, z: number): Flat => [ox + (x * sinA - y * cosA) * scale, oy + ((x * cosA + y * sinA) * sinE - z * cosE) * scale];
}

/** A solid's picture, enclosed: the hull of its bound's top and bottom, which contains what the kit fills. */
function pictureOf(solid: Solid, project: (x: number, y: number, z: number) => Flat): { hull: Flat[]; box: Box } {
  const points = (solid.bound ?? solid.ring).flatMap(([x, y]) => [project(x, y, solid.z), project(x, y, solid.z + solid.h)]);
  const hull = hullOf(points);
  const xs = hull.map(([x]) => x);
  const ys = hull.map(([, y]) => y);
  return { hull, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}

const boxesMeet = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * Whether two pictures share area. Only such pairs are ordered: two planes
 * can separate the same pair with opposite answers when their pictures are
 * apart, and ordering such a pair from its boxes alone made a cycle of the
 * bed, a gate blade and its post (23 October 2026).
 */
function picturesMeet(a: Flat[], b: Flat[]) {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index++) {
      const [ax, ay] = polygon[index]!;
      const [bx, by] = polygon[(index + 1) % polygon.length]!;
      const axis: Flat = [ay - by, bx - ax];
      const span = (list: Flat[]) => list.reduce(([low, high], [x, y]) => [Math.min(low, x * axis[0] + y * axis[1]), Math.max(high, x * axis[0] + y * axis[1])], [Infinity, -Infinity]);
      const [a0, a1] = span(a);
      const [b0, b1] = span(b);
      const length = Math.hypot(axis[0], axis[1]) || 1;
      if (Math.min(a1, b1) - Math.max(a0, b0) <= 0.05 * length) return false;
    }
  }
  return true;
}

function centreDepth(solid: Solid, projection: Projection) {
  const [sx, sy] = solid.ring.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
  return k.depthOf([sx / solid.ring.length, sy / solid.ring.length, solid.z + solid.h / 2], projection);
}

/**
 * Back to front. Only pairs whose pictures share area are ordered; the rest
 * keep the order of their centres' depth. `forced` counts picks made to
 * break a cycle, which separating planes rule out for these parts; a test
 * holds it at zero across the figure's cameras.
 */
export function orderOf(scene: Scene, projection: Projection): { order: number[]; forced: number } {
  const { solids, separations } = scene;
  const view = k.towardViewer(projection);
  const project = projector(projection);
  const pictures = solids.map((solid) => pictureOf(solid, project));
  const after: number[][] = solids.map(() => []);
  const waiting = solids.map(() => 0);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (!boxesMeet(pictures[i]!.box, pictures[j]!.box) || !picturesMeet(pictures[i]!.hull, pictures[j]!.hull)) continue;
      const sign = nearer(separations[i]![j]!, view);
      if (sign > 0) { after[i]!.push(j); waiting[j]!++; }
      else if (sign < 0) { after[j]!.push(i); waiting[i]!++; }
    }
  }
  const depth = solids.map((solid) => centreDepth(solid, projection));
  const ready = solids.map((_, index) => index).filter((index) => waiting[index] === 0);
  const placed = solids.map(() => false);
  const order: number[] = [];
  let forced = 0;
  while (order.length < solids.length) {
    if (!ready.length) {
      forced++;
      const pick = solids.map((_, index) => index).filter((index) => !placed[index]).sort((a, b) => waiting[a]! - waiting[b]! || depth[a]! - depth[b]!)[0]!;
      waiting[pick] = 0;
      ready.push(pick);
    }
    ready.sort((a, b) => depth[b]! - depth[a]!);
    const next = ready.pop()!;
    if (placed[next]) continue;
    placed[next] = true;
    order.push(next);
    for (const later of after[next]!) if (--waiting[later]! === 0 && !placed[later]) ready.push(later);
  }
  return { order, forced };
}

export function solidOf(solid: Solid, projection: Projection, marks = true): string {
  const paths = k.extrude(solid.ring, solid.z, solid.h, projection, { convex: true, bevel: marks ? solid.bevel : undefined });
  return k.solidSvg(paths, { tone: solid.tone, crease: solid.crease, lit: solid.lit, flat: solid.flat, className: solid.className, inner: marks ? (solid.marks?.(projection) ?? "") : "" });
}

/**
 * The whole machine at this camera, back to front, as SVG markup. While the
 * camera moves, `marks: false` leaves out the fine lines (ticks, knurls,
 * seams, bevels) as the kit's own 3D mode does at speed: they are a third
 * of the paths, unreadable in motion, and back as soon as the camera holds.
 */
export function paint(scene: Scene, projection: Projection, { marks = true }: { marks?: boolean } = {}): string {
  return orderOf(scene, projection).order.map((index) => solidOf(scene.solids[index]!, projection, marks)).join("");
}

/**
 * A camera pose: a world point the camera looks at, where on the figure it
 * lands, and from which azimuth, elevation and scale. Blending two stations
 * turns about the focus while it slides across the figure, so a move reads
 * as one camera travelling, not as a cut.
 */
export interface Station {
  azimuth: number;
  elevation: number;
  scale: number;
  focus: Point3;
  screen: Flat;
}

export function projectionOf({ azimuth, elevation, scale, focus, screen }: Station): Projection {
  const [fx, fy] = k.iso(focus, { origin: [0, 0], scale, azimuth, elevation });
  return { origin: [screen[0] - fx, screen[1] - fy], scale, azimuth, elevation };
}

/** The station that fits `points` in a width by height figure, looking at their centre. */
export function stationFor(points: Point3[], width: number, height: number, options: k.FitOptions & { screen?: Flat }): Station {
  const fit = k.fitProjection(points, width, height, options);
  const focus = points.reduce<Point3>(([x, y, z], [px, py, pz]) => [x + px / points.length, y + py / points.length, z + pz / points.length], [0, 0, 0]);
  const screen = options.screen ?? k.iso(focus, fit);
  return { azimuth: fit.azimuth ?? k.AZIMUTH, elevation: fit.elevation ?? k.ELEVATION, scale: fit.scale, focus, screen };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The camera `t` of the way from a to b; the azimuth takes the shorter way round, the scale moves in ratio. */
export function blend(a: Station, b: Station, t: number): Station {
  const turn = ((((b.azimuth - a.azimuth) % 360) + 540) % 360) - 180;
  return {
    azimuth: a.azimuth + turn * t,
    elevation: mix(a.elevation, b.elevation, t),
    scale: Math.exp(mix(Math.log(a.scale), Math.log(b.scale), t)),
    focus: [mix(a.focus[0], b.focus[0], t), mix(a.focus[1], b.focus[1], t), mix(a.focus[2], b.focus[2], t)],
    screen: [mix(a.screen[0], b.screen[0], t), mix(a.screen[1], b.screen[1], t)],
  };
}
