"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Grade, LotMark, Stamp, type GradeName } from "@seametry/ui";
import type { Photo } from "@/lib/photos";
import { Coin, Path, ShareTile, polar } from "../drawn/token-art";
import styles from "./landing.module.css";

// components.md, Opened Alloy. The orbit turns one leg at a time to the
// opened position at 0 degrees, and the card beside it opens that leg
// (Storm, 24 October 2026); a tap on any coin turns that coin there. It
// holds while the reader points at or focuses the card or a coin, the parts
// worth reading, not anywhere in the section. The turn is written as
// transform attributes from one animation frame loop, never as style; the
// labels and the card fade out before a turn and back in after it, so no
// label is drawn mid-orbit.

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
/** Each further step of one turn adds this much, so a tap across the orbit turns no faster than the eye follows. */
const EXTRA_STEP_MS = 260;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function OpenedOrbit({ legs, symbol, artwork, policyVersion, provenance }: { legs: OpenedLeg[]; symbol: string; artwork: string; policyVersion: string; provenance: string }) {
  const step = 360 / legs.length;
  // Steps turned so far; the ring stands at -turns * step degrees, so it only
  // ever turns one way.
  const [turns, setTurns] = useState(0);
  const [turning, setTurning] = useState(false);
  // The leg the card shows. It moves to the next leg as soon as the card has
  // faded out, so the card fades back in while the ring is still turning
  // rather than standing empty for the whole turn (Storm, 24 October 2026).
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGGElement>(null);
  const coins = useRef<(SVGGElement | null)[]>([]);
  const control = useRef<{ open: (index: number) => void }>({ open: () => {} });

  const active = turns % legs.length;
  const angle = -turns * step;
  const leg = legs[shown];
  // Every leg's photograph is in the strip from the start, so a swap is a
  // crossfade between loaded images, never a wait for one to arrive.
  const strip = [...new Map(legs.flatMap((item) => (item.photo ? [[item.photo.src, item.photo] as const] : []))).values()];
  const base = legs.map((_, index) => polar(CX, CY, ORBIT, index * step));

  useEffect(() => {
    const root = stage.current;
    if (!root || legs.length < 2) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = false;
    let held = false;
    let busy = false;
    let timer = 0;
    let frame = 0;
    let at = 0;
    let degrees = 0;

    const write = (value: number) => {
      ring.current?.setAttribute("transform", `rotate(${value.toFixed(3)} ${CX} ${CY})`);
      coins.current.forEach((coin, index) => coin?.setAttribute("transform", `rotate(${(-value).toFixed(3)} ${base[index].x} ${base[index].y})`));
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (!reduced) timer = window.setTimeout(advance, HOLD_MS);
    };

    const turnBy = (count: number) => {
      if (busy || count === 0) return;
      busy = true;
      const from = degrees;
      const to = from - count * step;
      const finish = () => {
        degrees = to;
        at = (at + count) % legs.length;
        busy = false;
        setTurns((value) => value + count);
        setTurning(false);
        schedule();
      };
      const target = (at + count) % legs.length;
      if (reduced) {
        write(to);
        setShown(target);
        return finish();
      }
      setTurning(true);
      setFading(true);
      timer = window.setTimeout(() => {
        setShown(target);
        setFading(false);
        const start = performance.now();
        const duration = TURN_MS + (count - 1) * EXTRA_STEP_MS;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          write(from + (to - from) * ease(t));
          if (t < 1) frame = requestAnimationFrame(tick);
          else finish();
        };
        frame = requestAnimationFrame(tick);
      }, FADE_MS);
    };

    function advance() {
      if (!visible || held || document.hidden) return schedule();
      turnBy(1);
    }

    control.current.open = (index) => turnBy((index - at + legs.length) % legs.length);

    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
    observer.observe(root);
    const holding = (target: EventTarget | null) => target instanceof Element && target.closest("[data-hold]") !== null;
    const over = (event: Event) => { held = holding(event.target); };
    const leave = () => { held = false; };
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("focusin", over);
    root.addEventListener("focusout", leave);
    schedule();
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("focusin", over);
      root.removeEventListener("focusout", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop owns its angle from mount, and the legs are fixed for the page's life.
  }, []);

  const open = (index: number) => control.current.open(index);
  const press = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open(index);
  };
  const holds = legs.map((item) => `${item.units} ${item.symbol}`).join(", ");

  return (
    <div className={styles.openedStage} ref={stage} data-turning={turning ? "" : undefined} data-fading={fading ? "" : undefined}>
      <svg viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`} className={styles.orbit} role="group" aria-label={`One ${symbol} share holds ${holds}.`}>
        <desc>{provenance}</desc>
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
            const point = base[index];
            return (
              <g
                key={item.symbol}
                ref={(node) => { coins.current[index] = node; }}
                transform={`rotate(${-angle} ${point.x} ${point.y})`}
                className={styles.orbitCoin}
                data-hold=""
                data-active={index === active ? "" : undefined}
                role="button"
                tabIndex={0}
                aria-label={`Open ${item.symbol}`}
                aria-pressed={index === active}
                onClick={() => open(index)}
                onKeyDown={(event) => press(event, index)}
              >
                <circle cx={point.x} cy={point.y} r={COIN + 12} className={styles.orbitHit} />
                <Coin id={`orbit-${item.symbol}`} x={point.x} y={point.y} r={COIN} logo={item.logo} symbol={item.symbol} />
                <g className={styles.orbitLabel}>
                  <text x={point.x + outward.x} y={point.y + outward.y + lift - 4} textAnchor={anchor} className={styles.coinSymbol}>{item.symbol}</text>
                  <text x={point.x + outward.x} y={point.y + outward.y + lift + 14} textAnchor={anchor} className={styles.coinUnits}>{item.units}</text>
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

      <article className={styles.openedCard} aria-label={`${leg.symbol}, opened`} data-hold="">
        {strip.length ? (
          <span className={`${styles.photoGround} ${styles.openedPhoto}`}>
            {strip.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses, and its transformations count against the hosting plan; the file is already sized.
              <img key={photo.src} src={photo.src} width={photo.width} height={photo.height} alt={photo.src === leg.photo?.src ? photo.alt : ""} aria-hidden={photo.src !== leg.photo?.src} data-shown={photo.src === leg.photo?.src ? "" : undefined} loading="lazy" decoding="async" />
            ))}
          </span>
        ) : null}
        <div className={styles.openedBody}>
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
        </div>
      </article>
    </div>
  );
}
