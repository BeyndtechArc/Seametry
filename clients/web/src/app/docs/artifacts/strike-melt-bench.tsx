"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/amount";
import { melt, out, requiredIn, strike, type RecipeState } from "@/lib/hall/recipe";
import styles from "./artifacts.module.css";

type Props = { scale: number; initial: { ledger: string; unclaimed: string; supply: string } };

const grouped = (value: bigint) => value.toLocaleString("en-GB");
const atoms = (value: bigint) => `${grouped(value)} ${value === 1n ? "atom" : "atoms"}`;

/** Exact division shown as quotient and remainder, so no decimal is ever estimated. */
function division(numerator: bigint, denominator: bigint) {
  return { quotient: numerator / denominator, remainder: numerator % denominator };
}

/**
 * Strike and Melt one constituent of an Alloy, starting from the state the
 * specification's "strike and melt with rounding" vector starts from. Every
 * figure is integer atoms from lib/hall/recipe.ts, which replays that vector.
 */
export function StrikeMeltBench({ scale, initial }: Props) {
  const start: RecipeState = { supply: BigInt(initial.supply), leg: { ledger: BigInt(initial.ledger), unclaimed: BigInt(initial.unclaimed) } };
  const [state, setState] = useState(start);
  const [shares, setShares] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  const n = BigInt(shares);
  const product = n * state.leg.ledger;
  const { quotient, remainder } = division(product, state.supply);
  const pay = requiredIn(state.leg.ledger, n, state.supply);
  const roundTrip = strike(state, n);
  const back = out(roundTrip.state.leg.ledger, n, roundTrip.state.supply);
  const kept = pay - back;
  const canMelt = n <= state.supply;

  const apply = (operation: "strike" | "melt") => {
    if (operation === "strike") {
      const next = strike(state, n);
      setHistory((lines) => [`Struck ${grouped(n)} ${n === 1n ? "share" : "shares"}, paid ${atoms(next.paid)}.`, ...lines].slice(0, 6));
      setState(next.state);
    } else {
      const next = melt(state, n);
      setHistory((lines) => [`Melted ${grouped(n)} ${n === 1n ? "share" : "shares"}, Claim credited ${atoms(next.credited)}.`, ...lines].slice(0, 6));
      setState(next.state);
    }
  };

  return (
    <figure className={styles.artifact} aria-label="Strike and Melt bench">
      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Shares</span>
          <input type="range" min={1} max={1000} value={shares} onChange={(event) => setShares(Number(event.target.value))} aria-valuetext={`${shares} shares`} />
          <output>{grouped(n)}</output>
        </label>
      </div>

      <dl className={styles.ledger}>
        <div><dt>Shares in existence</dt><dd>{grouped(state.supply)}</dd></div>
        <div><dt>Held by the Hall for them</dt><dd>{atoms(state.leg.ledger)}</dd></div>
        <div><dt>Owed as Claims</dt><dd>{atoms(state.leg.unclaimed)}</dd></div>
      </dl>

      <pre className={styles.working} aria-label="The arithmetic for this many shares">
        <code>{[
          `${grouped(n)} × ${grouped(state.leg.ledger)} ÷ ${grouped(state.supply)}`,
          `= ${grouped(quotient)} remainder ${grouped(remainder)}`,
          `Strike pays  ${atoms(pay)}   (${remainder === 0n ? "exact" : "rounded up"})`,
          `Melt credits ${atoms(quotient)}   (${remainder === 0n ? "exact" : "rounded down"})`,
        ].join("\n")}</code>
      </pre>

      <p className={styles.verdict} role="status">
        Strike {grouped(n)} and Melt them straight back: you pay {grouped(pay)}, your Claim gets {grouped(back)}.{" "}
        {kept === 0n ? "Nothing is lost at this size." : `${grouped(kept)} ${kept === 1n ? "atom stays" : "atoms stay"} with the Hall, so a round trip can never be used to take a fraction for free.`}{" "}
        That is {formatAmount(kept, scale)} of a unit at this constituent&apos;s {scale} decimals.
      </p>

      <div className={styles.actions}>
        <button type="button" onClick={() => apply("strike")}>Strike {grouped(n)}</button>
        <button type="button" onClick={() => apply("melt")} disabled={!canMelt}>Melt {grouped(n)}</button>
        <button type="button" onClick={() => { setState(start); setHistory([]); }}>Start again</button>
      </div>
      {history.length > 0 ? (
        <ol className={styles.history} aria-label="What you did">
          {history.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
        </ol>
      ) : null}
      <figcaption>
        Starting state and rounding from <code>shared/spec/recipe/vectors.json</code>, &ldquo;strike and melt with rounding&rdquo;, the vectors the Hall program is tested against. One constituent shown; a real Alloy repeats this for every leg.
      </figcaption>
    </figure>
  );
}
