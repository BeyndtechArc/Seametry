import { expect, test } from "@playwright/test";
import * as k from "../src/lib/iso/iso-kit";
import { blend, orderOf, projectionOf, sceneOf, type Solid } from "../src/lib/iso/scene";
import { HEIGHT, SCENE, STOPS, WIDTH, calloutPath } from "../src/app/components/figures/hall-line/geometry";

// Pure geometry: no build, no browser. The landing's assay line is drawn
// from any camera by lib/iso/scene.ts, which orders parts by the planes that
// separate them; these hold that order and the tour's framing to account.

const box = (id: string, x: number, y: number, w: number, d: number, z: number, h: number): Solid => ({ id, ring: k.ringOf({ x, y, w, d, r: 0 }, 1), z, h });
const ids = (solids: Solid[], order: number[]) => order.map((index) => solids[index]!.id);

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

test("two parts that pass through each other are refused by name", () => {
  expect(() => sceneOf([box("ram", 0, 0, 10, 10, 0, 10), box("column", 5, 5, 10, 10, 4, 10)])).toThrow(/ram and column share height and footprint/);
});

test("the assay line is ordered without a forced pick from every camera of its tour", () => {
  let frames = 0;
  for (let stop = 0; stop < STOPS.length; stop++) {
    for (let step = 0; step <= 120; step++) {
      const P = projectionOf(blend(STOPS[stop]!.station, STOPS[(stop + 1) % STOPS.length]!.station, step / 120));
      expect(orderOf(SCENE, P).forced, `${STOPS[stop]!.name}, ${step}/120 of the way to the next station`).toBe(0);
      frames++;
    }
  }
  expect(frames).toBe(STOPS.length * 121);
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
