// components.md, ASCII picture. Each business under an Opened Alloy leg,
// drawn in characters from geometry rather than traced from a photograph
// (Storm, 25 October 2026: a photograph written in characters read as a
// copy of the photograph). A scene is a grid of characters plus the cells
// that are lit, an LED, a window, a lamp, which blink on the page.

export const SCENE_COLS = 70;
export const SCENE_ROWS = 21;

export type Scene = { rows: string[]; lit: ReadonlySet<number> };
export type SceneName = "serverRacks" | "siliconWafer" | "glassTowers" | "robotArm" | "warehouseAisle";

type Grid = { cells: string[][]; lit: Set<number> };

function grid(): Grid {
  return { cells: Array.from({ length: SCENE_ROWS }, () => Array.from({ length: SCENE_COLS }, () => " ")), lit: new Set() };
}

function put(g: Grid, x: number, y: number, character: string, lit = false) {
  const col = Math.round(x);
  const row = Math.round(y);
  if (col < 0 || col >= SCENE_COLS || row < 0 || row >= SCENE_ROWS) return;
  g.cells[row][col] = character;
  if (lit) g.lit.add(row * SCENE_COLS + col);
  else g.lit.delete(row * SCENE_COLS + col);
}

function write(g: Grid, x: number, y: number, text: string) {
  Array.from(text).forEach((character, index) => put(g, x + index, y, character));
}

/**
 * The stroke for a direction as the eye sees it: a cell is 0.6 as wide as
 * it is tall, so a run of one column and one row is far from 45 degrees.
 */
function stroke(dx: number, dy: number) {
  const degrees = (Math.atan2(dy * 10, dx * 6) * 180) / Math.PI;
  const folded = ((degrees % 180) + 180) % 180;
  if (folded < 22.5 || folded >= 157.5) return "-";
  if (folded < 67.5) return "\\";
  if (folded < 112.5) return "|";
  return "/";
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, character?: string) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const mark = character ?? stroke(x1 - x0, y1 - y0);
  for (let step = 0; step <= steps; step++) put(g, x0 + ((x1 - x0) * step) / steps, y0 + ((y1 - y0) * step) / steps, mark);
}

function box(g: Grid, x: number, y: number, w: number, h: number) {
  line(g, x + 1, y, x + w - 2, y, "-");
  line(g, x + 1, y + h - 1, x + w - 2, y + h - 1, "-");
  line(g, x, y + 1, x, y + h - 2, "|");
  line(g, x + w - 1, y + 1, x + w - 1, y + h - 2, "|");
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) put(g, cx, cy, "+");
}

/** A repeatable choice per cell, so a scene is the same on every render. */
function chance(x: number, y: number, salt: number) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Three cabinets of units, each with its drive bays and status lights. */
function serverRacks(g: Grid) {
  for (const left of [2, 25, 48]) {
    box(g, left, 0, 21, 19);
    write(g, left + 2, 1, "=================");
    for (let y = 3; y <= 16; y += 2) {
      write(g, left + 2, y, "[:::::::::::]");
      for (const [index, x] of [left + 16, left + 18].entries()) {
        put(g, x, y, "o", chance(x, y, index) < 0.45);
      }
    }
  }
  line(g, 0, 19, SCENE_COLS - 1, 19, "=");
  for (let x = 1; x < SCENE_COLS; x += 6) put(g, x, 20, "/");
}

/** A wafer of dies under a test probe, its notch at the foot. */
function siliconWafer(g: Grid) {
  const cx = 30;
  const cy = 10;
  const ry = 9.6;
  const rx = (ry * 10) / 6;
  const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < SCENE_ROWS; y++) {
    for (let x = 0; x < SCENE_COLS; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) put(g, x, y, stroke(-(y - cy) / ry, (x - cx) / rx));
      else if (x % 5 === 0 && y % 2 === 0) put(g, x, y, "+");
      else if (x % 5 === 0) put(g, x, y, "|");
      else if (y % 2 === 0) put(g, x, y, "-");
      else if (chance(x, y, 7) < 0.05) put(g, x, y, "#", true);
    }
  }
  put(g, cx, cy + ry, "^");
  // The tester on the right, its post and arm reaching over the wafer, the
  // needle down to one die.
  box(g, 57, 12, 12, 7);
  write(g, 59, 14, "[::::]");
  put(g, 66, 14, "o", true);
  write(g, 59, 16, "========");
  line(g, 62, 11, 62, 2, "|");
  line(g, 39, 1, 62, 1, "=");
  put(g, 62, 1, "+");
  line(g, 39, 2, 39, 4, "|");
  put(g, 39, 5, "v", true);
  line(g, 0, 20, SCENE_COLS - 1, 20, "_");
}

/** Towers of glass against an empty sky, a few windows lit late. */
function glassTowers(g: Grid) {
  const towers = [
    { x: 1, w: 9, top: 9 },
    { x: 11, w: 12, top: 4 },
    { x: 24, w: 8, top: 7 },
    { x: 33, w: 13, top: 1 },
    { x: 47, w: 9, top: 6 },
    { x: 57, w: 12, top: 3 },
  ];
  for (const tower of towers) {
    box(g, tower.x, tower.top, tower.w, 20 - tower.top);
    for (let y = tower.top + 2; y < 18; y += 2) {
      for (let x = tower.x + 2; x < tower.x + tower.w - 2; x += 2) {
        const lit = chance(x, y, 3) < 0.12;
        put(g, x, y, lit ? "#" : ".", lit);
      }
    }
  }
  put(g, 39, 0, "*", true);
  line(g, 0, 20, SCENE_COLS - 1, 20, "_");
}

/** An arm on its base lowering its gripper over a line of cartons. */
function robotArm(g: Grid) {
  line(g, 0, 17, SCENE_COLS - 1, 17, "=");
  for (let x = 2; x < SCENE_COLS; x += 6) put(g, x, 18, "O");
  line(g, 0, 19, SCENE_COLS - 1, 19, "-");
  const shoulder = [18, 12] as const;
  const elbow = [28, 3] as const;
  const wrist = [46, 3] as const;
  for (const x of [3, wrist[0] - 4, 58]) {
    write(g, x, 14, "+------+");
    write(g, x, 15, "|      |");
    write(g, x, 16, "+------+");
  }
  write(g, 13, 16, "/__________\\");
  write(g, 14, 15, "|  ====  |");
  put(g, 21, 15, "o", true);
  write(g, 15, 14, "/______\\");
  write(g, 16, 13, "|____|");
  // The upper arm is two parallel strokes, a beam rather than a wire; the
  // forearm runs level, since a shallow slope breaks into a staircase.
  for (const offset of [0, 1]) line(g, shoulder[0] + offset, shoulder[1] - 1, elbow[0] + offset, elbow[1] + 1);
  line(g, elbow[0] + 3, elbow[1], wrist[0] - 2, wrist[1], "=");
  write(g, shoulder[0] - 1, shoulder[1], "(O)");
  write(g, elbow[0], elbow[1], "(O)");
  write(g, wrist[0] - 1, wrist[1], "(O)");
  line(g, wrist[0], wrist[1] + 1, wrist[0], wrist[1] + 7, "|");
  write(g, wrist[0] - 2, wrist[1] + 8, "<-+->");
  put(g, wrist[0], wrist[1] + 8, "+", true);
}

/**
 * An aisle between two runs of shelving to an end wall, lamps down its
 * middle. The runs stop well short of the vanishing point: drawn further,
 * their levels closed to a row apart and the far bays became a tangle.
 */
function warehouseAisle(g: Grid) {
  const vx = 35;
  const vy = 9;
  const far = 0.6;
  const toward = (x: number, y: number, t: number) => [x + (vx - x) * t, y + (vy - y) * t] as const;
  const levels = [0, 5, 10, 15, 20];
  const uprights = [0.16, 0.34, 0.48, far];
  for (const side of [-1, 1]) {
    const near = side < 0 ? 0 : SCENE_COLS - 1;
    for (const level of levels) {
      const [fx, fy] = toward(near, level, far);
      line(g, near, level, fx, fy);
    }
    for (const t of uprights) {
      const [x, topY] = toward(near, 0, t);
      const [, footY] = toward(near, 20, t);
      line(g, x, topY + 1, x, footY - 1, "|");
    }
    // A carton sits on a shelf, the row above the next level's line, in the
    // middle of a bay.
    for (let bay = 0; bay < uprights.length - 1; bay++) {
      const t = (uprights[bay] + uprights[bay + 1]) / 2;
      for (const level of levels.slice(1)) {
        if (chance(bay, level, side + 2) < 0.3) continue;
        const [x, y] = toward(near, level, t);
        write(g, x - 2, y - 1, "[##]");
      }
    }
  }
  const [left, top] = toward(0, 0, far);
  const [right, foot] = toward(SCENE_COLS - 1, 20, far);
  line(g, left, top, right, top, "-");
  line(g, left, foot, right, foot, "_");
  write(g, vx - 3, foot - 3, "+----+");
  write(g, vx - 3, foot - 2, "|    |");
  write(g, vx - 3, foot - 1, "|    |");
  for (const t of [0.25, 0.55, 0.85]) {
    const [, y] = toward(vx, 20, t * far);
    put(g, vx, y, ".");
  }
  for (const t of [0.3, 0.65]) {
    const [, y] = toward(vx, 0, t * far);
    put(g, vx, y, "*", true);
  }
}

export const sceneAlt: Record<SceneName, string> = {
  serverRacks: "Three server cabinets, drawn in characters",
  siliconWafer: "A silicon wafer of chip dies under a test probe, drawn in characters",
  glassTowers: "Office towers with a few windows lit, drawn in characters",
  robotArm: "An industrial robot arm over a conveyor of cartons, drawn in characters",
  warehouseAisle: "A warehouse aisle between shelves of cartons, drawn in characters",
};

const draw: Record<SceneName, (g: Grid) => void> = { serverRacks, siliconWafer, glassTowers, robotArm, warehouseAisle };

export function scene(name: SceneName): Scene {
  const g = grid();
  draw[name](g);
  return { rows: g.cells.map((row) => row.join("")), lit: g.lit };
}
