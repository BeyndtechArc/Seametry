import type { ReactNode } from "react";
import styles from "./plates.module.css";

type Point = readonly [x: number, y: number, z: number];
type Size = readonly [width: number, depth: number, height: number];

// Isometric: the floor's x axis runs down-right, its y axis down-left, z up.
// Faces at +x and +y face the reader, so painting back-to-front by x + y
// lets flat paper faces hide whatever stands behind them.
const cos30 = Math.sqrt(3) / 2;

function screen([x, y, z]: Point): readonly [number, number] {
  return [(x - y) * cos30, (x + y) / 2 - z];
}

function project(point: Point): string {
  const [sx, sy] = screen(point);
  return `${sx.toFixed(1)},${sy.toFixed(1)}`;
}

function polygon(corners: Point[]): string {
  return corners.map(project).join(" ");
}

function segment(from: Point, to: Point): string {
  return `M${project(from)}L${project(to)}`;
}

// Tone comes from line, as on an engraved certificate: the right-hand face of
// a paper block is hatched, so the volume reads without a fill or shadow.
const hatchPitch = 3;

function Block({ at: [x, y, z], size: [w, d, h], solid = false }: { at: Point; size: Size; solid?: boolean }) {
  const top = z + h;
  const hatch = solid
    ? ""
    : Array.from({ length: Math.max(0, Math.ceil(h / hatchPitch) - 1) }, (_, step) => {
        const level = z + (step + 1) * hatchPitch;
        return segment([x + w, y, level], [x + w, y + d, level]);
      }).join("");
  const seam = Math.min(w, d) / 5;
  return (
    <g className={solid ? styles.solid : styles.paper} data-solid={solid || undefined}>
      <polygon className={styles.side} points={polygon([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, top], [x + w, y, top]])} />
      {hatch ? <path className={styles.hatch} d={hatch} /> : null}
      <polygon className={styles.side} points={polygon([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, top], [x, y + d, top]])} />
      <polygon className={styles.top} points={polygon([[x, y, top], [x + w, y, top], [x + w, y + d, top], [x, y + d, top]])} />
      {solid ? (
        <polygon className={styles.seam} points={polygon([[x + seam, y + seam, top], [x + w - seam, y + seam, top], [x + w - seam, y + d - seam, top], [x + seam, y + d - seam, top]])} />
      ) : null}
    </g>
  );
}

function Trace({ through }: { through: Point[] }) {
  const ends = [through[0], through[through.length - 1]].map(screen);
  return (
    <g>
      <polyline className={styles.trace} points={polygon(through)} />
      {ends.map(([sx, sy], index) => <circle key={index} className={styles.node} cx={sx.toFixed(1)} cy={sy.toFixed(1)} r="1.8" />)}
    </g>
  );
}

// A sealed case drawn as dashed edges only, so the Formula inside stays in view.
function Vitrine({ at: [x, y, z], size: [w, d, h] }: { at: Point; size: Size }) {
  const top = z + h;
  const corners: Point[] = [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]];
  return (
    <path
      className={styles.vitrine}
      d={[
        ...corners.map(([cx, cy]) => segment([cx, cy, z], [cx, cy, top])),
        `M${polygon([[x, y, top], [x + w, y, top], [x + w, y + d, top], [x, y + d, top]]).replaceAll(" ", "L")}Z`,
      ].join("")}
    />
  );
}

function Bound({ at: [x, y, z], size: [w, d] }: { at: Point; size: readonly [number, number] }) {
  return <polygon className={styles.trace} points={polygon([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]])} />;
}

function Refusal({ at: [x, y, z] }: { at: Point }) {
  const r = 5;
  return (
    <path
      className={styles.refusal}
      d={`M${project([x - r, y, z])}L${project([x + r, y, z])}M${project([x, y - r, z])}L${project([x, y + r, z])}`}
    />
  );
}

// A note lies on the floor. Along x it reads down and to the right; along y
// it reads up and to the right, so neither direction is ever upside down.
function Note({ at, along, recorded = false, children }: { at: Point; along: "x" | "y"; recorded?: boolean; children: string }) {
  const [sx, sy] = screen(at).map((value) => value.toFixed(1));
  const plane = along === "x" ? `${cos30} 0.5 ${-cos30} 0.5` : `${cos30} -0.5 ${cos30} 0.5`;
  return (
    <text className={recorded ? styles.recorded : styles.note} transform={`matrix(${plane} ${sx} ${sy})`}>
      {children}
    </text>
  );
}

function Drawing({ children }: { children: ReactNode }) {
  return (
    <svg className={styles.drawing} viewBox="-160 -96 320 192" aria-hidden="true">
      {children}
    </svg>
  );
}

function Keyless() {
  return (
    <Drawing>
      <Block at={[24, -124, 0]} size={[24, 24, 18]} />
      <Note at={[-62, -106, 0]} along="x">instruction</Note>
      <Trace through={[[36, -100, 0], [36, -58, 0]]} />
      <Refusal at={[36, -52, 0]} />
      <Note at={[44, -46, 0]} along="x">no path</Note>
      <Bound at={[-44, -44, 0]} size={[88, 88]} />
      <Vitrine at={[-38, -38, 0]} size={[76, 76, 52]} />
      <Block at={[-30, -30, 0]} size={[60, 60, 8]} />
      <Block at={[-18, -18, 8]} size={[36, 36, 34]} solid />
      <Note at={[-40, 54, 0]} along="x">fixed formula</Note>
      <Block at={[-104, 30, 0]} size={[24, 24, 16]} />
      <Note at={[-100, 64, 0]} along="x">any wallet</Note>
      <Trace through={[[-80, 42, 0], [-60, 42, 0], [-60, 20, 0], [-44, 20, 0]]} />
    </Drawing>
  );
}

function Graded() {
  const lot = [
    ["grade", 12],
    ["issuer", 3],
    ["ticker", 3],
    ["price", 3],
  ] as const;
  return (
    <Drawing>
      <Block at={[64, -40, 0]} size={[44, 44, 8]} />
      <Block at={[72, -32, 8]} size={[28, 28, 40]} solid />
      <Trace through={[[-120, -8, 0], [64, -8, 0]]} />
      {lot.map(([label, height], index) => (
        <g key={label}>
          {index === 0 ? (
            <Block at={[-120 + index * 44, -20, 0]} size={[28, 24, height]} />
          ) : (
            <Bound at={[-120 + index * 44, -20, 0]} size={[28, 24]} />
          )}
          <Note at={[-120 + index * 44, 14, 0]} along="x">{label}</Note>
        </g>
      ))}
      <Note at={[-120, 28, 0]} along="x" recorded>read first</Note>
      <Note at={[64, 14, 0]} along="x">share</Note>
    </Drawing>
  );
}

function Powers() {
  const post: Size = [26, 26, 16];
  return (
    <Drawing>
      <Trace through={[[0, -78, 0], [0, -24, 0]]} />
      <Trace through={[[-78, 0, 0], [-24, 0, 0]]} />
      <Block at={[-13, -104, 0]} size={post} />
      <Note at={[26, -70, 0]} along="y">freeze</Note>
      <Block at={[-104, -13, 0]} size={post} />
      <Note at={[-104, 25, 0]} along="x">gate</Note>
      <Block at={[-24, -24, 0]} size={[48, 48, 6]} />
      <Block at={[-14, -14, 6]} size={[28, 28, 30]} solid />
      <Trace through={[[0, 24, 0], [0, 78, 0]]} />
      <Trace through={[[24, 0, 0], [78, 0, 0]]} />
      <Block at={[78, -13, 0]} size={post} />
      <Note at={[78, 24, 0]} along="x">pause</Note>
      <Block at={[-13, 78, 0]} size={post} />
      <Note at={[-13, 116, 0]} along="x">seize</Note>
    </Drawing>
  );
}

function Claims() {
  const legs = [-92, -20, 52] as const;
  return (
    <Drawing>
      <Block at={[-40, -110, 0]} size={[80, 40, 8]} />
      <Block at={[-14, -104, 8]} size={[28, 28, 26]} solid />
      <Note at={[-40, -62, 0]} along="x">melt</Note>
      {legs.map((x) => (
        <Trace key={x} through={[[0, -70, 0], [0, -40, 0], [x + 20, -40, 0], [x + 20, 20, 0]]} />
      ))}
      <Block at={[legs[0], 20, 0]} size={[40, 40, 10]} />
      <Note at={[legs[0], 74, 0]} along="x">claim</Note>
      <Bound at={[legs[1], 20, 0]} size={[40, 40]} />
      <Refusal at={[legs[1] + 20, 40, 0]} />
      <Note at={[legs[1], 74, 0]} along="x">frozen leg</Note>
      <Note at={[legs[1], 88, 0]} along="x" recorded>claim recorded</Note>
      <Block at={[legs[2], 20, 0]} size={[40, 40, 10]} />
      <Note at={[legs[2], 74, 0]} along="x">claim</Note>
    </Drawing>
  );
}

function Strike() {
  return (
    <Drawing>
      <Block at={[-24, -116, 0]} size={[26, 26, 20]} />
      <Note at={[16, -86, 0]} along="y">constituent</Note>
      <Block at={[-116, -24, 0]} size={[26, 26, 20]} />
      <Note at={[-116, 10, 0]} along="x">constituent</Note>
      <Trace through={[[-11, -90, 0], [-11, -11, 0], [24, -11, 0]]} />
      <Trace through={[[-90, -11, 0], [-30, -11, 0], [-30, 40, 0], [24, 40, 0]]} />
      <Note at={[-22, 48, 0]} along="x">strike</Note>
      <Block at={[24, -24, 0]} size={[80, 80, 8]} />
      <Block at={[48, 0, 8]} size={[32, 32, 44]} solid />
      <Note at={[24, 66, 0]} along="x">share, fixed formula</Note>
    </Drawing>
  );
}

const drawings = { keyless: Keyless, graded: Graded, powers: Powers, claims: Claims, strike: Strike } as const;

export type MechanismKind = keyof typeof drawings;

export function MechanismDrawing({ kind }: { kind: MechanismKind }) {
  const Kind = drawings[kind];
  return <Kind />;
}

/** components.md, Mechanism plate. */
export function MechanismPlate({ kind, index, subject, title, children }: { kind: MechanismKind; index: number; subject: string; title: string; children: ReactNode }) {
  return (
    <article className={styles.plate} data-testid="mechanism-plate">
      <span className={styles.label}>
        <span className={styles.index}>{String(index).padStart(2, "0")}</span>
        {subject}
      </span>
      <MechanismDrawing kind={kind} />
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
