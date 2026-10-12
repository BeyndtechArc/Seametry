"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { formatBalance } from "@/lib/amount";
import { melt, strike } from "@/lib/hall/recipe";
import styles from "./press.module.css";

type Flat = [number, number];
type Moves = { ramPerUnit: Flat; channelPerUnit: Flat; gateDrop: Flat; coinToStack: Flat; stackStep: Flat; chitToWallet: Flat[]; strokeUnits: number; channelUnits: number; gateStopUnits: number };
type Leg = { symbol: string; perShare: string };
type Move = "strike" | "melt" | "freeze" | "thaw";
/** Claims filed in the rack and ingots delivered to the wallet are per leg. */
type Model = { supply: bigint; frozen: number | null; held: bigint[]; delivered: number[]; status: string };

const SCALE = 6;
const FROZEN_LEG = 1;
// One full story: shares made, a clean redemption, then a freeze that refuses
// Strike, a redemption that delivers around the frozen leg, and its release.
const TOUR: Move[] = ["strike", "strike", "melt", "freeze", "strike", "melt", "thaw"];

/** Exponential ease in and out, so every move starts and lands softly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const phase = (t: number, from: number, to: number) => ease(Math.min(1, Math.max(0, (t - from) / (to - from))));
const translate = ([x, y]: Flat, by: number, lift = 0) => `translate(${(x * by).toFixed(2)} ${(y * by - lift).toFixed(2)})`;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HallPressLive({ svg, moves, legs, initialSupply, stackMax, walletDepth, initialStatus }: {
  svg: string;
  moves: Moves;
  legs: Leg[];
  initialSupply: number;
  stackMax: number;
  walletDepth: number;
  initialStatus: string;
}) {
  const start: Model = { supply: BigInt(initialSupply), frozen: null, held: legs.map(() => 0n), delivered: legs.map(() => 0), status: initialStatus };
  const stage = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  // The model lives in a ref so a queued action reads the state its turn
  // finds, not the state of the render that queued it; the view mirrors it.
  const model = useRef(start);
  const queue = useRef(Promise.resolve());
  const [view, setView] = useState(start);
  const perShare = legs.map((leg) => BigInt(leg.perShare));
  const amount = (value: bigint, index: number) => `${formatBalance(value, SCALE)} ${legs[index].symbol}`;
  const listed = (indices: number[], values: bigint[]) => {
    const words = indices.map((index) => amount(values[index], index));
    return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  };

  const commit = (change: Partial<Model>) => {
    model.current = { ...model.current, ...change };
    setView(model.current);
  };
  // Each action waits for the one before it, so a click during motion runs next instead of being lost.
  const enqueue = (action: () => Promise<void>) => (queue.current = queue.current.then(action));

  const part = (name: string) => stage.current?.querySelector<SVGGElement>(`[data-part="${name}"]`) ?? null;
  const show = (name: string, visible: boolean) => part(name)?.toggleAttribute("data-hidden", !visible);

  // Resting state written as attributes: the stack, the rack's chits (a held
  // one marked), the wallet's ingots, the padlock and the gate.
  useEffect(() => {
    const { supply, frozen, held, delivered } = view;
    const shown = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax));
    for (let index = 0; index < stackMax; index += 1) {
      show(`stack-${index}`, index < shown);
      show(`stack-lit-${index}`, index === shown - 1);
    }
    legs.forEach((_, legIndex) => {
      show(`chit-${legIndex}`, held[legIndex] > 0n);
      part(`chit-${legIndex}`)?.toggleAttribute("data-held", frozen === legIndex && held[legIndex] > 0n);
      for (let index = 0; index < walletDepth; index += 1) show(`ingot-${legIndex}-${index}`, index < delivered[legIndex]);
      show(`padlock-${legIndex}`, frozen === legIndex);
      part(`gate-${legIndex}`)?.setAttribute("transform", frozen === legIndex ? translate(moves.gateDrop, 1) : "");
    });
  });

  const run = (duration: number, frame: (t: number) => void) =>
    new Promise<void>((resolve) => {
      if (still()) {
        frame(1);
        resolve();
        return;
      }
      const begin = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - begin) / duration);
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

  const units = (by: number) =>
    legs.forEach((_, index) => part(`unit-${index}`)?.setAttribute("transform", translate(moves.channelPerUnit, by)));

  const coinTo = (top: number, by: number) => {
    const [x, y] = moves.coinToStack;
    const [sx, sy] = moves.stackStep;
    part("coin")?.setAttribute("transform", `translate(${(x * by + sx * top * by).toFixed(2)} ${(y * by + sy * top * by - Math.sin(by * Math.PI) * 18).toFixed(2)})`);
  };

  /** Each listed leg's chit lifts out of the rack and lands in the wallet as an ingot. */
  async function deliver(indices: number[]) {
    await run(1000, (t) => indices.forEach((index, order) => {
      const by = phase(t, order * 0.12, 0.76 + order * 0.12);
      part(`chit-${index}`)?.setAttribute("transform", translate(moves.chitToWallet[index], by, Math.sin(by * Math.PI) * 26));
    }));
    indices.forEach((index) => { show(`chit-${index}`, false); part(`chit-${index}`)?.setAttribute("transform", ""); });
    const { held, delivered } = model.current;
    commit({
      held: held.map((value, index) => (indices.includes(index) ? 0n : value)),
      delivered: delivered.map((count, index) => (indices.includes(index) ? Math.min(walletDepth, count + 1) : count)),
    });
  }

  async function doStrike() {
    const { supply, frozen } = model.current;
    legs.forEach((_, index) => show(`unit-${index}`, true));
    if (frozen !== null) {
      // Strike is one transaction: the frozen leg cannot move in, so every leg goes back.
      await run(800, (t) => units(phase(t, 0, 1) * moves.gateStopUnits));
      commit({ status: `Strike refused: ${legs[frozen].symbol} is frozen by its issuer, so nothing moved.` });
      await run(700, (t) => units((1 - phase(t, 0.3, 1)) * moves.gateStopUnits));
    } else {
      const paid = legs.map((_, index) => strike({ supply, leg: { ledger: perShare[index] * supply, unclaimed: 0n } }, 1n).paid);
      await run(900, (t) => units(phase(t, 0, 1) * moves.channelUnits));
      legs.forEach((_, index) => show(`unit-${index}`, false));
      units(0);
      await run(520, (t) => ram(phase(t, 0, 1)));
      show("coin", true);
      await run(520, (t) => ram(1 - phase(t, 0, 1)));
      const top = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax - 1));
      await run(700, (t) => coinTo(top, phase(t, 0, 1)));
      show("coin", false);
      part("coin")?.setAttribute("transform", "");
      commit({ supply: supply + 1n, status: `Struck 1 share for ${listed(legs.map((_, index) => index), paid)}.` });
    }
    legs.forEach((_, index) => show(`unit-${index}`, false));
    units(0);
  }

  async function doMelt() {
    const { supply, frozen, held } = model.current;
    if (supply === 0n) return;
    const credited = legs.map((_, index) => melt({ supply, leg: { ledger: perShare[index] * supply, unclaimed: 0n } }, 1n).credited);
    const top = Number(supply <= BigInt(stackMax) ? supply - 1n : BigInt(stackMax - 1));
    show(`stack-${top}`, false);
    show("coin", true);
    await run(700, (t) => coinTo(top, 1 - phase(t, 0, 1)));
    await run(520, (t) => ram(phase(t, 0, 1)));
    show("coin", false);
    part("coin")?.setAttribute("transform", "");
    await run(520, (t) => ram(1 - phase(t, 0, 1)));
    const filed = held.map((value, index) => value + credited[index]);
    commit({ supply: supply - 1n, held: filed, status: "Melted 1 share: a Claim is filed on every leg." });
    legs.forEach((_, index) => show(`chit-${index}`, true));
    if (!still()) await wait(700);
    // Delivery is each issuer's: every leg but a frozen one leaves the rack.
    const free = legs.map((_, index) => index).filter((index) => index !== frozen);
    await deliver(free);
    commit({ status: frozen === null
      ? `Melted 1 share: ${listed(free, credited)} delivered.`
      : `Melted 1 share: ${listed(free, credited)} delivered. ${amount(filed[frozen], frozen)} held as a Claim until the freeze lifts.` });
  }

  async function setFreeze(on: boolean) {
    if (on) {
      commit({ frozen: FROZEN_LEG, status: `${legs[FROZEN_LEG].symbol} frozen by its issuer. Strike is refused; Melt still delivers the other legs.` });
      return;
    }
    const waiting = model.current.held[FROZEN_LEG];
    commit({ frozen: null });
    if (waiting > 0n) {
      await deliver([FROZEN_LEG]);
      commit({ status: `Freeze lifted: the held ${amount(waiting, FROZEN_LEG)} Claim is delivered.` });
    } else {
      commit({ status: "Freeze lifted. Strike works again." });
    }
  }

  const act = (move: Move) => enqueue(() => {
    if (move === "strike") return doStrike();
    if (move === "melt") return doMelt();
    return setFreeze(move === "freeze");
  });

  // The tour reads the latest closures through an effect event, so the loop
  // effect itself never restarts as shares are struck and melted.
  const tourStep = useEffectEvent((move: Move) => (touched.current ? Promise.resolve() : act(move)));

  // The idle tour runs only while the press is on screen, one move after another.
  useEffect(() => {
    const node = stage.current;
    if (!node || still()) return;
    let alive = true;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(node);
    void (async () => {
      for (let index = 0; alive && !touched.current; index += 1) {
        await wait(1800);
        while (alive && !visible) await wait(400);
        if (alive) await tourStep(TOUR[index % TOUR.length]);
      }
    })();
    return () => { alive = false; observer.disconnect(); };
  }, []);

  const frozenView = view.frozen === FROZEN_LEG;
  return (
    <div className={styles.press}>
      <div className={styles.stage} ref={stage} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className={styles.panel}>
        <div className={styles.controls}>
          <button type="button" onClick={() => { touched.current = true; void act("strike"); }}>Strike 1 share</button>
          <button type="button" onClick={() => { touched.current = true; void act("melt"); }} disabled={view.supply === 0n}>Melt 1 share</button>
          <label>
            <input type="checkbox" checked={frozenView} onChange={() => { touched.current = true; void act(frozenView ? "thaw" : "freeze"); }} />
            <span>Issuer freezes {legs[FROZEN_LEG].symbol}</span>
          </label>
          <small className={styles.source}>Illustrative Formula</small>
        </div>
        <p className={styles.status} role="status" aria-live="polite" data-frozen={view.frozen === null ? undefined : ""}>{view.status}</p>
      </div>
    </div>
  );
}
