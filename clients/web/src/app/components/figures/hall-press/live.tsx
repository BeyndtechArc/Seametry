"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { formatBalance } from "@/lib/amount";
import { melt, strike } from "@/lib/hall/recipe";
import styles from "./press.module.css";

type Flat = [number, number];
type Moves = { ramPerUnit: Flat; channelPerUnit: Flat; gateDrop: Flat; coinToStack: Flat; stackStep: Flat; chitStep: Flat; strokeUnits: number; channelUnits: number };
type Leg = { symbol: string; perShare: string };

const SCALE = 6;

/** Exponential ease in and out, so every move starts and lands softly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const phase = (t: number, from: number, to: number) => ease(Math.min(1, Math.max(0, (t - from) / (to - from))));
const translate = ([x, y]: Flat, by: number) => `translate(${(x * by).toFixed(2)} ${(y * by).toFixed(2)})`;

export function HallPressLive({ svg, moves, legs, initialSupply, stackMax, chitsPerLeg, initialReadout }: {
  svg: string;
  moves: Moves;
  legs: Leg[];
  initialSupply: number;
  stackMax: number;
  chitsPerLeg: number;
  initialReadout: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const touched = useRef(false);
  const [supply, setSupply] = useState(BigInt(initialSupply));
  const [frozen, setFrozen] = useState<number | null>(null);
  const [claims, setClaims] = useState<bigint[]>(legs.map(() => 0n));
  const [readout, setReadout] = useState(initialReadout);
  const perShare = legs.map((leg) => BigInt(leg.perShare));

  const part = (name: string) => stage.current?.querySelector<SVGGElement>(`[data-part="${name}"]`) ?? null;
  const show = (name: string, visible: boolean) => {
    const element = part(name);
    if (!element) return;
    if (visible) element.removeAttribute("data-hidden");
    else element.setAttribute("data-hidden", "");
  };

  // Static state shown as attributes: the stack height, filed chits, padlocks and gates.
  useEffect(() => {
    const shown = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax));
    for (let index = 0; index < stackMax; index += 1) {
      show(`stack-${index}`, index < shown);
      show(`stack-lit-${index}`, index === shown - 1);
    }
    legs.forEach((_, legIndex) => {
      const filed = claims[legIndex] === 0n ? 0 : Math.min(chitsPerLeg, Number(claims[legIndex] / perShare[legIndex]));
      for (let index = 0; index < chitsPerLeg; index += 1) show(`chit-${legIndex}-${index}`, index < filed);
      show(`padlock-${legIndex}`, frozen === legIndex);
      part(`gate-${legIndex}`)?.setAttribute("transform", frozen === legIndex ? translate(moves.gateDrop, 1) : "");
    });
  });

  const run = (duration: number, frame: (t: number) => void) =>
    new Promise<void>((resolve) => {
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (still) {
        frame(1);
        resolve();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        frame(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

  const ram = (by: number) => {
    const offset = translate(moves.ramPerUnit, by * moves.strokeUnits);
    part("ram-lower")?.setAttribute("transform", offset);
    part("ram-upper")?.setAttribute("transform", offset);
  };

  async function doStrike() {
    if (busy.current) return;
    if (frozen !== null) {
      setReadout(`Strike refused. The issuer froze the Hall's ${legs[frozen].symbol} account, so its units cannot move in, and create fails for this Alloy until it is lifted. Melt still works.`);
      return;
    }
    busy.current = true;
    const next = legs.map((_, index) => strike({ supply, leg: { ledger: perShare[index] * supply, unclaimed: 0n } }, 1n).paid);
    legs.forEach((_, index) => show(`unit-${index}`, true));
    await run(900, (t) => legs.forEach((_, index) => part(`unit-${index}`)?.setAttribute("transform", translate(moves.channelPerUnit, phase(t, 0, 1) * moves.channelUnits))));
    legs.forEach((_, index) => { show(`unit-${index}`, false); part(`unit-${index}`)?.setAttribute("transform", ""); });
    await run(520, (t) => ram(phase(t, 0, 1)));
    show("coin", true);
    await run(520, (t) => ram(1 - phase(t, 0, 1)));
    const top = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax - 1));
    await run(700, (t) => {
      const lift = phase(t, 0, 1);
      const [x, y] = moves.coinToStack;
      const [sx, sy] = moves.stackStep;
      part("coin")?.setAttribute("transform", `translate(${(x * lift + sx * top * lift).toFixed(2)} ${(y * lift + sy * top * lift - Math.sin(lift * Math.PI) * 18).toFixed(2)})`);
    });
    show("coin", false);
    part("coin")?.setAttribute("transform", "");
    setSupply((value) => value + 1n);
    setReadout(`Struck 1 share. Paid ${legs.map((leg, index) => `${formatBalance(next[index], SCALE)} ${leg.symbol}`).join(", ")}. No price was read.`);
    busy.current = false;
  }

  async function doMelt() {
    if (busy.current || supply === 0n) return;
    busy.current = true;
    const credited = legs.map((_, index) => melt({ supply, leg: { ledger: perShare[index] * supply, unclaimed: 0n } }, 1n).credited);
    const top = Number(supply <= BigInt(stackMax) ? supply - 1n : BigInt(stackMax - 1));
    show(`stack-${top}`, false);
    show("coin", true);
    await run(700, (t) => {
      const back = 1 - phase(t, 0, 1);
      const [x, y] = moves.coinToStack;
      const [sx, sy] = moves.stackStep;
      part("coin")?.setAttribute("transform", `translate(${(x * back + sx * top * back).toFixed(2)} ${(y * back + sy * top * back - Math.sin(back * Math.PI) * 18).toFixed(2)})`);
    });
    await run(520, (t) => ram(phase(t, 0, 1)));
    show("coin", false);
    part("coin")?.setAttribute("transform", "");
    await run(520, (t) => ram(1 - phase(t, 0, 1)));
    setSupply((value) => value - 1n);
    setClaims((current) => current.map((value, index) => value + credited[index]));
    setReadout(`Melted 1 share. A Claim on every leg: ${legs.map((leg, index) => `${formatBalance(credited[index], SCALE)} ${leg.symbol}`).join(", ")}. Nothing moved, so no issuer could stop it.`);
    await run(900, () => undefined);
    // Delivery is each issuer's: every leg but a frozen one is withdrawn.
    setClaims((current) => current.map((value, index) => (index === frozen ? value : 0n)));
    setReadout(frozen === null
      ? `Melted 1 share and withdrew every leg: ${legs.map((leg, index) => `${formatBalance(credited[index], SCALE)} ${leg.symbol}`).join(", ")}.`
      : `Melted 1 share. Withdrew ${legs.filter((_, index) => index !== frozen).map((leg) => leg.symbol).join(" and ")}; ${legs[frozen].symbol} stays filed as a Claim until its issuer lifts the freeze.`);
    busy.current = false;
  }

  // The tour reads the latest state through an effect event, so the timer
  // effect itself never restarts as shares are struck and melted.
  const tourStep = useEffectEvent((move: "strike" | "melt" | "freeze" | "thaw") => {
    if (touched.current || busy.current) return;
    if (move === "strike") void doStrike();
    else if (move === "melt") void doMelt();
    else setFrozen(move === "freeze" ? 1 : null);
  });

  // The idle tour: strike, strike, melt, freeze a leg, melt, lift the freeze.
  useEffect(() => {
    const node = stage.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(node);
    const tour = ["strike", "strike", "melt", "freeze", "melt", "thaw"] as const;
    let index = 0;
    const timer = setInterval(() => {
      if (!visible) return;
      tourStep(tour[index % tour.length]);
      index += 1;
    }, 3400);
    return () => { clearInterval(timer); observer.disconnect(); };
  }, []);

  return (
    <div className={styles.press}>
      <div className={styles.stage} ref={stage} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className={styles.panel}>
        <div className={styles.controls}>
          <button type="button" onClick={() => { touched.current = true; void doStrike(); }}>Strike 1 share</button>
          <button type="button" onClick={() => { touched.current = true; void doMelt(); }} disabled={supply === 0n}>Melt 1 share</button>
          <label>
            <input type="checkbox" checked={frozen === 1} onChange={() => { touched.current = true; setFrozen((value) => (value === 1 ? null : 1)); }} />
            <span>Issuer freezes {legs[1].symbol}</span>
          </label>
        </div>
        <p className={styles.readout} role="status" aria-live="polite">{readout}</p>
      </div>
    </div>
  );
}
