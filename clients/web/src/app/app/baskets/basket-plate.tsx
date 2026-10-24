"use client";

// A client component so a server page sends the plate as its code and
// members, not as its engraving: rendered on the server, each plate was sent
// twice, in the HTML and again in the React payload, and the landing with
// four plates weighed 475,087 bytes against 388,775 this way (production
// build, 24 October 2026).
import styles from "./basket-plate.module.css";

export type PlateMember = { symbol: string; admitted: boolean };

const C = 50;
const RING = 33;
const NODE = 8.5;

// FNV-1a over the basket code: a stable seed, so a basket's plate never
// changes between renders or deployments unless its code does.
function seed(code: string) {
  let hash = 2166136261;
  for (const character of code) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

const at = (radius: number, degrees: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(radians), C + radius * Math.sin(radians)] as const;
};

const fixed = (value: number) => value.toFixed(2);

function polygon(sides: number, radius: number, turn: number) {
  return Array.from({ length: sides }, (_, index) => at(radius, turn + (360 * index) / sides).map(fixed).join(",")).join(" ");
}

/**
 * components.md, Basket plate. Engraved in the manner of the Fortune Five
 * artwork: one rosette per constituent on a ring, spokes into a centre
 * polygon with as many sides as there are constituents, and a guilloche
 * field whose turn and density come from the basket's code.
 */
export function BasketPlate({ code, members, size = "row" }: { code: string; members: readonly PlateMember[]; size?: "row" | "header" }) {
  const hash = seed(code);
  const count = Math.max(members.length, 1);
  const turn = (hash % 360) / count;
  const strands = 9 + (hash % 7);
  const swell = 8 + ((hash >>> 8) % 9);
  const nodes = members.map((member, index) => ({ ...member, point: at(RING, turn + (360 * index) / count) }));

  return (
    <span className={styles.plate} data-size={size} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <rect width="100" height="100" className={styles.plateGround} />
        {Array.from({ length: 40 }, (_, index) => {
          const [x, y] = at(46, (360 * index) / 40);
          return <circle key={index} cx={fixed(x)} cy={fixed(y)} r="0.9" className={styles.plateInk} />;
        })}
        <circle cx={C} cy={C} r="42.5" className={styles.plateHairline} />
        <circle cx={C} cy={C} r={RING} className={styles.plateInk} />
        {Array.from({ length: strands }, (_, index) => (
          <ellipse
            key={index}
            cx={C}
            cy={C}
            rx="27"
            ry={swell}
            transform={`rotate(${fixed(turn + (180 * index) / strands)} ${C} ${C})`}
            className={styles.plateEngraving}
          />
        ))}
        {nodes.map((node) => (
          <line key={node.symbol} x1={C} y1={C} x2={fixed(node.point[0])} y2={fixed(node.point[1])} className={styles.plateSpoke} />
        ))}
        <polygon points={polygon(Math.max(count, 3), 8, turn)} className={styles.plateCentre} />
        {nodes.map((node) => {
          const [x, y] = node.point;
          return node.admitted ? (
            <g key={node.symbol}>
              <circle cx={fixed(x)} cy={fixed(y)} r={NODE} className={styles.plateNode} />
              {Array.from({ length: 12 }, (_, index) => {
                const radians = (Math.PI * index) / 6;
                return <line key={index} x1={fixed(x)} y1={fixed(y)} x2={fixed(x + 6.5 * Math.cos(radians))} y2={fixed(y + 6.5 * Math.sin(radians))} className={styles.plateEngraving} />;
              })}
              <circle cx={fixed(x)} cy={fixed(y)} r="2.4" className={styles.plateGround} />
            </g>
          ) : (
            // An empty socket: in the recipe, not admitted, so nothing is set in it.
            <circle key={node.symbol} cx={fixed(x)} cy={fixed(y)} r={NODE} className={styles.plateSocket} />
          );
        })}
      </svg>
    </span>
  );
}
