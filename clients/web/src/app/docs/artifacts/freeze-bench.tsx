"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/amount";
import { out } from "@/lib/hall/recipe";
import styles from "./artifacts.module.css";

// An illustrative Formula, labelled as one on the page: three constituents at
// six decimals, 1,000 shares outstanding. The behaviour it shows is the
// Hall's (HALL.md 4.3 and 4.6); the quantities are an example.
const SCALE = 6;
const SUPPLY = 1000n;
const legs = [
  { symbol: "AAPLx", perShare: 2_000_000n },
  { symbol: "NVDAx", perShare: 1_500_000n },
  { symbol: "TSLAx", perShare: 250_000n },
];

type Stage = "holding" | "melted" | "withdrawn";

/**
 * One frozen leg, two exits. The obvious redemption moves every constituent in
 * one transaction, so one frozen leg reverts all of it. The Hall's Melt moves
 * no constituent: it burns shares and credits a Claim on every leg, and each
 * leg is then withdrawn on its own.
 */
export function FreezeBench() {
  const [shares, setShares] = useState(10);
  const [frozen, setFrozen] = useState<Record<string, boolean>>({ NVDAx: true });
  const [stage, setStage] = useState<Stage>("holding");
  const n = BigInt(shares);
  const anyFrozen = legs.some((leg) => frozen[leg.symbol]);
  const claims = legs.map((leg) => ({ ...leg, units: out(leg.perShare * SUPPLY, n, SUPPLY) }));

  const reset = (change: () => void) => {
    change();
    setStage("holding");
  };

  return (
    <figure className={styles.artifact} aria-label="One frozen leg, two exits">
      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Shares to return</span>
          <input type="range" min={1} max={100} value={shares} onChange={(event) => reset(() => setShares(Number(event.target.value)))} aria-valuetext={`${shares} shares`} />
          <output>{shares}</output>
        </label>
        <fieldset className={styles.toggles}>
          <legend>Issuer freezes the Hall&apos;s account for</legend>
          {legs.map((leg) => (
            <label key={leg.symbol}>
              <input type="checkbox" checked={Boolean(frozen[leg.symbol])} onChange={(event) => reset(() => setFrozen({ ...frozen, [leg.symbol]: event.target.checked }))} />
              <span>{leg.symbol}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className={styles.compare}>
        <section aria-label="The obvious redemption">
          <h4>The obvious redemption</h4>
          <p>Burn the shares and transfer every constituent back, in one transaction.</p>
          <ol className={styles.legRows}>
            {claims.map((leg) => (
              <li key={leg.symbol} data-outcome={anyFrozen ? "reverted" : "delivered"}>
                <b>{leg.symbol}</b>
                <span>{anyFrozen ? "Reverts" : `Delivers ${formatAmount(leg.units, SCALE)}`}</span>
              </li>
            ))}
          </ol>
          <p className={styles.verdict}>
            {anyFrozen
              ? `One frozen leg reverts the whole transaction. You keep your shares and receive nothing, until every issuer allows every transfer at once.`
              : "With nothing frozen, both exits deliver the same constituents."}
          </p>
        </section>

        <section aria-label="The Hall">
          <h4>The Hall</h4>
          <p>Melt first, which moves no constituent. Then withdraw each leg on its own.</p>
          <ol className={styles.legRows}>
            {claims.map((leg) => {
              const outcome = stage === "holding" ? "waiting" : stage === "melted" ? "claimed" : frozen[leg.symbol] ? "held" : "delivered";
              return (
                <li key={leg.symbol} data-outcome={outcome}>
                  <b>{leg.symbol}</b>
                  <span>
                    {outcome === "waiting"
                      ? `${formatAmount(leg.units, SCALE)} to claim`
                      : outcome === "claimed"
                        ? `Claim credited ${formatAmount(leg.units, SCALE)}`
                        : outcome === "held"
                          ? `Held as a Claim of ${formatAmount(leg.units, SCALE)}; withdraw when the issuer allows it`
                          : `Delivered ${formatAmount(leg.units, SCALE)}`}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className={styles.actions}>
            {stage === "holding" ? <button type="button" onClick={() => setStage("melted")}>Melt {shares} {shares === 1 ? "share" : "shares"}</button> : null}
            {stage === "melted" ? <button type="button" onClick={() => setStage("withdrawn")}>Withdraw each leg</button> : null}
            {stage === "withdrawn" ? <button type="button" onClick={() => setStage("holding")}>Start again</button> : null}
          </div>
          <p className={styles.verdict} role="status">
            {stage === "holding"
              ? "Nothing has happened yet."
              : stage === "melted"
                ? "The shares are burned and every leg is now owed to you as a Claim. No issuer power could stop this step, because it touched no constituent mint."
                : `${claims.filter((leg) => !frozen[leg.symbol]).length} of ${claims.length} legs delivered. ${anyFrozen ? "The frozen leg stays yours as a named Claim; it does not undo the others." : "Nothing was held back."}`}
          </p>
        </section>
      </div>
      <figcaption>
        Illustrative Formula: three constituents, 1,000 shares outstanding, quantities chosen for the example and not a live Alloy. The behaviour is the Hall&apos;s: <code>redeem</code> touches no constituent mint, and <code>withdraw</code> delivers one leg at a time (<code>docs/prd/HALL.md</code>, sections 4.3 and 4.6).
      </figcaption>
    </figure>
  );
}
