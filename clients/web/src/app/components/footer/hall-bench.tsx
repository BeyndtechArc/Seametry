"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Coin, ShareTile } from "../drawn/token-art";
import styles from "./hall-bench.module.css";

// components.md, Hall bench: the footer's scene, a bench model of the Hall
// that the reader works by hand. It plays by the Hall's rules as HALL.md
// states them and the recorded incident shows: a Strike takes every leg at
// once or nothing; a freeze on the Hall's account for one leg refuses a
// Strike outright; a Melt still succeeds and records a Claim on every leg;
// the frozen leg's Claim stays in the Hall, refused, until the freeze lifts.
// Coins move by transform attributes written from one frame loop, never by
// style, and only when the reader acts; the vault's shake, the tray's punch
// and a coin's lift are CSS answers to the same acts.

export type BenchLeg = { symbol: string; logo?: string };

type Place = "wallet" | "hall";
/** What just happened, then what the reader might try next. */
type Said = [string, string];

const WIDTH = 720;
const HEIGHT = 340;
const WALLET_Y = 62;
const HALL_Y = 182;
const SHARE_Y = 292;
const COIN = 26;
const SHARE = 52;
const MOVE_MS = 520;
const STAGGER_MS = 50;
/** The leg an issuer can freeze here. Any would do; this is the one the Strike steps hold. */
const FREEZABLE = 1;
/**
 * The lock sits below the vault, clear of every coin's target: a held
 * coin's 44-unit target reaches the vault's foot, and a lock inside that
 * reach took the press meant for it (Storm, 24 October 2026).
 */
const LOCK_Y = HALL_Y + 70;
/** The ring a coin shows when pointed at or focused, the coin's own outer ring. */
const RING = COIN * 1.22;

const slotX = (index: number, count: number) => WIDTH / 2 + (index - (count - 1) / 2) * 100;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function pressable(action: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: action,
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      action();
    },
  } as const;
}

export function HallBench({ legs, symbol, artwork }: { legs: BenchLeg[]; symbol: string; artwork: string }) {
  const [places, setPlaces] = useState<Place[]>(() => legs.map(() => "wallet"));
  const [shares, setShares] = useState(0);
  const [frozen, setFrozen] = useState(false);
  // A refusal sends the refused coins to the Hall's lip and straight back:
  // every wallet coin for a refused Strike, the held coin for a refused
  // withdrawal. Numbered, so the same refusal twice still bounces twice,
  // and the vault shakes once for each.
  const [refusal, setRefusal] = useState<{ id: number; coins: number[] }>({ id: 0, coins: [] });
  // Numbered for the same reason: each Strike punches the tray once.
  const [strikes, setStrikes] = useState(0);
  const [said, setSaid] = useState<Said>(["Tap a stock to Strike a share.", "Tap the lock to freeze one leg."]);
  const coins = useRef<(SVGGElement | null)[]>([]);
  const drawn = useRef<{ x: number; y: number }[]>(legs.map((_, index) => ({ x: slotX(index, legs.length), y: WALLET_Y })));
  const frame = useRef(0);
  const bounced = useRef(0);

  const frozenLeg = legs[FREEZABLE];
  const claimHeld = places[FREEZABLE] === "hall" && shares === 0;

  const strike = () => {
    if (claimHeld) {
      setSaid([`A Strike needs every leg; ${frozenLeg.symbol} is still a Claim.`, frozen ? "Lift the freeze, then withdraw the Claim." : "Tap the Claim to withdraw it first."]);
      return;
    }
    if (frozen) {
      setRefusal((value) => ({ id: value.id + 1, coins: legs.map((_, index) => index) }));
      setSaid([`Refused: the Hall's account for ${frozenLeg.symbol} is frozen. Nothing moved.`, "Tap the lock to lift the freeze."]);
      return;
    }
    setPlaces(legs.map(() => "hall"));
    setShares(1);
    setStrikes((value) => value + 1);
    setSaid([`Struck 1 ${symbol}. The Hall holds every leg.`, "Tap the share to Melt it, or freeze a leg first."]);
  };

  const melt = () => {
    setShares(0);
    setPlaces(legs.map((_, index) => (frozen && index === FREEZABLE ? "hall" : "wallet")));
    setSaid(frozen
      ? [`Melted 1 ${symbol}. ${frozenLeg.symbol} stays yours as a Claim.`, "Tap the Claim to withdraw it."]
      : [`Melted 1 ${symbol}. Every leg came back to your wallet.`, "Tap a stock to Strike again."]);
  };

  const withdraw = () => {
    if (frozen) {
      setRefusal((value) => ({ id: value.id + 1, coins: [FREEZABLE] }));
      setSaid([`Refused: ${frozenLeg.symbol} is still frozen.`, "Lift the freeze, then withdraw the Claim."]);
      return;
    }
    setPlaces(legs.map(() => "wallet"));
    setSaid([`Withdrew the ${frozenLeg.symbol} Claim. Your wallet is whole.`, "Tap a stock to Strike again."]);
  };

  const toggleFreeze = () => {
    const next = !frozen;
    setFrozen(next);
    if (next) {
      setSaid([`The issuer froze the Hall's account for ${frozenLeg.symbol}.`, shares > 0 ? `Melt anyway, and watch ${frozenLeg.symbol}.` : "Try to Strike now."]);
    } else {
      setSaid([`The issuer lifted the freeze on ${frozenLeg.symbol}.`, claimHeld ? "Tap the Claim to withdraw it." : shares > 0 ? "Tap the share to Melt it." : "Tap a stock to Strike a share."]);
    }
  };

  const touch = (index: number) => {
    if (places[index] === "wallet") return strike();
    if (shares > 0) return melt();
    return withdraw();
  };

  // Every change of place moves the coins from where they were drawn to where
  // they now belong; a refusal moves the refused coins to the Hall's lip and
  // back. Run before paint, so a coin is never seen at its new place first.
  useLayoutEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fresh = refusal.id !== bounced.current;
    bounced.current = refusal.id;
    const routes = legs.map((_, index) => {
      const from = drawn.current[index];
      const to = { x: slotX(index, legs.length), y: places[index] === "hall" ? HALL_Y : WALLET_Y };
      // A wallet coin bounces off the Hall's lip; a held coin rises toward the wallet and drops back.
      const lip = places[index] === "wallet" ? HALL_Y - COIN * 2.6 : HALL_Y - COIN * 2.2;
      return { from, to, via: fresh && refusal.coins.includes(index) ? { x: to.x, y: lip } : undefined };
    });
    const write = (index: number, point: { x: number; y: number }) => {
      drawn.current[index] = point;
      coins.current[index]?.setAttribute("transform", `translate(${(point.x - slotX(index, legs.length)).toFixed(2)} ${(point.y - WALLET_Y).toFixed(2)})`);
    };
    cancelAnimationFrame(frame.current);
    if (reduced) {
      routes.forEach((route, index) => write(index, route.to));
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      let running = false;
      routes.forEach((route, index) => {
        const t = Math.min(1, Math.max(0, (now - start - index * STAGGER_MS) / MOVE_MS));
        if (t < 1) running = true;
        if (route.via) {
          // Out to the lip and back: the first half goes, the second returns.
          const leg = t < 0.5 ? ease(t * 2) : 1 - ease((t - 0.5) * 2);
          write(index, { x: route.from.x, y: route.from.y + (route.via.y - route.from.y) * leg });
        } else {
          const k = ease(t);
          write(index, { x: route.from.x + (route.to.x - route.from.x) * k, y: route.from.y + (route.to.y - route.from.y) * k });
        }
      });
      if (running) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [places, refusal, legs]);

  const lockX = slotX(FREEZABLE, legs.length);

  return (
    <div className={styles.bench}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.scene} role="group" aria-label={`A bench model of the Hall holding ${symbol}'s six legs`}>
        <defs>
          <pattern id="bench-floor" width={16} height={16} patternUnits="userSpaceOnUse">
            <circle cx={8} cy={8} r={0.8} className={styles.floorDot} />
          </pattern>
          <pattern id="bench-frost" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} className={styles.frost} />
          </pattern>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#bench-floor)" />

        <text x={24} y={22} className={styles.label}>Your wallet</text>
        <line x1={24} y1={WALLET_Y + COIN + 14} x2={WIDTH - 24} y2={WALLET_Y + COIN + 14} className={styles.ledge} />

        <text x={24} y={HALL_Y - 56} className={styles.label}>The Hall</text>
        {/* Keyed by the refusal, so each refusal shakes the vault once. */}
        <g key={refusal.id} className={styles.vaultGroup} data-shake={refusal.id > 0 ? "" : undefined}>
          <rect x={40} y={HALL_Y - 44} width={WIDTH - 80} height={88} className={styles.vault} />
          <rect x={46} y={HALL_Y - 38} width={WIDTH - 92} height={76} className={styles.vaultInner} />
          {[[48, HALL_Y - 36], [WIDTH - 48, HALL_Y - 36], [48, HALL_Y + 36], [WIDTH - 48, HALL_Y + 36]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} className={styles.rivet} />
          ))}
          {legs.map((leg, index) => {
            const x = slotX(index, legs.length);
            const frost = frozen && index === FREEZABLE;
            return (
              <g key={leg.symbol}>
                <line x1={x} y1={WALLET_Y + COIN + 20} x2={x} y2={HALL_Y - COIN - 10} className={styles.rail} />
                <circle cx={x} cy={HALL_Y} r={COIN + 4} className={styles.slot} data-filled={places[index] === "hall" ? "" : undefined} data-frozen={frost ? "" : undefined} />
                {frost ? <circle cx={x} cy={HALL_Y} r={COIN + 4} fill="url(#bench-frost)" className={styles.frostField} /> : null}
              </g>
            );
          })}
        </g>

        <g className={styles.lock} data-frozen={frozen ? "" : undefined} aria-label={frozen ? `Lift the freeze on ${frozenLeg.symbol}` : `Freeze the Hall's account for ${frozenLeg.symbol}`} aria-pressed={frozen} {...pressable(toggleFreeze)}>
          <rect x={lockX - 22} y={LOCK_Y - 22} width={44} height={44} className={styles.hit} />
          <rect x={lockX - 7} y={LOCK_Y - 3} width={14} height={11} className={styles.lockBody} />
          <path d={`M${lockX - 4.5} ${LOCK_Y - 3}v-4a4.5 4.5 0 0 1 9 0v${frozen ? 4 : -2}`} className={styles.lockShackle} />
          <text x={lockX + 16} y={LOCK_Y + 7} className={styles.label}>Issuer</text>
        </g>

        <line x1={WIDTH / 2} y1={HALL_Y + 44} x2={WIDTH / 2} y2={SHARE_Y - SHARE / 2 - 6} className={styles.rail} />
        <text x={WIDTH / 2 + SHARE / 2 + 22} y={SHARE_Y + 6} className={styles.count}>{shares} {symbol}</text>
        <text x={WIDTH / 2 + SHARE / 2 + 22} y={SHARE_Y + 24} className={styles.label}>Your shares</text>
        <rect x={WIDTH / 2 - SHARE / 2} y={SHARE_Y - SHARE / 2} width={SHARE} height={SHARE} className={styles.tray} />
        {/* Keyed by the Strike, so each one punches the tray once as its share lands. */}
        {strikes > 0 ? <rect key={strikes} x={WIDTH / 2 - SHARE / 2 - 6} y={SHARE_Y - SHARE / 2 - 6} width={SHARE + 12} height={SHARE + 12} className={styles.punch} /> : null}
        {/* The struck share drops from the Hall into the tray; a Melt lifts it away. */}
        <g className={styles.share} data-struck={shares > 0 ? "" : undefined} aria-label={`Melt 1 ${symbol}`} aria-hidden={shares === 0} {...(shares > 0 ? pressable(melt) : {})}>
          <rect x={WIDTH / 2 - 30} y={SHARE_Y - 30} width={60} height={60} className={styles.hit} />
          <ShareTile x={WIDTH / 2} y={SHARE_Y} size={SHARE} artwork={artwork} />
          <rect x={WIDTH / 2 - SHARE / 2} y={SHARE_Y - SHARE / 2} width={SHARE} height={SHARE} className={styles.ring} />
        </g>

        {legs.map((leg, index) => (
          <g
            key={leg.symbol}
            ref={(node) => { coins.current[index] = node; }}
            className={styles.coin}
            aria-label={places[index] === "wallet" ? `Strike with ${leg.symbol}` : shares > 0 ? `Melt 1 ${symbol}` : `Withdraw the ${leg.symbol} Claim`}
            data-place={places[index]}
            data-claim={places[index] === "hall" && shares === 0 ? "" : undefined}
            {...pressable(() => touch(index))}
          >
            <circle cx={slotX(index, legs.length)} cy={WALLET_Y} r={COIN + 18} className={styles.hit} />
            <g className={styles.lift}>
              <Coin id={`bench-${leg.symbol}`} x={slotX(index, legs.length)} y={WALLET_Y} r={COIN} logo={leg.logo} symbol={leg.symbol} />
              <circle cx={slotX(index, legs.length)} cy={WALLET_Y} r={RING} className={styles.ring} />
              <text x={slotX(index, legs.length)} y={WALLET_Y + COIN + 30} textAnchor="middle" className={styles.tag}>{leg.symbol}</text>
            </g>
          </g>
        ))}
        {claimHeld ? <text x={lockX + COIN + 8} y={HALL_Y - COIN} className={styles.claimLabel}>Claim</text> : null}
      </svg>
      <p className={styles.said} role="status">
        <span>{said[0]}</span>
        <span>{said[1]}</span>
      </p>
    </div>
  );
}
