import * as k from "./iso-kit";
import type { Flat, Plane, Point3, Projection, Tone } from "./iso-kit";

// A machine the camera can move around while its parts move. The vendored
// kit draws one solid at any azimuth and elevation, but it leaves painter's
// order to the figure, and a figure ordered by eye at one camera is wrong
// at another. Here every part is an upright prism on a convex footprint,
// and any two parts are separated either by a horizontal plane (one stands
// on or above the other) or by a vertical one (their footprints are
// disjoint). Two convex solids whose pictures overlap are both crossed by
// some view ray, and a plane that separates them crosses that ray once, so
// the side of the plane the viewer is on says which is nearer, at every
// camera above the floor. Parts that move belong to a group with a declared
// travel, and a pair's plane is found from the whole space each can sweep,
// so it holds at every pose. Planes are found once; a frame only reads
// which side the viewer is on. The kit's own 3D mode solves the general
// problem at the cost of a 3,600 line runtime whose material styles use
// raw colours; a machine of upright prisms does not need it.

export interface Solid {
  id: string;
  /** Convex footprint at rest, in either winding. */
  ring: Plane[];
  z: number;
  h: number;
  tone?: Tone;
  crease?: Tone | "none";
  lit?: boolean;
  flat?: boolean;
  bevel?: number;
  className?: string;
  /** Lines drawn on this part at rest, painted with it, under its outline; they move with it. */
  marks?: (projection: Projection) => string;
  /**
   * A footprint with few points that encloses `ring`, used only to test
   * whether two pictures meet: a round part's 40 points cost the ordering
   * more than drawing it did. Enclosing can only add a pair to order, never
   * miss one. Defaults to `ring`.
   */
  bound?: Plane[];
  /** The moving group this part rides in; without one it never moves. */
  group?: string;
  /**
   * Parts this one is always drawn over where their pictures meet, for the
   * one arrangement no plane separates: a rod sliding into a wider sleeve
   * above it, where the sleeve hides the rod at every camera above it.
   */
  over?: string[];
}

/** How far a group may move from rest along each axis, in world units. */
export interface Travel {
  dx?: [number, number];
  dy?: [number, number];
  dz?: [number, number];
}

/** A group's place in one frame: its offset from rest, whether it shows, and a class it takes for the moment. */
export interface Pose {
  dx?: number;
  dy?: number;
  dz?: number;
  hidden?: boolean;
  className?: string;
}

export type Poses = Record<string, Pose>;

/** b is nearer than a when the viewer is on b's side: above for a horizontal plane, along `normal` for a vertical one. */
type Separation = { kind: "above" } | { kind: "below" } | { kind: "beside"; normal: Plane };

export interface Scene {
  solids: Solid[];
  travel: Record<string, Travel>;
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

function hullOf<T extends Flat | Plane>(points: T[]): T[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: T, a: T, b: T) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: T[]) => {
    const out: T[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
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

/** The space a part can occupy over its group's whole travel: its footprint swept and its height range. */
function envelopeOf(solid: Solid, travel: Record<string, Travel>, own: boolean) {
  const t = own || !solid.group ? {} : (travel[solid.group] ?? {});
  const [x0, x1] = t.dx ?? [0, 0];
  const [y0, y1] = t.dy ?? [0, 0];
  const [z0, z1] = t.dz ?? [0, 0];
  const offsets: Plane[] = [[x0, y0], [x0, y1], [x1, y0], [x1, y1]];
  const ring = x0 === x1 && y0 === y1 ? solid.ring.map(([x, y]) => [x + x0, y + y0] as Plane) : hullOf(offsets.flatMap(([ox, oy]) => solid.ring.map(([x, y]) => [x + ox, y + oy] as Plane)));
  return { ring, low: solid.z + z0, high: solid.z + solid.h + z1 };
}

function separationOf(a: Solid, b: Solid, travel: Record<string, Travel>): Separation | undefined {
  if (b.over?.includes(a.id)) return { kind: "above" };
  if (a.over?.includes(b.id)) return { kind: "below" };
  // Two parts in one group keep their places relative to each other.
  const together = a.group !== undefined && a.group === b.group;
  const ea = envelopeOf(a, travel, together);
  const eb = envelopeOf(b, travel, together);
  if (ea.high <= eb.low + CONTACT) return { kind: "above" };
  if (eb.high <= ea.low + CONTACT) return { kind: "below" };
  const normal = besideOf(ea.ring, eb.ring);
  if (!normal) {
    throw new Error(`${a.id} and ${b.id} can share height and footprint${a.group || b.group ? " somewhere on their travel" : ""}, so no plane separates them: move one, stack it on the other, or narrow the travel.`);
  }
  return { kind: "beside", normal };
}

/** Finds every pair's separating plane once, over every pose the travel allows, and refuses two parts that could pass through each other. */
export function sceneOf(solids: Solid[], travel: Record<string, Travel> = {}): Scene {
  const ids = new Set<string>();
  for (const solid of solids) {
    if (ids.has(solid.id)) throw new Error(`Two parts are named ${solid.id}; each needs its own name.`);
    ids.add(solid.id);
    if (solid.group && !travel[solid.group]) throw new Error(`${solid.id} rides in group ${solid.group}, which declares no travel.`);
  }
  const separations = solids.map((a, i) => solids.map((b, j) => (j > i ? separationOf(a, b, travel) : undefined)));
  return { solids, travel, separations };
}

/** A group's pose, refused when it leaves the travel its planes were found for. */
function poseOf(scene: Scene, solid: Solid, poses: Poses): Required<Pick<Pose, "dx" | "dy" | "dz">> & Pose {
  const pose = solid.group ? poses[solid.group] : undefined;
  const at = { dx: pose?.dx ?? 0, dy: pose?.dy ?? 0, dz: pose?.dz ?? 0 };
  if (solid.group) {
    const travel = scene.travel[solid.group]!;
    for (const axis of ["dx", "dy", "dz"] as const) {
      const [low, high] = travel[axis] ?? [0, 0];
      if (at[axis] < low - 1e-6 || at[axis] > high + 1e-6) {
        throw new Error(`Group ${solid.group} was posed at ${axis} ${at[axis]}, outside its travel ${low} to ${high}; its separating planes do not hold there.`);
      }
    }
  }
  return { ...pose, ...at };
}

/** +1 when b is nearer than a at this camera, -1 when a is, 0 when the plane is edge-on and the pictures cannot overlap. */
function nearer(separation: Separation, [vx, vy]: Plane): number {
  if (separation.kind === "above") return 1;
  if (separation.kind === "below") return -1;
  const side = separation.normal[0] * vx + separation.normal[1] * vy;
  return side > 1e-9 ? 1 : side < -1e-9 ? -1 : 0;
}

type Box = [number, number, number, number];

/** The kit's projection with the camera's sines worked out once per frame instead of once per point. */
function projector(projection: Projection) {
  const { sinA, cosA, sinE, cosE, k: scale } = k.cameraOf(projection);
  const [ox, oy] = projection.origin;
  return (x: number, y: number, z: number): Flat => [ox + (x * sinA - y * cosA) * scale, oy + ((x * cosA + y * sinA) * sinE - z * cosE) * scale];
}

/** A solid's picture at its pose, enclosed: the hull of its bound's top and bottom, which contains what the kit fills. */
function pictureOf(solid: Solid, pose: { dx: number; dy: number; dz: number }, project: (x: number, y: number, z: number) => Flat): { hull: Flat[]; box: Box } {
  const z0 = solid.z + pose.dz;
  const z1 = z0 + solid.h;
  const points = (solid.bound ?? solid.ring).flatMap(([x, y]) => [project(x + pose.dx, y + pose.dy, z0), project(x + pose.dx, y + pose.dy, z1)]);
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

/**
 * The parts showing at this pose, back to front. Only pairs whose pictures
 * share area are ordered; the rest keep the order of their centres' depth.
 * `forced` counts picks made to break a cycle, which separating planes rule
 * out for these parts; a test holds it at zero across the figure's story.
 */
export function orderOf(scene: Scene, projection: Projection, poses: Poses = {}): { order: number[]; forced: number } {
  const { solids, separations } = scene;
  const view = k.towardViewer(projection);
  const project = projector(projection);
  const posed = solids.map((solid) => poseOf(scene, solid, poses));
  const showing = solids.map((_, index) => index).filter((index) => !posed[index]!.hidden);
  const pictures = new Map(showing.map((index) => [index, pictureOf(solids[index]!, posed[index]!, project)]));
  const after = new Map<number, number[]>(showing.map((index) => [index, []]));
  const waiting = new Map<number, number>(showing.map((index) => [index, 0]));
  for (let a = 0; a < showing.length; a++) {
    for (let b = a + 1; b < showing.length; b++) {
      const [i, j] = [showing[a]!, showing[b]!];
      const [pi, pj] = [pictures.get(i)!, pictures.get(j)!];
      if (!boxesMeet(pi.box, pj.box) || !picturesMeet(pi.hull, pj.hull)) continue;
      const sign = nearer(separations[i]![j]!, view);
      if (sign > 0) { after.get(i)!.push(j); waiting.set(j, waiting.get(j)! + 1); }
      else if (sign < 0) { after.get(j)!.push(i); waiting.set(i, waiting.get(i)! + 1); }
    }
  }
  const depth = new Map(showing.map((index) => {
    const solid = solids[index]!;
    const pose = posed[index]!;
    const [sx, sy] = solid.ring.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
    return [index, k.depthOf([sx / solid.ring.length + pose.dx, sy / solid.ring.length + pose.dy, solid.z + pose.dz + solid.h / 2], projection)];
  }));
  const ready = showing.filter((index) => waiting.get(index) === 0);
  const placed = new Set<number>();
  const order: number[] = [];
  let forced = 0;
  while (order.length < showing.length) {
    if (!ready.length) {
      forced++;
      const pick = showing.filter((index) => !placed.has(index)).sort((a, b) => waiting.get(a)! - waiting.get(b)! || depth.get(a)! - depth.get(b)!)[0]!;
      waiting.set(pick, 0);
      ready.push(pick);
    }
    ready.sort((a, b) => depth.get(b)! - depth.get(a)!);
    const next = ready.pop()!;
    if (placed.has(next)) continue;
    placed.add(next);
    order.push(next);
    for (const later of after.get(next)!) {
      waiting.set(later, waiting.get(later)! - 1);
      if (waiting.get(later) === 0 && !placed.has(later)) ready.push(later);
    }
  }
  return { order, forced };
}

/**
 * One part's markup at a camera and pose. A part is moved by moving the
 * projection's origin, which draws exactly what translating it would, marks
 * included, without rebuilding its geometry.
 */
export function solidOf(solid: Solid, projection: Projection, pose: Pose = {}): string {
  const shift = k.iso([pose.dx ?? 0, pose.dy ?? 0, pose.dz ?? 0], { ...projection, origin: [0, 0] });
  const at: Projection = { ...projection, origin: [projection.origin[0] + shift[0], projection.origin[1] + shift[1]] };
  const paths = k.extrude(solid.ring, solid.z, solid.h, at, { convex: true, bevel: solid.bevel });
  const className = [solid.className, pose.className].filter(Boolean).join(" ") || undefined;
  return k.solidSvg(paths, { tone: solid.tone, crease: solid.crease, lit: solid.lit, flat: solid.flat, className, inner: solid.marks?.(at) ?? "" });
}

const wrap = (solid: Solid, markup: string, hidden: boolean) => `<g data-solid="${solid.id}"${hidden ? " data-hidden=\"\"" : ""}>${markup}</g>`;

/** The whole machine at this camera and pose, back to front, each part in its own group so a painter can update it alone. */
export function paint(scene: Scene, projection: Projection, poses: Poses = {}): string {
  const { order } = orderOf(scene, projection, poses);
  const shown = new Set(order);
  return [
    ...order.map((index) => { const solid = scene.solids[index]!; return wrap(solid, solidOf(solid, projection, poseOf(scene, solid, poses)), false); }),
    ...scene.solids.filter((_, index) => !shown.has(index)).map((solid) => wrap(solid, "", true)),
  ].join("");
}

/**
 * Keeps a painted machine in the page up to date: each part's group is
 * rewritten only when its markup changed, and the groups are re-stacked
 * only when the order did. With the camera still, a frame costs only the
 * parts that moved. Every line stays drawn while the camera moves: leaving
 * the fine ones out made each move start and end with a visible change of
 * detail, which read as the drawing being replaced (Storm, 23 October 2026).
 */
export function painter(root: SVGGElement, scene: Scene) {
  const nodes = new Map<string, SVGGElement>();
  const drawn = new Map<string, string>();
  for (const solid of scene.solids) {
    let node = root.querySelector<SVGGElement>(`[data-solid="${solid.id}"]`);
    if (!node) {
      node = document.createElementNS("http://www.w3.org/2000/svg", "g");
      node.setAttribute("data-solid", solid.id);
      root.appendChild(node);
    }
    nodes.set(solid.id, node);
    drawn.set(solid.id, node.innerHTML);
  }
  let stacked = "";
  // What each part was last drawn at, so a part that neither the camera nor
  // its own pose moved is not rebuilt.
  const at = new Map<string, string>();
  return (projection: Projection, poses: Poses = {}) => {
    const { order } = orderOf(scene, projection, poses);
    const shown = new Set(order);
    const camera = `${projection.origin.join(",")}|${projection.scale}|${projection.azimuth}|${projection.elevation}`;
    scene.solids.forEach((solid, index) => {
      const node = nodes.get(solid.id)!;
      const hidden = !shown.has(index);
      node.toggleAttribute("data-hidden", hidden);
      if (hidden) return;
      const pose = poseOf(scene, solid, poses);
      const key = `${camera}|${pose.dx},${pose.dy},${pose.dz},${pose.className ?? ""}`;
      if (at.get(solid.id) === key) return;
      at.set(solid.id, key);
      const markup = solidOf(solid, projection, pose);
      if (drawn.get(solid.id) !== markup) {
        node.innerHTML = markup;
        drawn.set(solid.id, markup);
      }
    });
    const key = order.join(",");
    if (key !== stacked) {
      for (const index of order) root.appendChild(nodes.get(scene.solids[index]!.id)!);
      stacked = key;
    }
  };
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
