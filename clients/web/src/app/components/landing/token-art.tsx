import styles from "./landing.module.css";

// The drawn vocabulary the landing's illustrations share, so the opened
// Alloy, the Strike steps and the close read as one system: a constituent is
// a round coin carrying its issuer's logo, a share is a square tile carrying
// its Alloy's artwork, stacked on two offset frames, and what moves between
// them runs on dotted rules. Coordinates are SVG user units.

const fixed = (value: number) => Number(value.toFixed(2));

export function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: fixed(cx + radius * Math.cos(radians)), y: fixed(cy + radius * Math.sin(radians)) };
}

/** A constituent: its logo clipped to a disc inside a hairline ring, or its letters where no logo was captured. */
export function Coin({ id, x, y, r, logo, symbol, held }: { id: string; x: number; y: number; r: number; logo?: string; symbol: string; held?: boolean }) {
  return (
    <g className={styles.coin} data-held={held ? "" : undefined}>
      <clipPath id={id}>
        <circle cx={x} cy={y} r={r} />
      </clipPath>
      <circle cx={x} cy={y} r={fixed(r * 1.22)} className={styles.coinRing} />
      <circle cx={x} cy={y} r={r} className={styles.coinFace} />
      {logo ? (
        <image href={logo} x={fixed(x - r)} y={fixed(y - r)} width={fixed(r * 2)} height={fixed(r * 2)} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x={x} y={fixed(y + r * 0.3)} className={styles.coinLetters} textAnchor="middle">{symbol.slice(0, 2)}</text>
      )}
    </g>
  );
}

/** A share: the Alloy's artwork on a tile, with two frames stepping out behind it like a short stack of shares. */
export function ShareTile({ x, y, size, artwork }: { x: number; y: number; size: number; artwork: string }) {
  const step = fixed(size * 0.07);
  const half = size / 2;
  return (
    <g className={styles.tile}>
      <rect x={fixed(x - half + step * 2)} y={fixed(y - half + step * 2)} width={size} height={size} className={styles.tileFrame} />
      <rect x={fixed(x - half + step)} y={fixed(y - half + step)} width={size} height={size} className={styles.tileFrame} />
      <image href={artwork} x={fixed(x - half)} y={fixed(y - half)} width={size} height={size} />
      <rect x={fixed(x - half)} y={fixed(y - half)} width={size} height={size} className={styles.tileEdge} />
    </g>
  );
}

/** A dotted rule between two points, bowed through the given control points when there are any. */
export function Path({ from, to, via, className }: { from: { x: number; y: number }; to: { x: number; y: number }; via?: [{ x: number; y: number }, { x: number; y: number }]; className?: string }) {
  const d = via
    ? `M${from.x} ${from.y}C${via[0].x} ${via[0].y} ${via[1].x} ${via[1].y} ${to.x} ${to.y}`
    : `M${from.x} ${from.y}L${to.x} ${to.y}`;
  return <path d={d} className={className ?? styles.flow} />;
}
