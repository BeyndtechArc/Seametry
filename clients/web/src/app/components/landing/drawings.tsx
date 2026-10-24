"use client";

import { Coin, Path, ShareTile, polar } from "./token-art";
import styles from "./landing.module.css";

// The Strike steps' and the close's drawings, as client components so a
// server page sends each as the legs it draws, not as its markup: server
// rendered, every drawing was sent twice, in the HTML and again in the React payload. Their
// data comes from the founding record through the server sections that use
// them (founding.ts).

export type DrawnLeg = { symbol: string; units: string; logo?: string };

const STEP_WIDTH = 360;
const STEP_HEIGHT = 210;
const MID = STEP_HEIGHT / 2;
const STEP_COIN = 10.5;
const STEP_TILE = 76;
/** Which leg the frozen diagram holds: illustrative, as its section says. */
const HELD = 1;

const rowY = (index: number, count: number) => Number((MID + (index - (count - 1) / 2) * 30).toFixed(2));

export type StepKind = "strike" | "melt" | "frozen";

/** components.md, Strike steps: constituents on one side, the share on the other, joined by bowed dotted rules. */
export function StepDrawing({ kind, legs, symbol, artwork }: { kind: StepKind; legs: DrawnLeg[]; symbol: string; artwork: string }) {
  const coinsLeft = kind === "strike";
  const coinX = coinsLeft ? 28 : STEP_WIDTH - 28;
  const tileX = coinsLeft ? STEP_WIDTH - 62 : 62;
  const tileEdge = coinsLeft ? tileX - STEP_TILE / 2 : tileX + STEP_TILE / 2;
  // Every rule meets at one point short of the tile and enters it as one stem.
  const merge = tileEdge + (coinsLeft ? -26 : 26);
  const gateX = (coinX + merge) / 2 + (coinsLeft ? -10 : 10);

  return (
    <svg viewBox={`0 0 ${STEP_WIDTH} ${STEP_HEIGHT}`} className={styles.stepDiagram} aria-hidden="true">
      {legs.map((leg, index) => {
        const y = rowY(index, legs.length);
        const held = kind === "frozen" && index === HELD;
        const coinEdge = coinX + (coinsLeft ? STEP_COIN * 1.4 : -STEP_COIN * 1.4);
        const end = held ? { x: gateX, y } : { x: coinEdge, y };
        const bow = (merge + end.x) / 2;
        return (
          <g key={leg.symbol}>
            <Path from={{ x: merge, y: MID }} to={end} via={[{ x: bow, y: MID }, { x: bow, y }]} className={held ? styles.flowHeld : undefined} />
            {held ? (
              <g className={styles.gate}>
                <line x1={gateX + (coinsLeft ? -6 : 6)} y1={y - 13} x2={gateX + (coinsLeft ? -6 : 6)} y2={y + 13} />
                <rect x={coinX - STEP_COIN * 1.6} y={y - STEP_COIN * 1.6} width={STEP_COIN * 3.2} height={STEP_COIN * 3.2} className={styles.claimBox} />
              </g>
            ) : null}
            <Coin id={`${kind}-${leg.symbol}`} x={coinX} y={y} r={STEP_COIN} logo={leg.logo} symbol={leg.symbol} held={held} />
          </g>
        );
      })}
      <line x1={merge} y1={MID} x2={tileEdge} y2={MID} className={styles.stem} />
      <circle cx={merge} cy={MID} r={2.5} className={styles.mergePoint} />
      <ShareTile x={tileX} y={MID} size={STEP_TILE} artwork={artwork} />
      <text x={tileX} y={MID + STEP_TILE / 2 + 26} textAnchor="middle" className={styles.stepTileLabel}>1 {symbol}</text>
      {kind === "frozen" ? (
        <text x={coinX - STEP_COIN * 2.2} y={rowY(HELD, legs.length) + 4} textAnchor="end" className={styles.claimLabel}>Claim</text>
      ) : null}
    </svg>
  );
}

const CLOSE_SIZE = 320;
const CLOSE_C = CLOSE_SIZE / 2;
const CLOSE_ORBIT = 118;
const CLOSE_COIN = 17;
const CLOSE_TILE = 76;

/** components.md, Closing band: the orbit drawn small and without words. */
export function ClosingDrawing({ legs, artwork }: { legs: DrawnLeg[]; artwork: string }) {
  return (
    <svg viewBox={`0 0 ${CLOSE_SIZE} ${CLOSE_SIZE}`} className={styles.closingOrbit} aria-hidden="true">
      <circle cx={CLOSE_C} cy={CLOSE_C} r={CLOSE_ORBIT} className={styles.ring} />
      <circle cx={CLOSE_C} cy={CLOSE_C} r={CLOSE_ORBIT + 36} className={styles.ringOuter} />
      {legs.map((leg, index) => (
        <Path key={leg.symbol} from={polar(CLOSE_C, CLOSE_C, CLOSE_TILE * 0.62, index * 60 - 90)} to={polar(CLOSE_C, CLOSE_C, CLOSE_ORBIT - CLOSE_COIN * 1.3, index * 60 - 90)} />
      ))}
      <ShareTile x={CLOSE_C} y={CLOSE_C} size={CLOSE_TILE} artwork={artwork} />
      {legs.map((leg, index) => {
        const at = polar(CLOSE_C, CLOSE_C, CLOSE_ORBIT, index * 60 - 90);
        return <Coin key={leg.symbol} id={`close-${leg.symbol}`} x={at.x} y={at.y} r={CLOSE_COIN} logo={leg.logo} symbol={leg.symbol} />;
      })}
    </svg>
  );
}
