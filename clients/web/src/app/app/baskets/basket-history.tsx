"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./baskets.module.css";

type AvailableSeries = {
  available: true;
  points: { time: number; close: number }[];
  source: string;
  kind: string;
  observedAt: string;
};

type UnavailableSeries = {
  available: false;
  source: string;
  reason?: string;
};

export function BasketSparkline({ id, compact = false }: { id: string; compact?: boolean }) {
  const [series, setSeries] = useState<AvailableSeries>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/market/index-history?id=" + encodeURIComponent(id), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<AvailableSeries | UnavailableSeries>;
      })
      .then((value) => {
        if (!live) return;
        if (!value.available) {
          setUnavailable(true);
          return;
        }
        setSeries(value);
      })
      .catch(() => { if (live) setUnavailable(true); });
    return () => { live = false; };
  }, [id]);

  const drawing = useMemo(() => {
    const points = series?.points ?? [];
    if (points.length < 2) return undefined;
    const values = points.map((point) => point.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 0.0001);
    const path = points.map((point, index) => {
      const x = (index / (points.length - 1)) * 160;
      const y = 42 - ((point.close - min) / range) * 34;
      return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    return {
      path,
      change: ((values[values.length - 1] / values[0]) - 1) * 100,
    };
  }, [series]);

  if (!drawing || !series) {
    return (
      <div className={styles.sparkUnavailable} data-compact={compact || undefined}>
        <span>{unavailable ? "No reference observation" : "Reading reference series"}</span>
      </div>
    );
  }

  return (
    <figure className={styles.basketSpark} data-compact={compact || undefined}>
      <svg viewBox="0 0 160 48" role="img" aria-label="Price-only reference series">
        <path d="M0 42H160" className={styles.sparkBaseline} />
        <path d={drawing.path} className={styles.sparkLine} />
      </svg>
      <figcaption>
        <b>{drawing.change >= 0 ? "+" : ""}{drawing.change.toFixed(1)}%</b>
        <span>{series.source} · price-only</span>
      </figcaption>
    </figure>
  );
}
