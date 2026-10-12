"use client";

import { useEffect, useRef } from "react";
import { melt } from "@/lib/hall/recipe";
import styles from "./press.module.css";

type Flat = [number, number];
type Moves = {
  ramPerUnit: Flat; channelPerUnit: Flat; gateDrop: Flat; coinToStack: Flat; stackStep: Flat; ingotStep: Flat;
  dieToChit: Flat[]; walletToDie: Flat[]; vaultToWallet: Flat[];
  strokeUnits: number; channelUnits: number; gateStopFromPress: number;
};
type Move = "strike" | "melt" | "freeze" | "thaw";
/** Shares outstanding, the frozen leg, Claims recorded per leg, and ingots per leg in the wallet. */
type Model = { supply: bigint; frozen: number | null; held: bigint[]; wallet: number[] };

const FROZEN_LEG = 1;
const WALLET_START = 2;
// One full story, ending where it began so it can repeat: two Strikes spend
// the wallet's ingots into the vault, a Melt pays them back, then a freeze
// stops a Strike at its gate and holds one Claim through a Melt until it lifts.
const TOUR: Move[] = ["strike", "strike", "melt", "freeze", "strike", "melt", "thaw"];

/** Exponential ease in and out, so every move starts and lands softly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const phase = (t: number, from: number, to: number) => ease(Math.min(1, Math.max(0, (t - from) / (to - from))));
const offset = ([x, y]: Flat, by: number, [ox, oy]: Flat = [0, 0], lift = 0) =>
  `translate(${(x * by + ox).toFixed(2)} ${(y * by + oy - lift).toFixed(2)})`;
const translate = (vector: Flat, by: number, lift = 0) => offset(vector, by, [0, 0], lift);
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
    let model: Model = { supply: BigInt(initialSupply), frozen: null, held: legs.map(() => 0n), wallet: legs.map(() => WALLET_START) };
    let alive = true;
    let visible = false;

    const part = (name: string) => node.querySelector<SVGGElement>(`[data-part="${name}"]`);
    const show = (name: string, on: boolean) => part(name)?.toggleAttribute("data-hidden", !on);
    const place = (name: string, transform: string) => part(name)?.setAttribute("transform", transform);

    // Resting state written as attributes: the shares stack, the wallet's
    // ingots, the recorded Claims (a held one marked), and the freeze's
    // collar, padlock, note and gate.
    const commit = (change: Partial<Model>) => {
      model = { ...model, ...change };
      const { supply, frozen, held, wallet } = model;
      const shown = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax));
      for (let index = 0; index < stackMax; index += 1) {
        show(`stack-${index}`, index < shown);
        show(`stack-lit-${index}`, index === shown - 1);
      }
      for (const leg of legs) {
        show(`chit-${leg}`, held[leg] > 0n);
        part(`chit-${leg}`)?.toggleAttribute("data-held", frozen === leg && held[leg] > 0n);
        for (let index = 0; index < walletDepth; index += 1) show(`ingot-${leg}-${index}`, index < wallet[leg]);
        for (const name of ["padlock", "band", "frozen-note"]) show(`${name}-${leg}`, frozen === leg);
        place(`gate-${leg}`, frozen === leg ? translate(moves.gateDrop, 1) : "");
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
      place("ram-lower", translate(moves.ramPerUnit, by * moves.strokeUnits));
      place("ram-upper", translate(moves.ramPerUnit, by * moves.strokeUnits));
    };
    const coinTo = (top: number, by: number) => {
      const [x, y] = moves.coinToStack;
      const [sx, sy] = moves.stackStep;
      place("coin", `translate(${(x * by + sx * top * by).toFixed(2)} ${(y * by + sy * top * by - Math.sin(by * Math.PI) * 18).toFixed(2)})`);
    };

    /** The top ingot of every wallet lane lifts and drops into the die: the deposit a Strike takes. */
    async function deposit() {
      const tops = legs.map((leg) => model.wallet[leg] - 1);
      await run(1000, (t) => legs.forEach((leg, order) => {
        const by = phase(t, order * 0.1, 0.8 + order * 0.1);
        const [sx, sy] = moves.ingotStep;
        place(`ingot-${leg}-${tops[leg]}`, offset(moves.walletToDie[leg], by, [-sx * tops[leg] * by, -sy * tops[leg] * by], Math.sin(by * Math.PI) * 40));
      }));
      legs.forEach((leg) => { show(`ingot-${leg}-${tops[leg]}`, false); place(`ingot-${leg}-${tops[leg]}`, ""); });
    }

    /** Units leave the press down their channels toward the vault; returns once they arrive or stop. */
    async function intoVault(frozen: number | null) {
      legs.forEach((leg) => { place(`unit-${leg}`, translate(moves.channelPerUnit, moves.channelUnits)); show(`unit-${leg}`, true); });
      const end = (leg: number) => (leg === frozen ? moves.gateStopFromPress : 0);
      await run(900, (t) => legs.forEach((leg) => {
        const travelled = moves.channelUnits + (end(leg) - moves.channelUnits) * phase(t, 0, 1);
        place(`unit-${leg}`, translate(moves.channelPerUnit, frozen === null || leg === frozen ? travelled : Math.max(travelled, moves.gateStopFromPress)));
      }));
      if (frozen !== null) {
        // The frozen leg jolts against its closed gate, and the others wait with it: one transaction.
        await run(420, (t) => place(`unit-${frozen}`, translate(moves.channelPerUnit, moves.gateStopFromPress + Math.sin(t * Math.PI * 3) * (1 - t) * 2.4)));
        await wait(450);
      }
      legs.forEach((leg) => { show(`unit-${leg}`, false); place(`unit-${leg}`, ""); });
    }

    async function doStrike() {
      const { supply, frozen, wallet } = model;
      await deposit();
      commit({ wallet: wallet.map((count) => count - 1) });
      await intoVault(frozen);
      if (frozen !== null) {
        // Nothing moved: the wallet still holds what it offered.
        commit({ wallet });
        return;
      }
      await run(480, (t) => ram(phase(t, 0, 1)));
      show("coin", true);
      await run(480, (t) => ram(1 - phase(t, 0, 1)));
      const top = Number(supply < BigInt(stackMax) ? supply : BigInt(stackMax - 1));
      await run(700, (t) => coinTo(top, phase(t, 0, 1)));
      show("coin", false);
      place("coin", "");
      commit({ supply: supply + 1n });
    }

    /** Each listed leg's vault pays one unit to the wallet, settling its recorded Claim. */
    async function payOut(indices: number[]) {
      indices.forEach((leg) => { show(`chit-${leg}`, false); show(`parcel-${leg}`, true); });
      await run(1100, (t) => indices.forEach((leg, order) => {
        const by = phase(t, order * 0.1, 0.8 + order * 0.1);
        const [sx, sy] = moves.ingotStep;
        const lane = model.wallet[leg];
        place(`parcel-${leg}`, offset(moves.vaultToWallet[leg], by, [sx * lane * by, sy * lane * by], Math.sin(by * Math.PI) * 70));
      }));
      indices.forEach((leg) => { show(`parcel-${leg}`, false); place(`parcel-${leg}`, ""); });
      commit({
        held: model.held.map((value, leg) => (indices.includes(leg) ? 0n : value)),
        wallet: model.wallet.map((count, leg) => (indices.includes(leg) ? Math.min(walletDepth, count + 1) : count)),
      });
    }

    async function doMelt() {
      const { supply, frozen, held } = model;
      if (supply === 0n) return;
      const credited = legs.map((leg) => melt({ supply, leg: { ledger: perShare[leg] * supply, unclaimed: 0n } }, 1n).credited);
      const top = Number(supply <= BigInt(stackMax) ? supply - 1n : BigInt(stackMax - 1));
      show(`stack-${top}`, false);
      show("coin", true);
      await run(700, (t) => coinTo(top, 1 - phase(t, 0, 1)));
      await run(480, (t) => ram(phase(t, 0, 1)));
      show("coin", false);
      place("coin", "");
      // The ram lifts off one Claim per leg, which rise from the die and are recorded in the rack.
      legs.forEach((leg) => { place(`chit-${leg}`, translate(moves.dieToChit[leg], -1)); show(`chit-${leg}`, true); });
      await run(480, (t) => ram(1 - phase(t, 0, 1)));
      await run(1100, (t) => legs.forEach((leg, order) => {
        const by = phase(t, order * 0.1, 0.8 + order * 0.1);
        place(`chit-${leg}`, translate(moves.dieToChit[leg], by - 1, Math.sin(by * Math.PI) * 30));
      }));
      legs.forEach((leg) => place(`chit-${leg}`, ""));
      commit({ supply: supply - 1n, held: held.map((value, leg) => value + credited[leg]) });
      await wait(600);
      // Delivery is each issuer's: every vault but a frozen one pays out.
      await payOut(legs.filter((leg) => leg !== frozen));
    }

    async function setFreeze(on: boolean) {
      commit({ frozen: on ? FROZEN_LEG : null });
      if (!on && model.held[FROZEN_LEG] > 0n) {
        await wait(400);
        await payOut([FROZEN_LEG]);
      }
    }

    if (still()) {
      // The story's most telling moment as one picture: a freeze, and a Melt
      // that paid every leg but the frozen one, whose Claim stays recorded.
      commit({ frozen: FROZEN_LEG, held: legs.map((leg) => (leg === FROZEN_LEG ? perShare[leg] : 0n)), wallet: legs.map((leg) => (leg === FROZEN_LEG ? WALLET_START - 1 : WALLET_START)) });
      return;
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(node);
    commit({});
    void (async () => {
      for (let index = 0; alive; index += 1) {
        await wait(1600);
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
