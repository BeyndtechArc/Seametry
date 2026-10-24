import { expect, test } from "@playwright/test";
import * as k from "../src/lib/iso/iso-kit";
import { blend, orderOf, projectionOf, sceneOf, type Poses, type Solid } from "../src/lib/iso/scene";
import { HEIGHT, MOVE, SCENE, STILL, STOPS, WIDTH, calloutPath, movingPoses } from "../src/app/components/figures/hall-line/geometry";

// Pure geometry: no build, no browser. The landing's assay line is drawn
// from any camera, at every pose of its story, by lib/iso/scene.ts, which
// orders parts by the planes that separate them; these hold that order, the
// story and the tour's framing to account.

const box = (id: string, x: number, y: number, w: number, d: number, z: number, h: number, extra: Partial<Solid> = {}): Solid => ({ id, ring: k.ringOf({ x, y, w, d, r: 0 }, 1), z, h, ...extra });
const ids = (solids: Solid[], order: number[]) => order.map((index) => solids[index]!.id);

/** Every frame of the tour at `steps` per second: each station's hold, then its move to the next. */
function* tour(steps: number) {
  for (let stop = 0; stop < STOPS.length; stop++) {
    const here = STOPS[stop]!;
    const next = STOPS[(stop + 1) % STOPS.length]!;
    for (let i = 0; i <= here.hold * steps; i++) yield { where: `${here.name} hold ${(i / steps).toFixed(2)}s`, station: here.station, poses: here.poses(i / steps) };
    for (let i = 0; i <= MOVE * steps; i++) yield { where: `${here.name} to ${next.name} ${(i / steps).toFixed(2)}s`, station: blend(here.station, next.station, i / steps / MOVE), poses: movingPoses(stop, i / steps) };
  }
}

const shown = (poses: Poses, group: string) => !poses[group]?.hidden;
/** Two pose sets that place every group alike, whichever way each spells rest. */
function expectSamePlaces(actual: Poses, expected: Poses) {
  const place = (pose: Poses[string] | undefined) => (pose?.hidden ? "hidden" : `${pose?.dx ?? 0},${pose?.dy ?? 0},${pose?.dz ?? 0},${pose?.className ?? ""}`);
  for (const group of new Set([...Object.keys(actual), ...Object.keys(expected)])) expect(place(actual[group]), group).toBe(place(expected[group]));
}

test("a part standing on another is drawn after it, and of two side by side the nearer one last", () => {
  // Listed both ways round: the lid after its base, the foot before it.
  const solids = [box("foot", 2, 2, 6, 6, -4, 4), box("lid", 0, 0, 10, 10, 10, 2), box("near", 20, 0, 10, 10, 0, 10), box("base", 0, 0, 10, 10, 0, 10)];
  const scene = sceneOf(solids);
  // From +x the part at x 20 is nearer; from -x the one at x 0 is.
  const fromPlusX = ids(solids, orderOf(scene, { origin: [200, 200], scale: 4, azimuth: 20, elevation: 30 }).order);
  expect(fromPlusX.indexOf("foot")).toBeLessThan(fromPlusX.indexOf("base"));
  expect(fromPlusX.indexOf("base")).toBeLessThan(fromPlusX.indexOf("lid"));
  expect(fromPlusX.indexOf("base")).toBeLessThan(fromPlusX.indexOf("near"));
  const fromMinusX = ids(solids, orderOf(scene, { origin: [200, 200], scale: 4, azimuth: 160, elevation: 30 }).order);
  expect(fromMinusX.indexOf("near")).toBeLessThan(fromMinusX.indexOf("base"));
  expect(fromMinusX.indexOf("foot")).toBeLessThan(fromMinusX.indexOf("base"));
  expect(fromMinusX.indexOf("base")).toBeLessThan(fromMinusX.indexOf("lid"));
});

test("two parts that pass through each other are refused by name, at rest or anywhere on their travel", () => {
  expect(() => sceneOf([box("ram", 0, 0, 10, 10, 0, 10), box("column", 5, 5, 10, 10, 4, 10)])).toThrow(/ram and column can share height and footprint, so/);
  // Apart at rest, but the slider's travel carries it into the post.
  const slider = box("slider", 0, 0, 4, 4, 0, 4, { group: "slide" });
  expect(() => sceneOf([slider, box("post", 10, 0, 4, 4, 0, 10)], { slide: { dx: [0, 8] } })).toThrow(/slider and post can share height and footprint somewhere on their travel/);
  expect(() => sceneOf([slider, box("post", 10, 0, 4, 4, 0, 10)], { slide: { dx: [0, 5] } })).not.toThrow();
});

test("a pose outside its group's travel is refused, since the planes were found for the travel alone", () => {
  const scene = sceneOf([box("slider", 0, 0, 4, 4, 0, 4, { group: "slide" })], { slide: { dx: [0, 5] } });
  expect(() => orderOf(scene, { origin: [0, 0], scale: 1 }, { slide: { dx: 6 } })).toThrow(/slide was posed at dx 6, outside its travel 0 to 5/);
});

test("the assay line is ordered without a forced pick at every frame of its story and tour", () => {
  let frames = 0;
  for (const { where, station, poses } of tour(20)) {
    expect(orderOf(SCENE, projectionOf(station), poses).forced, where).toBe(0);
    frames++;
  }
  expect(frames).toBeGreaterThan(500);
});

test("the story is the Hall's: a Strike spends one of each constituent and strikes a share, a Melt delivers every leg but the frozen one, and the tour ends where it began", () => {
  const [formula, strike, freeze, melt] = STOPS;
  const start = formula!.poses(0);
  const struck = strike!.poses(strike!.hold);
  for (const leg of [0, 1, 2]) {
    expect(shown(start, `ingot-${leg}`), `leg ${leg} in the wallet before the Strike`).toBe(true);
    expect(shown(struck, `ingot-${leg}`), `leg ${leg} spent by the Strike`).toBe(false);
  }
  expect([shown(start, "share-new"), shown(struck, "share-new")]).toEqual([false, true]);

  const frozen = freeze!.poses(freeze!.hold);
  expect(frozen["blade-2"]).toEqual({ dz: -13, className: "frozen" });
  expect(shown(frozen, "padlock")).toBe(true);

  const melted = melt!.poses(melt!.hold);
  expect(shown(melted, "share-new"), "the Melt returns the share").toBe(false);
  expect([0, 1, 2].map((leg) => shown(melted, `ingot-${leg}`)), "every leg but the frozen one delivered").toEqual([true, true, false]);
  expect([0, 1, 2].map((leg) => shown(melted, `claim-${leg}`)), "only the frozen leg's Claim remains").toEqual([false, false, true]);
  expect(melted["claim-2"]?.className).toBe("frozen");
  expectSamePlaces(STILL.poses, melted);

  expectSamePlaces(movingPoses(3, MOVE), start);
});

test("every station keeps the machine clear of the figure's left and top edges, and its callouts inside it", () => {
  const points = SCENE.solids.flatMap((solid) => solid.ring.flatMap(([x, y]) => [[x, y, solid.z], [x, y, solid.z + solid.h]] as k.Point3[]));
  for (const stop of STOPS) {
    const P = projectionOf(stop.station);
    const flat = points.map((point) => k.iso(point, P));
    expect(Math.min(...flat.map(([x]) => x)), `${stop.name} left`).toBeGreaterThanOrEqual(11.9);
    expect(Math.min(...flat.map(([, y]) => y)), `${stop.name} top`).toBeGreaterThanOrEqual(11.9);
    for (const callout of stop.callouts) {
      const { plate } = calloutPath(callout, P);
      for (const [x, y] of plate) {
        expect(x, `${stop.name}: "${callout.text}"`).toBeGreaterThanOrEqual(0);
        expect(x, `${stop.name}: "${callout.text}"`).toBeLessThanOrEqual(WIDTH);
        expect(y, `${stop.name}: "${callout.text}"`).toBeGreaterThanOrEqual(0);
        expect(y, `${stop.name}: "${callout.text}"`).toBeLessThanOrEqual(HEIGHT);
      }
    }
  }
});
