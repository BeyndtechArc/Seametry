"use client";

import { useEffect, useRef } from "react";
import { melt } from "@/lib/hall/recipe";
import styles from "./press.module.css";

type Flat = [number, number];
type Moves = { ramPerUnit: Flat; channelPerUnit: Flat; gateDrop: Flat; coinToStack: Flat; stackStep: Flat; chitToWallet: Flat[]; strokeUnits: number; channelUnits: number; gateStopUnits: number };
type Move = "strike" | "melt" | "freeze" | "thaw";
/** Claims filed in the rack and ingots delivered to the wallet are per leg. */
type Model = { supply: bigint; frozen: number | null; held: bigint[]; delivered: number[] };

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

/**
 * The press plays the Hall's story on its own, with nothing beside it: the
 * drawing is the explanation. It only rests while it is off screen, and under
 * reduced motion, where it stays a still picture.
 */
export function HallPressLive({ svg, moves, formula, initialSupply, stackMax, walletDepth }: {
  svg: string;
  moves: Moves;
  formula: string[];
  initialSupply: number;
  stackMax: number;
  walletDepth: number;
}) {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const perShare = formula.map(BigInt);
    const legs = perShare.map((_, index) => index);
    let model: Model = { supply: BigInt(initialSupply), frozen: null, held: legs.map(() => 0n), delivered: legs.map(() => 0) };
    let alive = true;
    let visible = false;

    const part = (name: string) => node.querySelector<SVGGElement>(`[data-part="${name}"]`);
    const show = (name: string, on: boolean) => part(name)?.toggleAttribute("data-hidden", !on);
    const mark = (name: string, attribute: string, on: boolean) => part(name)?.toggleAttribute(attribute, on);

    // Resting state written as attributes: the stack, the rack's chits (a held
    // one marked), the wallet's ingots, the freeze band, padlock and gate.
    const commit = (change: Partial<Model>) => {
      model = { ...model, ...change };
      const { supply, frozen, held, delivered } = model;
      const shown = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax));
      for (let index = 0; index < stackMax; index += 1) {
        show(`stack-${index}`, index < shown);
        show(`stack-lit-${index}`, index === shown - 1);
      }
      for (const leg of legs) {
        show(`chit-${leg}`, held[leg] > 0n);
        mark(`chit-${leg}`, "data-held", frozen === leg && held[leg] > 0n);
        for (let index = 0; index < walletDepth; index += 1) show(`ingot-${leg}-${index}`, index < delivered[leg]);
        show(`padlock-${leg}`, frozen === leg);
        show(`band-${leg}`, frozen === leg);
        part(`gate-${leg}`)?.setAttribute("transform", frozen === leg ? translate(moves.gateDrop, 1) : "");
      }
    };

    const run = (duration: number, frame: (t: number) => void) =>
      new Promise<void>((resolve) => {
        const begin = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - begin) / duration);
          frame(t);
          if (t < 1 && alive) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });

    const ram = (by: number) => {
      const offset = translate(moves.ramPerUnit, by * moves.strokeUnits);
      part("ram-lower")?.setAttribute("transform", offset);
      part("ram-upper")?.setAttribute("transform", offset);
    };
    const units = (by: number) => legs.forEach((leg) => part(`unit-${leg}`)?.setAttribute("transform", translate(moves.channelPerUnit, by)));
    const coinTo = (top: number, by: number) => {
      const [x, y] = moves.coinToStack;
      const [sx, sy] = moves.stackStep;
      part("coin")?.setAttribute("transform", `translate(${(x * by + sx * top * by).toFixed(2)} ${(y * by + sy * top * by - Math.sin(by * Math.PI) * 18).toFixed(2)})`);
    };

    /** Each listed leg's chit lifts out of the rack and lands in the wallet as an ingot. */
    async function deliver(indices: number[]) {
      await run(1000, (t) => indices.forEach((leg, order) => {
        const by = phase(t, order * 0.12, 0.76 + order * 0.12);
        part(`chit-${leg}`)?.setAttribute("transform", translate(moves.chitToWallet[leg], by, Math.sin(by * Math.PI) * 26));
      }));
      indices.forEach((leg) => { show(`chit-${leg}`, false); part(`chit-${leg}`)?.setAttribute("transform", ""); });
      commit({
        held: model.held.map((value, leg) => (indices.includes(leg) ? 0n : value)),
        delivered: model.delivered.map((count, leg) => (indices.includes(leg) ? Math.min(walletDepth, count + 1) : count)),
      });
    }

    async function doStrike() {
      const { supply, frozen } = model;
      legs.forEach((leg) => show(`unit-${leg}`, true));
      if (frozen !== null) {
        // Strike is one transaction: the frozen leg cannot move in, so every leg goes back.
        await run(800, (t) => units(phase(t, 0, 1) * moves.gateStopUnits));
        await run(900, (t) => units((1 - phase(t, 0.35, 1)) * moves.gateStopUnits));
      } else {
        await run(900, (t) => units(phase(t, 0, 1) * moves.channelUnits));
        legs.forEach((leg) => show(`unit-${leg}`, false));
        units(0);
        await run(520, (t) => ram(phase(t, 0, 1)));
        show("coin", true);
        await run(520, (t) => ram(1 - phase(t, 0, 1)));
        const top = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax - 1));
        await run(700, (t) => coinTo(top, phase(t, 0, 1)));
        show("coin", false);
        part("coin")?.setAttribute("transform", "");
        commit({ supply: supply + 1n });
      }
      legs.forEach((leg) => show(`unit-${leg}`, false));
      units(0);
    }

    async function doMelt() {
      const { supply, frozen, held } = model;
      if (supply === 0n) return;
      const credited = legs.map((leg) => melt({ supply, leg: { ledger: perShare[leg] * supply, unclaimed: 0n } }, 1n).credited);
      const top = Number(supply <= BigInt(stackMax) ? supply - 1n : BigInt(stackMax - 1));
      show(`stack-${top}`, false);
      show("coin", true);
      await run(700, (t) => coinTo(top, 1 - phase(t, 0, 1)));
      await run(520, (t) => ram(phase(t, 0, 1)));
      show("coin", false);
      part("coin")?.setAttribute("transform", "");
      await run(520, (t) => ram(1 - phase(t, 0, 1)));
      commit({ supply: supply - 1n, held: held.map((value, leg) => value + credited[leg]) });
      await wait(700);
      // Delivery is each issuer's: every leg but a frozen one leaves the rack.
      await deliver(legs.filter((leg) => leg !== frozen));
    }

    async function setFreeze(on: boolean) {
      commit({ frozen: on ? FROZEN_LEG : null });
      if (!on && model.held[FROZEN_LEG] > 0n) await deliver([FROZEN_LEG]);
    }

    if (still()) {
      // The story's most telling moment as one picture: a freeze, and a Melt
      // that delivered every leg but the frozen one.
      commit({ frozen: FROZEN_LEG, held: legs.map((leg) => (leg === FROZEN_LEG ? perShare[leg] : 0n)), delivered: legs.map((leg) => (leg === FROZEN_LEG ? 0 : 1)) });
      return;
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(node);
    commit({});
    void (async () => {
      for (let index = 0; alive; index += 1) {
        await wait(1800);
        while (alive && !visible) await wait(400);
        if (!alive) return;
        const move = TOUR[index % TOUR.length];
        if (move === "strike") await doStrike();
        else if (move === "melt") await doMelt();
        else await setFreeze(move === "freeze");
      }
    })();
    return () => { alive = false; observer.disconnect(); };
  }, [formula, initialSupply, moves, stackMax, walletDepth]);

  return <div className={styles.stage} ref={stage} dangerouslySetInnerHTML={{ __html: svg }} />;
}
