"use client";

import { useEffect, useRef, useState } from "react";
import { Grade, LotMark, Stamp, type GradeName } from "@seametry/ui";
import type { Photo } from "@/lib/photos";
import { Coin, Path, ShareTile, polar } from "../drawn/token-art";
import styles from "./landing.module.css";

// components.md, Opened Alloy. The orbit turns one leg at a time to the
// opened position at 0 degrees, and the card beside it opens that leg
// (Storm, 24 October 2026). The turn is written as transform attributes from
// one animation frame loop, never as style; the labels and the card fade out
// before a turn and back in after it, so no label is drawn mid-orbit.

export type OpenedLeg = {
  symbol: string;
  units: string;
  logo?: string;
  name?: string;
  issuer: string;
  grade: GradeName;
  powers: { code: string; label: string; fact: string }[];
  stamp?: "allow" | "warn" | "block";
  decision: string;
  photo?: Photo;
};

const WIDTH = 720;
/** The orbit with its labels spans about 70 to 530; the frame keeps 20 either side. */
const TOP = 50;
const HEIGHT = 500;
const CX = 360;
const CY = 300;
const ORBIT = 196;
const COIN = 27;
const TILE = 124;
const HOLD_MS = 4500;
const FADE_MS = 200;
const TURN_MS = 900;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function OpenedOrbit({ legs, symbol, artwork, policyVersion }: { legs: OpenedLeg[]; symbol: string; artwork: string; policyVersion: string }) {
  const step = 360 / legs.length;
  // Turns taken so far; the ring stands at -turns * step degrees, so it only
  // ever turns one way.
  const [turns, setTurns] = useState(0);
  const [turning, setTurning] = useState(false);
  const figure = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGGElement>(null);
  const coins = useRef<(SVGGElement | null)[]>([]);

  const active = turns % legs.length;
  const angle = -turns * step;
  const leg = legs[active];
  const base = legs.map((_, index) => polar(CX, CY, ORBIT, index * step));

  useEffect(() => {
    const root = figure.current;
    if (!root || legs.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let held = false;
    let timer = 0;
    let frame = 0;
    let from = 0;

    const write = (degrees: number) => {
      ring.current?.setAttribute("transform", `rotate(${degrees.toFixed(3)} ${CX} ${CY})`);
      coins.current.forEach((coin, index) => coin?.setAttribute("transform", `rotate(${(-degrees).toFixed(3)} ${base[index].x} ${base[index].y})`));
    };

    const turn = () => {
      if (!visible || held || document.hidden) return schedule();
      setTurning(true);
      timer = window.setTimeout(() => {
        const start = performance.now();
        const to = from - step;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / TURN_MS);
          write(from + (to - from) * ease(t));
          if (t < 1) {
            frame = requestAnimationFrame(tick);
            return;
          }
          from = to;
          setTurns((value) => value + 1);
          setTurning(false);
          schedule();
        };
        frame = requestAnimationFrame(tick);
      }, FADE_MS);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(turn, HOLD_MS);
    };

    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
    observer.observe(root);
    // A reader who points at or focuses the figure is reading it: it waits.
    const hold = () => { held = true; };
    const release = () => { held = false; };
    root.addEventListener("pointerenter", hold);
    root.addEventListener("pointerleave", release);
    root.addEventListener("focusin", hold);
    root.addEventListener("focusout", release);
    schedule();
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("pointerenter", hold);
      root.removeEventListener("pointerleave", release);
      root.removeEventListener("focusin", hold);
      root.removeEventListener("focusout", release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop owns its angle from mount, and the legs are fixed for the page's life.
  }, []);

  const holds = legs.map((item) => `${item.units} ${item.symbol}`).join(", ");

  return (
    <div className={styles.openedStage} ref={figure} data-turning={turning ? "" : undefined}>
      <svg viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`} className={styles.orbit} role="img" aria-label={`One ${symbol} share holds ${holds}.`}>
        <circle cx={CX} cy={CY} r={ORBIT + 84} className={styles.ringOuter} />
        <circle cx={CX} cy={CY} r={ORBIT} className={styles.ring} />
        <circle cx={CX} cy={CY} r={TILE * 0.9} className={styles.ringInner} />

        <g ref={ring} transform={`rotate(${angle} ${CX} ${CY})`}>
          {legs.map((item, index) => (
            <Path key={item.symbol} from={polar(CX, CY, TILE * 0.62, index * step)} to={polar(CX, CY, ORBIT - COIN * 1.3, index * step)} />
          ))}
          {legs.map((item, index) => {
            // Where this leg stands after the ring has turned, so its label sits outward from there.
            const seen = index * step + angle;
            const outward = polar(0, 0, COIN + 22, seen);
            const cos = Math.cos((seen * Math.PI) / 180);
            const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
            const lift = index === active ? -24 : 0;
            const at = base[index];
            return (
              <g key={item.symbol} ref={(node) => { coins.current[index] = node; }} transform={`rotate(${-angle} ${at.x} ${at.y})`}>
                <Coin id={`orbit-${item.symbol}`} x={at.x} y={at.y} r={COIN} logo={item.logo} symbol={item.symbol} />
                <g className={styles.orbitLabel}>
                  <text x={at.x + outward.x} y={at.y + outward.y + lift - 4} textAnchor={anchor} className={styles.coinSymbol}>{item.symbol}</text>
                  <text x={at.x + outward.x} y={at.y + outward.y + lift + 14} textAnchor={anchor} className={styles.coinUnits}>{item.units}</text>
                </g>
              </g>
            );
          })}
        </g>

        <ShareTile x={CX} y={CY} size={TILE} artwork={artwork} />
        <text x={CX} y={CY + TILE * 0.9 + 34} textAnchor="middle" className={styles.tileLabel}>1 {symbol}</text>

        <g className={styles.leader}>
          <circle cx={CX + ORBIT + COIN * 1.22} cy={CY} r={2.5} />
          <line x1={CX + ORBIT + COIN * 1.22} y1={CY} x2={WIDTH} y2={CY} />
        </g>
      </svg>

      <div className={styles.openedLeg}>
        {leg.photo ? (
          <span className={`${styles.photoGround} ${styles.openedPhoto}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses, and its transformations count against the hosting plan; the file is already sized. */}
            <img src={leg.photo.src} width={leg.photo.width} height={leg.photo.height} alt={leg.photo.alt} decoding="async" />
          </span>
        ) : null}
        <article className={styles.openedCard} aria-label={`${leg.symbol}, opened`}>
          <header>
            <LotMark symbol={leg.symbol} src={leg.logo} size="list" />
            <div>
              <b>{leg.symbol}</b>
              <span>{leg.name ?? leg.issuer}</span>
            </div>
            <Grade name={leg.grade} />
          </header>
          <span className={styles.openedLabel}>Powers its issuer keeps</span>
          <ul className={styles.powers}>
            {leg.powers.map((power) => <li key={power.code} title={power.fact}>{power.label}</li>)}
          </ul>
          {leg.stamp ? <Stamp kind={leg.stamp} reason={`Under ${policyVersion}`} /> : <span>Decision {leg.decision} under {policyVersion}</span>}
        </article>
      </div>
    </div>
  );
}
