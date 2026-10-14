import { formatBalance } from "@/lib/amount";
import styles from "./depth-chart.module.css";

export type DepthPoint = {
  size: { atoms: string; scale: number };
  availability: string;
  shortfall_bps?: number;
  provider_code?: string;
  age_seconds?: number;
};

// The scale never tops out below 50 bps, so a liquid lot's few basis points
// read as small rather than filling the frame.
const LEAST_SCALE_BPS = 50;
// Bar heights come in twentieths of the frame, set by data-level in CSS:
// the page's style policy refuses inline styles, and every bar is labelled
// with its exact figure, so the bar only has to rank.
const LEVELS = 20;

function ageText(seconds?: number) {
  if (seconds === undefined) return "age unavailable";
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  return `${Math.floor(seconds / 3600)}h old`;
}

/**
 * components.md, Depth chart: how much a buy at each stored USDC size gives
 * up against the best quoted price, as bars on one baseline. A size with no
 * route is a dashed frame the full height, so an absence reads as a wall
 * rather than as no cost. Bars carry their own figures; the caption carries
 * the source and age, as every figure must.
 */
export function DepthChart({ points }: { points: DepthPoint[] }) {
  const top = Math.max(LEAST_SCALE_BPS, Math.ceil(Math.max(0, ...points.map((point) => point.shortfall_bps ?? 0)) * 1.25));
  const sources = [...new Set(points.map((point) => `${point.provider_code === "jupiter" ? "Jupiter quotes" : point.provider_code === "no_route" ? "No route found" : point.provider_code ?? "Source unavailable"}, ${ageText(point.age_seconds)}`))];

  return (
    <figure className={styles.chart}>
      <ol className={styles.columns} aria-label="Shortfall by buy size">
        {points.map((point) => {
          const routed = point.availability === "available";
          const bps = point.shortfall_bps ?? 0;
          const level = routed ? Math.max(1, Math.round((LEVELS * bps) / top)) : LEVELS;
          return (
            <li key={`${point.size.atoms}-${point.size.scale}`} className={styles.column}>
              <b className={styles.value}>{!routed ? "No route" : point.shortfall_bps === undefined ? "Not measured" : `${bps} bps`}</b>
              <span className={styles.frame} aria-hidden="true">
                <span className={routed ? styles.bar : styles.ghost} data-level={level} />
              </span>
              <span className={styles.size}>{formatBalance(point.size.atoms, point.size.scale)} USDC</span>
            </li>
          );
        })}
      </ol>
      <figcaption>Shortfall against the best quoted price at each buy size. {sources.join("; ")}.</figcaption>
    </figure>
  );
}
