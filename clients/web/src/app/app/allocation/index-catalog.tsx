"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AllocationIndex } from "@/lib/allocation/indexes";
import styles from "./allocation.module.css";

type IndexSeries = {
  available: true;
  points: { time: number; close: number }[];
  source: string;
  kind: string;
};

type UnavailableSeries = {
  available: false;
  source: string;
  reason?: string;
};

function BasketIllustration({ kind }: { kind: AllocationIndex["illustration"] }) {
  return (
    <svg className={styles.indexIllustration} viewBox="0 0 160 96" aria-hidden="true">
      <path className={styles.indexGridLine} d="M0 24H160M0 48H160M0 72H160M40 0V96M80 0V96M120 0V96" />
      {kind === "wafer" ? (
        <>
          <circle cx="80" cy="48" r="31" className={styles.indexFigure} />
          <path d="M50 48H110M80 18V78M58 27L102 69M102 27L58 69" className={styles.indexFigure} />
          <circle cx="80" cy="48" r="5" className={styles.indexPulse} />
        </>
      ) : kind === "platform" ? (
        <>
          <rect x="43" y="27" width="74" height="42" className={styles.indexFigure} />
          <path d="M57 39H103M57 49H91M57 59H108" className={styles.indexFigure} />
          <path d="M32 18L43 27M128 18L117 27M32 78L43 69M128 78L117 69" className={styles.indexPulseLine} />
        </>
      ) : (
        <>
          <path d="M32 68C47 68 48 29 63 29S79 68 94 68 111 37 128 37" className={styles.indexFigure} />
          <circle cx="32" cy="68" r="3" className={styles.indexPulse} />
          <circle cx="63" cy="29" r="3" className={styles.indexPulse} />
          <circle cx="94" cy="68" r="3" className={styles.indexPulse} />
          <circle cx="128" cy="37" r="3" className={styles.indexPulse} />
        </>
      )}
    </svg>
  );
}

function Sparkline({ id }: { id: string }) {
  const [series, setSeries] = useState<IndexSeries>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/market/index-history?id=" + encodeURIComponent(id), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<IndexSeries | UnavailableSeries>;
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

  const path = useMemo(() => {
    const points = series?.points ?? [];
    if (points.length < 2) return "";
    const values = points.map((point) => point.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 0.0001);
    return points.map((point, index) => {
      const x = (index / (points.length - 1)) * 220;
      const y = 58 - ((point.close - min) / range) * 48;
      return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
  }, [series]);

  if (!path) return <p className={styles.indexChartUnavailable}>{unavailable ? "Reference series unavailable" : "Reading reference series…"}</p>;

  const first = series!.points[0].close;
  const last = series!.points[series!.points.length - 1].close;
  const change = ((last / first) - 1) * 100;
  return (
    <figure className={styles.indexSpark}>
      <svg viewBox="0 0 220 64" role="img" aria-label="Price-only equal-weight reference series">
        <path d="M0 58H220" className={styles.sparkBaseline} />
        <path d={path} className={styles.sparkLine} />
      </svg>
      <figcaption>
        <span>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</span>
        <small>{series!.source} · price-only reference</small>
      </figcaption>
    </figure>
  );
}

export function IndexCatalog({
  indexes,
  availableSymbols,
  activeId,
}: {
  indexes: readonly AllocationIndex[];
  availableSymbols: string[];
  activeId?: string;
}) {
  const available = new Set(availableSymbols);
  return (
    <section className={styles.indexCatalog} aria-labelledby="allocation-indexes-title">
      <header className={styles.indexCatalogHead}>
        <div>
          <span>Published-rule Allocations</span>
          <h2 id="allocation-indexes-title">Start with an industry, not a ticker.</h2>
        </div>
        <p>Equal weighted at purchase, versioned, filtered through the current admissions register, and held directly in your wallet.</p>
      </header>
      <div className={styles.indexCards}>
        {indexes.map((index) => {
          const supported = index.members.filter((member) => available.has(member.symbol));
          const complete = supported.length === index.members.length;
          return (
            <article key={index.id} className={styles.indexCard} data-active={index.id === activeId || undefined}>
              <div className={styles.indexVisual}>
                <BasketIllustration kind={index.illustration} />
                <Sparkline id={index.id} />
              </div>
              <div className={styles.indexCardBody}>
                <span>{index.industry} · {index.methodologyVersion}</span>
                <h3>{index.name}</h3>
                <p>{index.description}</p>
                <div className={styles.indexMembers} aria-label={index.name + " members"}>
                  {index.members.map((member) => <b key={member.symbol} data-missing={!available.has(member.symbol) || undefined}>{member.symbol}</b>)}
                </div>
                <div className={styles.indexCardFoot}>
                  <small>{complete ? supported.length + "/" + index.members.length + " admitted now" : supported.length + "/" + index.members.length + " currently admitted"}</small>
                  {complete ? (
                    <Link href={"/app/allocation?index=" + encodeURIComponent(index.id)}>{index.id === activeId ? "Selected" : "Build allocation"}</Link>
                  ) : <span>Incomplete under current policy</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className={styles.indexMethodNote}>These are direct-wallet Allocation indexes, not pooled funds or Alloy shares. The reference chart is informational and never sets execution price.</p>
    </section>
  );
}
